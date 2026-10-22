import { ENTITIES, type EntityName, type FieldDef } from '../../shared/schema';
import { BadRequest, OWNER_ID } from './rows';

/**
 * «تكرار المشروع» (UPDATE-1 أ1): a full copy with new ids, done in the database with
 * INSERT … SELECT so even 40 scenes / 300 shots stay at ~15 queries (free plan: ≤ 50).
 *
 * - images are shared by reference (same image ids, nothing copied in R2);
 * - shot statuses go back to «مخططة» unless keepStatus;
 * - stage = prep, no shoot day/time, not archived, name «… (نسخة)»;
 * - ideas / inbox items are not copied.
 * Ids of link rows keep the client's composite convention (scene:character, scene:kind:ref)
 * so unlinking works on the copy.
 */

/** Tables copied row by row with a fresh id (order matters only for readability). */
const COPIED: { entity: EntityName; prefix: string }[] = [
  { entity: 'scenes', prefix: 'sc' },
  { entity: 'shots', prefix: 'sh' },
  { entity: 'characters', prefix: 'ch' },
  { entity: 'locations', prefix: 'loc' },
  { entity: 'moodboards', prefix: 'mb' },
  { entity: 'notes', prefix: 'note' },
  { entity: 'boardCards', prefix: 'bc' },
  { entity: 'itemImages', prefix: 'ii' },
  { entity: 'planItems', prefix: 'pl' },
];
const LINKED_KINDS = "('note','character','location','moodboard')";

const rid = (prefix: string) => `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
/** Value of the id map for a column (NULL when the target wasn't copied). */
const mapped = (col: string) => `json_extract(?1, '$."' || ${col} || '"')`;

export interface CopyOpts {
  keepStatus?: boolean;
  /** name of the copy (default «… (نسخة)») */
  name?: string;
  /** what the copy is: a normal project (null, default), or a saved template (UPDATE-3 §7) */
  templateKind?: 'project' | 'scene' | null;
  /** copy only this scene with its shots, plan, images, characters and location(s) (scene template) */
  sceneId?: string;
}

/**
 * Also the saved templates (UPDATE-3 §7): «احفظ كقالب» is the same copy marked as a template,
 * without the client and shoot day, shot statuses back to «مخططة»; «مشروع جديد من القالب» is a
 * copy back to a normal project; a scene template copies one scene and what it links to.
 */
export async function duplicateProject(db: D1Database, projectId: string, opts: CopyOpts = {}): Promise<{ projectId: string }> {
  const proj = await db.prepare('SELECT name, template_kind FROM projects WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').bind(projectId, OWNER_ID).first<{ name: string; template_kind: string | null }>();
  if (!proj) throw new BadRequest('unknown project');
  const kind = opts.templateKind ?? null;
  const keepStatus = !!opts.keepStatus && !kind;

  // One query for every id to copy (live rows only).
  const live = (t: string) => `(SELECT json_group_array(id) FROM ${t} WHERE project_id = ?1 AND deleted_at IS NULL) AS ${t}`;
  // a scene template: the scene, its shots and plan, its characters and location, and their photos
  const one: Partial<Record<EntityName, string>> = {
    scenes: 'id = ?2',
    shots: 'scene_id = ?2',
    planItems: 'scene_id = ?2',
    characters: `id IN (SELECT character_id FROM scene_characters WHERE scene_id = ?2 AND deleted_at IS NULL)`,
    locations: 'id = (SELECT location_id FROM scenes WHERE id = ?2)',
    // photos follow their owner: rows whose owner isn't copied are skipped by the insert below
    itemImages: '1',
  };
  const pick = (c: { entity: EntityName }) => {
    const t = ENTITIES[c.entity].table;
    if (!opts.sceneId) return live(t);
    const w = one[c.entity];
    return w ? `(SELECT json_group_array(id) FROM ${t} WHERE project_id = ?1 AND deleted_at IS NULL AND ${w}) AS ${t}` : `'[]' AS ${t}`;
  };
  const ids = await db.prepare(`SELECT ${COPIED.map(pick).join(', ')}`).bind(...(opts.sceneId ? [projectId, opts.sceneId] : [projectId])).first<Record<string, string>>();
  const map: Record<string, string> = {};
  for (const c of COPIED) for (const id of JSON.parse(ids?.[ENTITIES[c.entity].table] ?? '[]') as string[]) map[id] = rid(c.prefix);
  if (opts.sceneId && !(JSON.parse(ids?.scenes ?? '[]') as string[]).length) throw new BadRequest('unknown scene');
  const newId = rid('pr');
  const now = Date.now();
  const json = JSON.stringify(map);
  const name = opts.name?.trim().slice(0, 200) || `${proj.name} (نسخة)`;

  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO projects (id, owner_id, name, template, aspect, cover_image_id, created_at, client, shoot_date, shoot_time, stage, archived, template_kind, updated_at)
       SELECT ?1, owner_id, ?4, template, aspect, ${opts.sceneId ? 'NULL' : 'cover_image_id'}, ?3, CASE WHEN ?5 IS NULL THEN client ELSE '' END, NULL, NULL, 'prep', 0, ?5, ?3 FROM projects WHERE id = ?2`,
    ).bind(newId, projectId, now, name, kind),
  ];

  /** Column expression for the copy (references remapped). */
  const expr = (entity: EntityName, col: string): string => {
    if (col === 'project_id') return '?2';
    if (entity === 'scenes' && col === 'location_id') return mapped('location_id');
    if (entity === 'shots' && col === 'scene_id') return mapped('scene_id');
    if (entity === 'shots' && col === 'status') return `CASE WHEN ?4 THEN status ELSE 'planned' END`;
    if (entity === 'boardCards' && col === 'ref_id') return `CASE WHEN kind IN ${LINKED_KINDS} THEN ${mapped('ref_id')} ELSE ref_id END`;
    if (entity === 'itemImages' && col === 'owner_id') return mapped('owner_id');
    if (entity === 'planItems' && col === 'scene_id') return mapped('scene_id');
    if (entity === 'planItems' && col === 'ref_id') return `CASE WHEN kind = 'person' THEN ${mapped('ref_id')} ELSE ref_id END`;
    return col;
  };
  /** Rows whose required reference wasn't copied (e.g. a shot of a deleted scene) are skipped. */
  const where: Partial<Record<EntityName, string>> = {
    shots: `${mapped('scene_id')} IS NOT NULL`,
    boardCards: `(kind NOT IN ${LINKED_KINDS} OR ${mapped('ref_id')} IS NOT NULL)`,
    itemImages: `${mapped('owner_id')} IS NOT NULL`,
    planItems: `${mapped('scene_id')} IS NOT NULL`,
  };
  for (const c of COPIED) {
    const def = ENTITIES[c.entity];
    const cols = Object.values(def.fields as Record<string, FieldDef>).map((f) => f.col);
    stmts.push(
      db.prepare(
        `INSERT INTO ${def.table} (id, ${cols.join(', ')}, updated_at)
         SELECT ${mapped('id')}, ${cols.map((col) => expr(c.entity, col)).join(', ')}, ?3
         FROM ${def.table} WHERE project_id = ?5 AND deleted_at IS NULL AND ${mapped('id')} IS NOT NULL${where[c.entity] ? ` AND ${where[c.entity]}` : ''}`,
      ).bind(json, newId, now, keepStatus ? 1 : 0, projectId),
    );
  }
  // Link rows: ids follow the client's composite convention.
  stmts.push(
    db.prepare(
      `INSERT INTO scene_characters (id, project_id, scene_id, character_id, updated_at)
       SELECT ${mapped('scene_id')} || ':' || ${mapped('character_id')}, ?2, ${mapped('scene_id')}, ${mapped('character_id')}, ?3
       FROM scene_characters WHERE project_id = ?4 AND deleted_at IS NULL AND ${mapped('scene_id')} IS NOT NULL AND ${mapped('character_id')} IS NOT NULL`,
    ).bind(json, newId, now, projectId),
    db.prepare(
      `INSERT INTO scene_links (id, project_id, scene_id, kind, ref_id, updated_at)
       SELECT ${mapped('scene_id')} || ':' || kind || ':' || ${mapped('ref_id')}, ?2, ${mapped('scene_id')}, kind, ${mapped('ref_id')}, ?3
       FROM scene_links WHERE project_id = ?4 AND deleted_at IS NULL AND ${mapped('scene_id')} IS NOT NULL AND ${mapped('ref_id')} IS NOT NULL`,
    ).bind(json, newId, now, projectId),
  );
  await db.batch(stmts);
  return { projectId: newId };
}
