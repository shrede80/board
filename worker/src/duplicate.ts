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
];
const LINKED_KINDS = "('note','character','location','moodboard')";

const rid = (prefix: string) => `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
/** Value of the id map for a column (NULL when the target wasn't copied). */
const mapped = (col: string) => `json_extract(?1, '$."' || ${col} || '"')`;

export async function duplicateProject(db: D1Database, projectId: string, opts: { keepStatus?: boolean } = {}): Promise<{ projectId: string }> {
  const proj = await db.prepare('SELECT name FROM projects WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').bind(projectId, OWNER_ID).first<{ name: string }>();
  if (!proj) throw new BadRequest('unknown project');

  // One query for every id to copy (live rows only).
  const live = (t: string) => `(SELECT json_group_array(id) FROM ${t} WHERE project_id = ?1 AND deleted_at IS NULL) AS ${t}`;
  const ids = await db.prepare(`SELECT ${COPIED.map((c) => live(ENTITIES[c.entity].table)).join(', ')}`).bind(projectId).first<Record<string, string>>();
  const map: Record<string, string> = {};
  for (const c of COPIED) for (const id of JSON.parse(ids?.[ENTITIES[c.entity].table] ?? '[]') as string[]) map[id] = rid(c.prefix);
  const newId = rid('pr');
  const now = Date.now();
  const json = JSON.stringify(map);

  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO projects (id, owner_id, name, template, aspect, cover_image_id, created_at, client, shoot_date, shoot_time, stage, archived, updated_at)
       SELECT ?1, owner_id, name || ' (نسخة)', template, aspect, cover_image_id, ?3, client, NULL, NULL, 'prep', 0, ?3 FROM projects WHERE id = ?2`,
    ).bind(newId, projectId, now),
  ];

  /** Column expression for the copy (references remapped). */
  const expr = (entity: EntityName, col: string): string => {
    if (col === 'project_id') return '?2';
    if (entity === 'scenes' && col === 'location_id') return mapped('location_id');
    if (entity === 'shots' && col === 'scene_id') return mapped('scene_id');
    if (entity === 'shots' && col === 'status') return `CASE WHEN ?4 THEN status ELSE 'planned' END`;
    if (entity === 'boardCards' && col === 'ref_id') return `CASE WHEN kind IN ${LINKED_KINDS} THEN ${mapped('ref_id')} ELSE ref_id END`;
    if (entity === 'itemImages' && col === 'owner_id') return mapped('owner_id');
    return col;
  };
  /** Rows whose required reference wasn't copied (e.g. a shot of a deleted scene) are skipped. */
  const where: Partial<Record<EntityName, string>> = {
    shots: `${mapped('scene_id')} IS NOT NULL`,
    boardCards: `(kind NOT IN ${LINKED_KINDS} OR ${mapped('ref_id')} IS NOT NULL)`,
    itemImages: `${mapped('owner_id')} IS NOT NULL`,
  };
  for (const c of COPIED) {
    const def = ENTITIES[c.entity];
    const cols = Object.values(def.fields as Record<string, FieldDef>).map((f) => f.col);
    stmts.push(
      db.prepare(
        `INSERT INTO ${def.table} (id, ${cols.join(', ')}, updated_at)
         SELECT ${mapped('id')}, ${cols.map((col) => expr(c.entity, col)).join(', ')}, ?3
         FROM ${def.table} WHERE project_id = ?5 AND deleted_at IS NULL${where[c.entity] ? ` AND ${where[c.entity]}` : ''}`,
      ).bind(json, newId, now, opts.keepStatus ? 1 : 0, projectId),
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
