import { ENTITIES, PROJECT_ENTITIES, type EntityName, type Op, type Row } from '../../shared/schema';
import { applyOps } from './ops';
import { BadRequest, isId, OWNER_ID, toApi } from './rows';

/**
 * Project file format (inside the exported .zip as project.json; images live in images/<id>.webp).
 * The zip itself is assembled in the browser (a Worker can't hold hundreds of photos in memory).
 */
export const PORTABLE_FORMAT = 'lawhat-almashahed/1';

export interface PortableImage {
  id: string;
  width: number;
  height: number;
  placeholder: { x: number; y: number; v: number } | null;
  /** path inside the zip, or null if the image has no file (placeholder) */
  file: string | null;
}

export interface Portable {
  format: typeof PORTABLE_FORMAT;
  exportedAt: string;
  project: Row;
  rows: Partial<Record<EntityName, Row[]>>;
  images: PortableImage[];
}

/** Which other entity each reference field points to. 'image' = images table. */
const REFS: Partial<Record<EntityName, Record<string, EntityName | 'image' | 'byKind'>>> = {
  projects: { coverImageId: 'image' },
  scenes: { locationId: 'locations', coverImageId: 'image' },
  shots: { sceneId: 'scenes', coverImageId: 'image' },
  characters: { coverImageId: 'image' },
  locations: { coverImageId: 'image' },
  moodboards: { coverImageId: 'image' },
  boardCards: { refId: 'byKind' },
  inboxItems: { imageId: 'image', sceneId: 'scenes' },
  sceneCharacters: { sceneId: 'scenes', characterId: 'characters' },
  sceneLinks: { sceneId: 'scenes', refId: 'byKind' },
  itemImages: { ownerId: 'byKind', imageId: 'image' },
};
/** Reference fields without which the row is meaningless (dropped if the target is missing). */
const REQUIRED = new Set(['shots.sceneId', 'boardCards.refId', 'sceneCharacters.sceneId', 'sceneCharacters.characterId', 'sceneLinks.sceneId', 'sceneLinks.refId', 'itemImages.ownerId', 'itemImages.imageId']);
const KIND_ENTITY: Record<string, EntityName> = { note: 'notes', character: 'characters', location: 'locations', moodboard: 'moodboards', shot: 'shots' };

function kindField(entity: EntityName): string {
  return entity === 'itemImages' ? 'ownerKind' : 'kind';
}

/** Drops rows whose required references point at rows that aren't part of the set. */
function pruneDangling(rows: Partial<Record<EntityName, Row[]>>, imageIds: Set<string>): Partial<Record<EntityName, Row[]>> {
  const ids = (e: EntityName) => new Set((rows[e] ?? []).map((r) => r.id));
  const sets = Object.fromEntries(PROJECT_ENTITIES.map((e) => [e, ids(e)])) as Record<EntityName, Set<string>>;
  const exists = (target: EntityName | 'image', v: unknown) => typeof v === 'string' && (target === 'image' ? imageIds.has(v) : sets[target]?.has(v));
  const out: Partial<Record<EntityName, Row[]>> = {};
  for (const e of PROJECT_ENTITIES) {
    const refs = REFS[e] ?? {};
    out[e] = (rows[e] ?? []).filter((r) =>
      Object.entries(refs).every(([field, target]) => {
        if (!REQUIRED.has(`${e}.${field}`)) return true;
        const t = target === 'byKind' ? KIND_ENTITY[r[kindField(e)] as string] : target;
        return !!t && exists(t, r[field]);
      }),
    );
  }
  return out;
}

export async function exportProject(db: D1Database, projectId: string): Promise<Portable | null> {
  const proj = await db.prepare('SELECT * FROM projects WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').bind(projectId, OWNER_ID).first<Record<string, unknown>>();
  if (!proj) return null;
  const lists = await db.batch<Record<string, unknown>>(
    PROJECT_ENTITIES.map((e) => db.prepare(`SELECT * FROM ${ENTITIES[e].table} WHERE project_id = ? AND deleted_at IS NULL`).bind(projectId)),
  );
  let rows: Partial<Record<EntityName, Row[]>> = {};
  PROJECT_ENTITIES.forEach((e, i) => (rows[e] = lists[i].results.map((r) => toApi(e, r))));
  const imgRes = await db
    .prepare(
      `SELECT * FROM images WHERE owner_id = ?2 AND id IN (
         SELECT image_id FROM item_images WHERE project_id = ?1 AND deleted_at IS NULL
         UNION SELECT image_id FROM inbox_items WHERE project_id = ?1 AND deleted_at IS NULL AND image_id IS NOT NULL)`,
    )
    .bind(projectId, OWNER_ID)
    .all<Record<string, unknown>>();
  const images: PortableImage[] = imgRes.results.map((r) => ({
    id: r.id as string,
    width: r.width as number,
    height: r.height as number,
    placeholder: r.placeholder ? JSON.parse(r.placeholder as string) : null,
    file: r.r2_key ? `images/${r.id}.webp` : null,
  }));
  rows = pruneDangling(rows, new Set(images.map((i) => i.id)));
  const clean = (r: Row): Row => {
    const { updatedAt: _u, deletedAt: _d, ...rest } = r;
    return rest as Row;
  };
  for (const e of PROJECT_ENTITIES) rows[e] = rows[e]!.map(clean);
  return { format: PORTABLE_FORMAT, exportedAt: new Date().toISOString(), project: clean(toApi('projects', proj)), rows, images };
}

const newId = (old: string) => {
  const prefix = /^([a-z]+)-/.exec(old)?.[1] ?? 'x';
  return `${prefix}-${crypto.randomUUID().slice(0, 13)}`;
};

/**
 * Creates a NEW project from a project file (never overwrites an existing one).
 * `imageMap` maps image ids in the file → ids of images the browser already uploaded.
 * Images that only have a placeholder are recreated as placeholder rows.
 */
export async function importProject(db: D1Database, input: unknown, imageMap: Record<string, string>, opts: { keepName?: boolean } = {}): Promise<{ projectId: string; counts: Record<string, number> }> {
  const p = input as Portable;
  if (!p || typeof p !== 'object' || p.format !== PORTABLE_FORMAT || !p.project || typeof p.rows !== 'object' || !Array.isArray(p.images)) {
    throw new BadRequest('invalid project file');
  }
  for (const v of Object.values(imageMap)) if (!isId(v)) throw new BadRequest('bad image map');

  // Images: uploaded ones keep their new id; placeholder-only ones get a fresh placeholder row.
  const img = new Map<string, string>();
  const placeholderRows: { id: string; width: number; height: number; placeholder: string }[] = [];
  for (const im of p.images) {
    if (!im || !isId(im.id)) continue;
    if (imageMap[im.id]) img.set(im.id, imageMap[im.id]);
    else if (im.placeholder && typeof im.placeholder === 'object') {
      const id = `img-${crypto.randomUUID()}`;
      img.set(im.id, id);
      const { x, y, v } = im.placeholder;
      placeholderRows.push({ id, width: Number(im.width) || 0, height: Number(im.height) || 0, placeholder: JSON.stringify({ x: Number(x) || 0, y: Number(y) || 0, v: Number(v) || 0 }) });
    }
  }
  if (Object.keys(imageMap).length) {
    const found = await db.prepare('SELECT COUNT(*) AS n FROM images WHERE owner_id = ? AND id IN (SELECT value FROM json_each(?))').bind(OWNER_ID, JSON.stringify(Object.values(imageMap))).first<{ n: number }>();
    if ((found?.n ?? 0) !== new Set(Object.values(imageMap)).size) throw new BadRequest('unknown uploaded image');
  }

  const rawRows: Partial<Record<EntityName, Row[]>> = {};
  for (const e of PROJECT_ENTITIES) {
    const list = (p.rows as Record<string, unknown>)[e];
    if (list !== undefined && !Array.isArray(list)) throw new BadRequest(`invalid ${e}`);
    rawRows[e] = ((list as Row[]) ?? []).filter((r) => r && typeof r === 'object' && isId(r.id));
  }
  const rows = pruneDangling(rawRows, new Set(img.keys()));

  const projectId = newId('pr-x');
  const ids = new Map<string, string>();
  for (const e of PROJECT_ENTITIES) for (const r of rows[e]!) ids.set(r.id, newId(r.id));

  const ops: Op[] = [];
  const mapRef = (target: EntityName | 'image', v: unknown) => (typeof v !== 'string' ? null : target === 'image' ? img.get(v) ?? null : ids.get(v) ?? null);
  const fieldsOf = (entity: EntityName, r: Row) => {
    const out: Record<string, unknown> = {};
    const refs = REFS[entity] ?? {};
    for (const name of Object.keys(ENTITIES[entity].fields)) {
      if (!(name in r) || name === 'createdAt') continue;
      const target = refs[name];
      if (target) {
        const t = target === 'byKind' ? KIND_ENTITY[r[kindField(entity)] as string] : target;
        out[name] = t ? mapRef(t, r[name]) : null;
      } else out[name] = r[name];
    }
    return out;
  };

  const projFields = fieldsOf('projects', p.project);
  const name = typeof p.project.name === 'string' ? p.project.name : 'مشروع';
  projFields.name = opts.keepName ? name : `${name} (مستورد)`;
  ops.push({ op: 'create', entity: 'projects', id: projectId, fields: projFields });
  const counts: Record<string, number> = {};
  for (const e of PROJECT_ENTITIES) {
    counts[e] = rows[e]!.length;
    for (const r of rows[e]!) ops.push({ op: 'create', entity: e, id: ids.get(r.id)!, fields: { ...fieldsOf(e, r), projectId } });
  }

  if (placeholderRows.length) {
    await db
      .prepare(
        `INSERT INTO images (id, owner_id, width, height, placeholder, created_at)
         SELECT j.value->>'id', ?2, j.value->>'width', j.value->>'height', j.value->>'placeholder', ?3 FROM json_each(?1) j`,
      )
      .bind(JSON.stringify(placeholderRows), OWNER_ID, Date.now())
      .run();
  }
  await applyOps(db, ops);
  return { projectId, counts };
}
