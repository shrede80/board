import { ENTITIES, OWNER_SYNC, PROJECT_ENTITIES, type Changes, type EntityName, type Row, type Settings, type Snapshot, type TrashEntry } from '../../shared/schema';
import { OWNER_ID, toApi } from './rows';

export interface ImageMeta {
  id: string;
  width: number;
  height: number;
  placeholder: { x: number; y: number; v: number } | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  template: string;
  aspect: string;
  updatedAt: number;
  createdAt: number;
  scenes: number;
  shots: number;
  durationS: number;
  coverImageId: string | null;
  coverPlaceholder: ImageMeta['placeholder'];
  coverMood: string | null;
  /** locations in the library (for «التصوير القادم») */
  locations: number;
  client: string;
  shootDate: string | null;
  shootTime: string | null;
  stage: string;
  archived: boolean;
  /** shots by status (for the progress bar) */
  shotsShot: number;
  shotsApproved: number;
}

export async function getSettings(db: D1Database): Promise<Settings> {
  const s = await db.prepare('SELECT * FROM settings WHERE owner_id = ?').bind(OWNER_ID).first<Record<string, unknown>>();
  return settingsToApi(s);
}

export function settingsToApi(s: Record<string, unknown> | null): Settings {
  return {
    theme: s?.theme === 'dark' ? 'dark' : 'light',
    boardSnap: s ? s.board_snap === 1 : true,
    lastProjectId: (s?.last_project_id as string) ?? null,
    lastBackupAt: (s?.last_backup_at as number) ?? null,
    equipmentRoles: s ? JSON.parse(s.equipment_roles as string) : {},
    equipmentCategories: s ? JSON.parse(s.equipment_categories as string) : [],
  };
}

async function selectRows(db: D1Database, entity: EntityName, where: string, ...binds: unknown[]): Promise<Row[]> {
  const res = await db.prepare(`SELECT * FROM ${ENTITIES[entity].table} WHERE ${where}`).bind(...binds).all<Record<string, unknown>>();
  return res.results.map((r) => toApi(entity, r));
}

function imagesToApi(rows: Record<string, unknown>[]): ImageMeta[] {
  return rows.map((r) => ({
    id: r.id as string,
    width: r.width as number,
    height: r.height as number,
    placeholder: r.placeholder ? JSON.parse(r.placeholder as string) : null,
  }));
}

/** Image metadata of everything a project shows + every live idea (EXISTS, not UNION: D1 limits compound selects). */
function imagesFor(db: D1Database, projectId: string | null) {
  const project = projectId
    ? `EXISTS (SELECT 1 FROM item_images x WHERE x.project_id = ?1 AND x.image_id = i.id)
       OR EXISTS (SELECT 1 FROM board_cards x WHERE x.project_id = ?1 AND x.kind = 'image' AND x.ref_id = i.id)
       OR EXISTS (SELECT 1 FROM inbox_items x WHERE x.project_id = ?1 AND x.image_id = i.id) OR `
    : '';
  return db
    .prepare(
      `SELECT * FROM images i WHERE i.owner_id = ?2 AND (${project}
         EXISTS (SELECT 1 FROM ideas d, json_each(d.image_ids) j WHERE d.owner_id = ?2 AND d.deleted_at IS NULL AND j.value = i.id))`,
    )
    .bind(projectId ?? '', OWNER_ID);
}

const ownerRows = (db: D1Database, where: string, ...binds: unknown[]) =>
  Promise.all(OWNER_SYNC.map((e) => selectRows(db, e, `owner_id = ? AND ${where}`, OWNER_ID, ...binds)));

/** Full current state of one project (deleted rows excluded). null if missing or in the trash. */
export async function snapshot(db: D1Database, projectId: string): Promise<(Snapshot & { images: ImageMeta[]; settings: Settings }) | null> {
  const now = Date.now();
  const proj = await db.prepare('SELECT * FROM projects WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').bind(projectId, OWNER_ID).first<Record<string, unknown>>();
  if (!proj) return null;
  const rows: Snapshot['rows'] = {};
  const [lists, owner, images, settings] = await Promise.all([
    Promise.all(PROJECT_ENTITIES.map((e) => selectRows(db, e, 'project_id = ? AND deleted_at IS NULL', projectId))),
    ownerRows(db, 'deleted_at IS NULL'),
    imagesFor(db, projectId).all<Record<string, unknown>>(),
    getSettings(db),
  ]);
  PROJECT_ENTITIES.forEach((e, i) => (rows[e] = lists[i]));
  OWNER_SYNC.forEach((e, i) => (rows[e] = owner[i]));
  return { now, project: toApi('projects', proj), rows, images: imagesToApi(images.results), settings };
}

/** Everything that changed since `since` (including deletions) — polled every 10 s by each device. */
export async function changes(db: D1Database, projectId: string, since: number): Promise<Changes & { images: ImageMeta[] }> {
  const now = Date.now();
  const rows: Changes['rows'] = {};
  const [proj, lists, owner, images, settingsRow] = await Promise.all([
    selectRows(db, 'projects', 'id = ? AND owner_id = ? AND updated_at > ?', projectId, OWNER_ID, since),
    Promise.all(PROJECT_ENTITIES.map((e) => selectRows(db, e, 'project_id = ? AND updated_at > ?', projectId, since))),
    ownerRows(db, 'updated_at > ?', since),
    db.prepare('SELECT * FROM images WHERE owner_id = ? AND created_at > ?').bind(OWNER_ID, since).all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM settings WHERE owner_id = ? AND updated_at > ?').bind(OWNER_ID, since).first<Record<string, unknown>>(),
  ]);
  if (proj.length) rows.projects = proj;
  PROJECT_ENTITIES.forEach((e, i) => {
    if (lists[i].length) rows[e] = lists[i];
  });
  OWNER_SYNC.forEach((e, i) => {
    if (owner[i].length) rows[e] = owner[i];
  });
  const out: Changes & { images: ImageMeta[] } = { now, rows, images: imagesToApi(images.results) };
  if (settingsRow) out.settings = settingsToApi(settingsRow);
  return out;
}

/** Home (UPDATE-1 ب1): every project row, the ideas, their images, settings — no project open. */
export async function home(db: D1Database): Promise<{ now: number; rows: Changes['rows']; images: ImageMeta[]; settings: Settings; sceneNums: Record<string, number> }> {
  const now = Date.now();
  const [projects, owner, images, settings, nums] = await Promise.all([
    selectRows(db, 'projects', 'owner_id = ? AND deleted_at IS NULL', OWNER_ID),
    ownerRows(db, 'deleted_at IS NULL'),
    imagesFor(db, null).all<Record<string, unknown>>(),
    getSettings(db),
    // number of each scene an idea points at («المشهد 04» on the idea's badge)
    db.prepare(
      `SELECT s.id, 1 + (SELECT COUNT(*) FROM scenes s2 WHERE s2.project_id = s.project_id AND s2.deleted_at IS NULL
                          AND (s2.position < s.position OR (s2.position = s.position AND s2.id < s.id))) AS n
       FROM scenes s WHERE s.deleted_at IS NULL AND s.id IN (SELECT scene_id FROM ideas WHERE owner_id = ? AND deleted_at IS NULL AND scene_id IS NOT NULL)`,
    ).bind(OWNER_ID).all<{ id: string; n: number }>(),
  ]);
  const rows: Changes['rows'] = { projects };
  OWNER_SYNC.forEach((e, i) => (rows[e] = owner[i]));
  return { now, rows, images: imagesToApi(images.results), settings, sceneNums: Object.fromEntries(nums.results.map((r) => [r.id, r.n])) };
}

/** Owner-wide changes since `since` while no project is open (Home): projects, ideas, equipment. */
export async function ownerChanges(db: D1Database, since: number): Promise<Changes & { images: ImageMeta[] }> {
  const now = Date.now();
  const [projects, owner, images, settingsRow] = await Promise.all([
    selectRows(db, 'projects', 'owner_id = ? AND updated_at > ?', OWNER_ID, since),
    ownerRows(db, 'updated_at > ?', since),
    db.prepare('SELECT * FROM images WHERE owner_id = ? AND created_at > ?').bind(OWNER_ID, since).all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM settings WHERE owner_id = ? AND updated_at > ?').bind(OWNER_ID, since).first<Record<string, unknown>>(),
  ]);
  const rows: Changes['rows'] = {};
  if (projects.length) rows.projects = projects;
  OWNER_SYNC.forEach((e, i) => {
    if (owner[i].length) rows[e] = owner[i];
  });
  const out: Changes & { images: ImageMeta[] } = { now, rows, images: imagesToApi(images.results) };
  if (settingsRow) out.settings = settingsToApi(settingsRow);
  return out;
}

export interface SearchHit {
  kind: 'project' | 'scene' | 'shot' | 'idea';
  id: string;
  projectId: string | null;
  title: string;
  sub: string;
}

/** Ctrl+K (UPDATE-1 ب1): names/clients, scene names, shot descriptions, idea text. Plain LIKE, ≤ 30 hits, 4 queries. */
export async function search(db: D1Database, q: string): Promise<SearchHit[]> {
  const term = q.trim().slice(0, 100);
  if (!term) return [];
  const like = `%${term.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
  const E = "ESCAPE '\\'";
  const [p, sc, sh, id] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT id, name, client FROM projects WHERE owner_id = ?2 AND deleted_at IS NULL AND (name LIKE ?1 ${E} OR client LIKE ?1 ${E}) ORDER BY updated_at DESC LIMIT 10`).bind(like, OWNER_ID),
    db.prepare(
      `SELECT s.id, s.name, s.project_id, p.name AS pname FROM scenes s JOIN projects p ON p.id = s.project_id
       WHERE p.owner_id = ?2 AND p.deleted_at IS NULL AND s.deleted_at IS NULL AND s.name LIKE ?1 ${E} ORDER BY s.updated_at DESC LIMIT 10`,
    ).bind(like, OWNER_ID),
    db.prepare(
      `SELECT h.id, h.description, h.project_id, p.name AS pname FROM shots h JOIN projects p ON p.id = h.project_id JOIN scenes s ON s.id = h.scene_id
       WHERE p.owner_id = ?2 AND p.deleted_at IS NULL AND h.deleted_at IS NULL AND s.deleted_at IS NULL AND h.description LIKE ?1 ${E} ORDER BY h.updated_at DESC LIMIT 10`,
    ).bind(like, OWNER_ID),
    db.prepare(`SELECT id, text, project_id FROM ideas WHERE owner_id = ?2 AND deleted_at IS NULL AND text LIKE ?1 ${E} ORDER BY created_at DESC LIMIT 10`).bind(like, OWNER_ID),
  ]);
  const hits: SearchHit[] = [
    ...p.results.map((r) => ({ kind: 'project' as const, id: r.id as string, projectId: r.id as string, title: r.name as string, sub: (r.client as string) || '' })),
    ...sc.results.map((r) => ({ kind: 'scene' as const, id: r.id as string, projectId: r.project_id as string, title: r.name as string, sub: r.pname as string })),
    ...sh.results.map((r) => ({ kind: 'shot' as const, id: r.id as string, projectId: r.project_id as string, title: r.description as string, sub: r.pname as string })),
    ...id.results.map((r) => ({ kind: 'idea' as const, id: r.id as string, projectId: (r.project_id as string) ?? null, title: r.text as string, sub: '' })),
  ];
  return hits.slice(0, 30);
}

export async function listProjects(db: D1Database): Promise<ProjectSummary[]> {
  const res = await db
    .prepare(
      `SELECT p.id, p.name, p.template, p.aspect, p.updated_at, p.created_at, p.client, p.shoot_date, p.shoot_time, p.stage, p.archived,
         (SELECT COUNT(*) FROM shots h JOIN scenes s ON s.id = h.scene_id
            WHERE h.project_id = p.id AND h.deleted_at IS NULL AND s.deleted_at IS NULL AND h.status = 'shot') AS shots_shot,
         (SELECT COUNT(*) FROM shots h JOIN scenes s ON s.id = h.scene_id
            WHERE h.project_id = p.id AND h.deleted_at IS NULL AND s.deleted_at IS NULL AND h.status = 'approved') AS shots_approved,
         (SELECT COUNT(*) FROM scenes s WHERE s.project_id = p.id AND s.deleted_at IS NULL) AS scenes,
         (SELECT COUNT(*) FROM shots h JOIN scenes s ON s.id = h.scene_id
            WHERE h.project_id = p.id AND h.deleted_at IS NULL AND s.deleted_at IS NULL) AS shots,
         (SELECT COALESCE(SUM(h.duration_s), 0) FROM shots h JOIN scenes s ON s.id = h.scene_id
            WHERE h.project_id = p.id AND h.deleted_at IS NULL AND s.deleted_at IS NULL) AS duration_s,
         COALESCE(p.cover_image_id, (
           SELECT COALESCE(h.cover_image_id, (SELECT ii.image_id FROM item_images ii
                    WHERE ii.owner_id = h.id AND ii.deleted_at IS NULL ORDER BY ii.position LIMIT 1))
           FROM shots h JOIN scenes s ON s.id = h.scene_id
           WHERE h.project_id = p.id AND h.deleted_at IS NULL AND s.deleted_at IS NULL
             AND EXISTS (SELECT 1 FROM item_images ii WHERE ii.owner_id = h.id AND ii.deleted_at IS NULL)
           ORDER BY s.position, h.position LIMIT 1)) AS cover_image_id,
         (SELECT s.mood FROM scenes s WHERE s.project_id = p.id AND s.deleted_at IS NULL ORDER BY s.position LIMIT 1) AS cover_mood,
         (SELECT COUNT(*) FROM locations l WHERE l.project_id = p.id AND l.deleted_at IS NULL) AS locations
       FROM projects p WHERE p.owner_id = ? AND p.deleted_at IS NULL ORDER BY p.updated_at DESC`,
    )
    .bind(OWNER_ID)
    .all<Record<string, unknown>>();
  const coverIds = res.results.map((r) => r.cover_image_id).filter(Boolean) as string[];
  const ph = new Map<string, ImageMeta['placeholder']>();
  if (coverIds.length) {
    const imgs = await db.prepare('SELECT id, placeholder FROM images WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(coverIds)).all<Record<string, unknown>>();
    for (const i of imgs.results) ph.set(i.id as string, i.placeholder ? JSON.parse(i.placeholder as string) : null);
  }
  return res.results.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    template: r.template as string,
    aspect: r.aspect as string,
    updatedAt: r.updated_at as number,
    createdAt: r.created_at as number,
    scenes: r.scenes as number,
    shots: r.shots as number,
    durationS: r.duration_s as number,
    coverImageId: (r.cover_image_id as string) ?? null,
    coverPlaceholder: r.cover_image_id ? ph.get(r.cover_image_id as string) ?? null : null,
    coverMood: (r.cover_mood as string) ?? null,
    locations: r.locations as number,
    client: (r.client as string) ?? '',
    shootDate: (r.shoot_date as string) ?? null,
    shootTime: (r.shoot_time as string) ?? null,
    stage: (r.stage as string) ?? 'prep',
    archived: r.archived === 1,
    shotsShot: r.shots_shot as number,
    shotsApproved: r.shots_approved as number,
  }));
}

export async function listTrash(db: D1Database): Promise<(TrashEntry & { projectName: string })[]> {
  const res = await db
    .prepare(
      `SELECT t.*, COALESCE(p.name, '') AS project_name FROM trash t LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.owner_id = ? ORDER BY t.deleted_at DESC`,
    )
    .bind(OWNER_ID)
    .all<Record<string, unknown>>();
  return res.results.map((r) => ({
    id: r.id as string,
    projectId: (r.project_id as string) ?? null,
    kind: r.kind as string,
    refId: r.ref_id as string,
    label: r.label as string,
    deletedAt: r.deleted_at as number,
    extra: r.extra as number,
    projectName: r.project_name as string,
  }));
}

/** Free-text values typed via «اكتب قيمة جديدة…», shown later under «استُخدمت سابقاً». */
export async function customValues(db: D1Database): Promise<Record<string, string[]>> {
  const q = (col: string) =>
    db.prepare(
      `SELECT DISTINCT ${col} AS v FROM shots WHERE deleted_at IS NULL AND ${col} IS NOT NULL AND ${col} != ''
       AND ${col} NOT IN (SELECT id FROM equipment) ORDER BY updated_at DESC LIMIT 50`,
    );
  const multi = (col: string) =>
    db.prepare(
      `SELECT DISTINCT j.value AS v FROM shots, json_each(shots.${col}) j WHERE shots.deleted_at IS NULL
       AND j.value NOT IN (SELECT id FROM equipment) LIMIT 50`,
    );
  const [camera, rig, filter, motion, size, angle, lens, lighting, audio] = await db.batch<{ v: string }>([
    q('camera_id'), q('rig_id'), q('filter'), q('motion'), q('size'), q('angle'), q('lens'), multi('lighting_ids'), multi('audio_ids'),
  ]);
  const pick = (r: D1Result<{ v: string }>) => r.results.map((x) => x.v);
  return {
    camera: pick(camera), support: pick(rig), filter: pick(filter), movement: pick(motion), size: pick(size), angle: pick(angle),
    lens: pick(lens), lighting: pick(lighting), audio: pick(audio),
  };
}
