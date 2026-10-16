import { ENTITIES, isEntityName, type EntityName, type FieldDef, type Op, type OpsResult } from '../../shared/schema';
import { BadRequest, encodeField, isId, OWNER_ID } from './rows';

/**
 * Applies a list of writes atomically (one D1 batch = one transaction).
 *
 * Ops of the same kind on the same entity (and, for updates, the same set of fields) are
 * grouped into a single statement fed by `json_each(?)`, so a batch costs a handful of
 * queries no matter how many rows it touches (D1 counts every statement).
 */
const MAX_OPS = 2000;
/** Tables whose rows can carry a trash_id. */
const TRASH_TABLES = Object.values(ENTITIES).map((e) => e.table);

type Bound = string | number | null;
interface Prepared {
  creates: Map<EntityName, Record<string, Bound>[]>;
  updates: Map<string, { entity: EntityName; cols: string[]; rows: Record<string, Bound>[] }>;
  deletes: Map<EntityName, { id: string; tid: string | null; label: string }[]>;
  /** soft deletes without trash: non-trashable deletes and discards */
  discards: Map<EntityName, { id: string; tid: string | null; label: string }[]>;
  undeletes: Map<EntityName, string[]>;
  restores: string[];
}

export function parseOps(input: unknown): Op[] {
  if (!Array.isArray(input)) throw new BadRequest('ops must be an array');
  if (input.length > MAX_OPS) throw new BadRequest('too many ops');
  return parseRaw(input).map(legacyInbox);
}

/**
 * The inbox became the ideas box (UPDATE-1 §2.2). A device still running the old version may
 * write inboxItems: store those as ideas (same id), so no idea is ever lost.
 */
function legacyInbox(op: Op): Op {
  if (op.op === 'restore' || op.entity !== 'inboxItems') return op;
  const map = (f: Record<string, unknown>, create: boolean) => {
    const out: Record<string, unknown> = {};
    if ('projectId' in f) out.projectId = f.projectId ?? null;
    if ('sceneId' in f) out.sceneId = f.sceneId ?? null;
    if ('text' in f) out.text = f.text ?? '';
    if ('isNew' in f) out.isNew = f.isNew;
    if ('imageId' in f) out.imageIds = typeof f.imageId === 'string' && f.imageId ? [f.imageId] : [];
    if (create) {
      out.source = 'phone';
      if (!('imageIds' in out)) out.imageIds = [];
    }
    return out;
  };
  switch (op.op) {
    case 'create':
    case 'update':
      return { op: op.op, entity: 'ideas', id: op.id, fields: map(op.fields, op.op === 'create') };
    case 'delete':
    case 'discard':
      // the old inbox was emptied without the trash
      return { op: 'discard', entity: 'ideas', id: op.id };
    case 'undelete':
      return { op: 'undelete', entity: 'ideas', id: op.id };
  }
}

function parseRaw(input: unknown[]): Op[] {
  return input.map((raw, i) => {
    const o = raw as Record<string, unknown>;
    if (!o || typeof o !== 'object') throw new BadRequest(`op ${i}: invalid`);
    if (o.op === 'restore') {
      if (!isId(o.trashId)) throw new BadRequest(`op ${i}: bad trashId`);
      return { op: 'restore', trashId: o.trashId };
    }
    if (typeof o.entity !== 'string' || !isEntityName(o.entity)) throw new BadRequest(`op ${i}: unknown entity`);
    if (!isId(o.id)) throw new BadRequest(`op ${i}: bad id`);
    const base = { entity: o.entity, id: o.id };
    switch (o.op) {
      case 'create':
      case 'update':
        if (!o.fields || typeof o.fields !== 'object' || Array.isArray(o.fields)) throw new BadRequest(`op ${i}: fields required`);
        return { op: o.op, ...base, fields: o.fields as Record<string, unknown> };
      case 'delete':
        if (o.trashId !== undefined && !(isId(o.trashId) && String(o.trashId).startsWith('tr-'))) throw new BadRequest(`op ${i}: bad trashId`);
        return { op: 'delete', ...base, label: typeof o.label === 'string' ? o.label.slice(0, 300) : undefined, trashId: o.trashId as string | undefined };
      case 'undelete':
      case 'discard':
        return { op: o.op, ...base };
      default:
        throw new BadRequest(`op ${i}: unknown op`);
    }
  });
}

function prepare(ops: Op[], now: number): { p: Prepared; trashIds: (string | null)[]; projectRefs: Set<string> } {
  const p: Prepared = { creates: new Map(), updates: new Map(), deletes: new Map(), discards: new Map(), undeletes: new Map(), restores: [] };
  const trashIds: (string | null)[] = [];
  const projectRefs = new Set<string>();
  let seq = 0;

  for (const op of ops) {
    trashIds.push(null);
    if (op.op === 'restore') {
      p.restores.push(op.trashId);
      continue;
    }
    const def = ENTITIES[op.entity];
    const fields = def.fields as Record<string, FieldDef>;
    if (op.op === 'create') {
      const row: Record<string, Bound> = { id: op.id };
      for (const [name, f] of Object.entries(fields)) {
        if (Object.hasOwn(op.fields, name)) row[f.col] = encodeField(op.entity, name, f, op.fields[name]);
        else if (name === 'createdAt') row[f.col] = now;
        else if (name === 'position') row[f.col] = now + seq++; // no position given: append at the end
        else if (name === 'projectId' && def.scope === 'project') throw new BadRequest(`${op.entity}: projectId required`);
        else row[f.col] = f.def === undefined ? null : encodeField(op.entity, name, f, f.def);
      }
      for (const k of Object.keys(op.fields)) if (!Object.hasOwn(fields, k)) throw new BadRequest(`${op.entity}.${k}: unknown field`);
      if (def.scope === 'project') {
        if (!isId(row.project_id)) throw new BadRequest(`${op.entity}: bad projectId`);
        projectRefs.add(row.project_id as string);
      }
      push(p.creates, op.entity, row);
    } else if (op.op === 'update') {
      const names = Object.keys(op.fields).sort();
      if (!names.length) continue;
      const row: Record<string, Bound> = { id: op.id };
      const cols: string[] = [];
      for (const name of names) {
        const f = Object.hasOwn(fields, name) ? fields[name] : undefined;
        if (!f) throw new BadRequest(`${op.entity}.${name}: unknown field`);
        if (f.createOnly) throw new BadRequest(`${op.entity}.${name}: cannot be changed`);
        row[f.col] = encodeField(op.entity, name, f, op.fields[name]);
        cols.push(f.col);
      }
      const key = `${op.entity}|${cols.join(',')}`;
      const g = p.updates.get(key) ?? { entity: op.entity, cols, rows: [] };
      g.rows.push(row);
      p.updates.set(key, g);
    } else if (op.op === 'delete' || op.op === 'discard') {
      const tid = def.trashable && op.op === 'delete' ? (op.trashId ?? `tr-${crypto.randomUUID()}`) : null;
      trashIds[trashIds.length - 1] = tid;
      push(op.op === 'delete' && def.trashable ? p.deletes : p.discards, op.entity, { id: op.id, tid, label: op.op === 'delete' ? op.label ?? '' : '' });
    } else {
      push(p.undeletes, op.entity, op.id);
    }
  }
  return { p, trashIds, projectRefs };
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}

/** Label used in the trash when the client didn't send one. */
const KIND_LABEL: Record<string, string> = {
  projects: 'مشروع', scenes: 'مشهد', shots: 'لقطة', notes: 'ملاحظة', characters: 'شخصية', locations: 'موقع', moodboards: 'لوحة مزاج', ideas: 'فكرة',
};
const NAME_COL: Record<string, string> = {
  projects: 'name', scenes: 'name', shots: 'description', notes: 'text', characters: 'name', locations: 'name', moodboards: 'title', ideas: 'text',
};

export async function applyOps(db: D1Database, ops: Op[]): Promise<OpsResult> {
  const now = Date.now();
  const { p, trashIds, projectRefs } = prepare(ops, now);

  if (projectRefs.size) {
    const ids = [...projectRefs];
    const found = await db
      .prepare('SELECT id FROM projects WHERE owner_id = ? AND id IN (SELECT value FROM json_each(?))')
      .bind(OWNER_ID, JSON.stringify(ids))
      .all<{ id: string }>();
    // A project created in this same batch counts as existing.
    const creating = new Set((p.creates.get('projects') ?? []).map((r) => r.id as string));
    const ok = new Set(found.results.map((r) => r.id));
    for (const id of ids) if (!ok.has(id) && !creating.has(id)) throw new BadRequest(`unknown project ${id}`);
  }

  if (p.restores.length) {
    // A shot restored into a scene that is itself deleted would be invisible and stranded:
    // bring the scene back too (with the trash entry it went away in).
    const parents = await db
      .prepare(
        `SELECT DISTINCT s.id, s.trash_id FROM shots h JOIN scenes s ON s.id = h.scene_id
         WHERE h.trash_id IN (SELECT value FROM json_each(?1)) AND s.deleted_at IS NOT NULL`,
      )
      .bind(JSON.stringify(p.restores))
      .all<{ id: string; trash_id: string | null }>();
    for (const r of parents.results) {
      if (r.trash_id && !p.restores.includes(r.trash_id)) p.restores.push(r.trash_id);
      if (!r.trash_id) push(p.undeletes, 'scenes', r.id);
    }
  }

  const stmts: D1PreparedStatement[] = [];
  const touched = new Map<EntityName, string[]>();
  const touch = (entity: EntityName, ids: string[]) => {
    if (ENTITIES[entity].scope === 'project') touched.set(entity, [...(touched.get(entity) ?? []), ...ids]);
  };

  for (const [entity, rows] of p.creates) {
    const def = ENTITIES[entity];
    const cols = Object.values(def.fields as Record<string, FieldDef>).map((f) => f.col);
    const owner = def.scope === 'owner';
    const insertCols = ['id', ...(owner ? ['owner_id'] : []), ...cols, 'updated_at', 'deleted_at', 'trash_id'];
    const select = [
      "j.value->>'id'",
      ...(owner ? ['?2'] : []),
      ...cols.map((c) => `j.value->>'${c}'`),
      '?3', 'NULL', 'NULL',
    ];
    const updatable = cols.filter((c) => c !== 'created_at');
    const sql =
      `INSERT INTO ${def.table} (${insertCols.join(',')}) SELECT ${select.join(',')} FROM json_each(?1) j WHERE true ` +
      `ON CONFLICT(id) DO UPDATE SET ${updatable.map((c) => `${c}=excluded.${c}`).join(',')}, updated_at=MAX(${def.table}.updated_at + 1, excluded.updated_at), deleted_at=NULL, trash_id=NULL` +
      (owner ? ' WHERE owner_id = excluded.owner_id' : '');
    stmts.push(db.prepare(sql).bind(JSON.stringify(rows), OWNER_ID, now));
    touch(entity, rows.map((r) => r.id as string));
  }

  for (const { entity, cols, rows } of p.updates.values()) {
    const def = ENTITIES[entity];
    const sets = cols.map((c) => `${c} = j.value->>'${c}'`).join(', ');
    const sql =
      `UPDATE ${def.table} SET ${sets}, updated_at = MAX(${def.table}.updated_at + 1, ?2) FROM json_each(?1) j WHERE ${def.table}.id = j.value->>'id'` +
      (def.scope === 'owner' ? ` AND ${def.table}.owner_id = ?3` : '');
    stmts.push(db.prepare(sql).bind(JSON.stringify(rows), now, ...(def.scope === 'owner' ? [OWNER_ID] : [])));
    touch(entity, rows.map((r) => r.id as string));
  }

  for (const [entity, list] of p.deletes) {
    const def = ENTITIES[entity];
    const T = def.table;
    const json = JSON.stringify(list);
    const ownerCond = def.scope === 'owner' ? ` AND ${T}.owner_id = '${OWNER_ID}'` : '';
    {
      const projectCol = entity === 'projects' ? `${T}.id` : `${T}.project_id`;
      const nameCol = NAME_COL[entity] ?? 'id';
      const extra = entity === 'scenes' ? `(SELECT COUNT(*) FROM shots s WHERE s.scene_id = ${T}.id AND s.deleted_at IS NULL)` : '0';
      stmts.push(
        db.prepare(
          `INSERT INTO trash (id, owner_id, project_id, kind, ref_id, label, extra, deleted_at)
           SELECT j.value->>'tid', ?2, ${projectCol}, '${entity}', ${T}.id,
                  COALESCE(NULLIF(j.value->>'label', ''), '${KIND_LABEL[entity] ?? ''}: ' || ${T}.${nameCol}), ${extra}, ?3
           FROM json_each(?1) j JOIN ${T} ON ${T}.id = j.value->>'id' WHERE ${T}.deleted_at IS NULL${ownerCond}`,
        ).bind(json, OWNER_ID, now),
      );
      if (entity === 'scenes') {
        stmts.push(
          db.prepare(
            `UPDATE shots SET deleted_at = ?2, updated_at = MAX(updated_at + 1, ?2), trash_id = j.value->>'tid'
             FROM json_each(?1) j WHERE shots.scene_id = j.value->>'id' AND shots.deleted_at IS NULL`,
          ).bind(json, now),
        );
      }
      if (entity === 'notes' || entity === 'characters' || entity === 'locations' || entity === 'moodboards') {
        stmts.push(
          db.prepare(
            `UPDATE board_cards SET deleted_at = ?2, updated_at = MAX(updated_at + 1, ?2), trash_id = j.value->>'tid'
             FROM json_each(?1) j WHERE board_cards.ref_id = j.value->>'id' AND board_cards.deleted_at IS NULL`,
          ).bind(json, now),
        );
      }
      stmts.push(
        db.prepare(
          `UPDATE ${T} SET deleted_at = ?2, updated_at = MAX(updated_at + 1, ?2), trash_id = j.value->>'tid'
           FROM json_each(?1) j WHERE ${T}.id = j.value->>'id' AND ${T}.deleted_at IS NULL${ownerCond}`,
        ).bind(json, now),
      );
    }
    touch(entity, list.map((l) => l.id));
  }

  for (const [entity, list] of p.discards) {
    const def = ENTITIES[entity];
    const T = def.table;
    const ownerCond = def.scope === 'owner' ? ` AND ${T}.owner_id = '${OWNER_ID}'` : '';
    stmts.push(
      db.prepare(
        `UPDATE ${T} SET deleted_at = ?2, updated_at = MAX(updated_at + 1, ?2)
         WHERE id IN (SELECT value->>'id' FROM json_each(?1)) AND deleted_at IS NULL${ownerCond}`,
      ).bind(JSON.stringify(list), now),
    );
    touch(entity, list.map((l) => l.id));
  }

  for (const [entity, ids] of p.undeletes) {
    const T = ENTITIES[entity].table;
    stmts.push(
      db.prepare(`UPDATE ${T} SET deleted_at = NULL, updated_at = MAX(updated_at + 1, ?2) WHERE id IN (SELECT value FROM json_each(?1)) AND trash_id IS NULL`)
        .bind(JSON.stringify(ids), now),
    );
    touch(entity, ids);
  }

  if (p.restores.length) {
    const json = JSON.stringify(p.restores);
    for (const T of TRASH_TABLES) {
      stmts.push(
        db.prepare(`UPDATE ${T} SET deleted_at = NULL, trash_id = NULL, updated_at = MAX(updated_at + 1, ?2) WHERE trash_id IN (SELECT value FROM json_each(?1))`)
          .bind(json, now),
      );
    }
    stmts.push(db.prepare('DELETE FROM trash WHERE owner_id = ?2 AND id IN (SELECT value FROM json_each(?1))').bind(json, OWNER_ID));
  }

  // Keep projects.updated_at as "last modified" for the project list.
  for (const [entity, ids] of touched) {
    const T = ENTITIES[entity].table;
    stmts.push(
      db.prepare(`UPDATE projects SET updated_at = MAX(updated_at + 1, ?2) WHERE id IN (SELECT project_id FROM ${T} WHERE id IN (SELECT value FROM json_each(?1)))`)
        .bind(JSON.stringify([...new Set(ids)]), now),
    );
  }

  if (stmts.length) await db.batch(stmts);
  // Report only trash entries that really exist (the row may already have been deleted elsewhere).
  const asked = trashIds.filter(Boolean) as string[];
  if (asked.length) {
    const have = await db.prepare('SELECT id FROM trash WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(asked)).all<{ id: string }>();
    const ok = new Set(have.results.map((r) => r.id));
    return { now, trashIds: trashIds.map((t) => (t && ok.has(t) ? t : null)) };
  }
  return { now, trashIds };
}
