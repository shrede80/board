import { ENTITIES, PROJECT_ENTITIES, type Changes, type EntityName, type Row, type Settings, type Snapshot, type TrashEntry } from '../../shared/schema';
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

/** Full current state of one project (deleted rows excluded). null if missing or in the trash. */
export async function snapshot(db: D1Database, projectId: string): Promise<(Snapshot & { images: ImageMeta[]; settings: Settings }) | null> {
  const now = Date.now();
  const proj = await db.prepare('SELECT * FROM projects WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').bind(projectId, OWNER_ID).first<Record<string, unknown>>();
  if (!proj) return null;
  const rows: Snapshot['rows'] = {};
  const [lists, equipment, images, settings] = await Promise.all([
    Promise.all(PROJECT_ENTITIES.map((e) => selectRows(db, e, 'project_id = ? AND deleted_at IS NULL', projectId))),
    selectRows(db, 'equipment', 'owner_id = ? AND deleted_at IS NULL ORDER BY position', OWNER_ID),
    db.prepare(
      `SELECT * FROM images WHERE owner_id = ?2 AND id IN (
         SELECT image_id FROM item_images WHERE project_id = ?1
         UNION SELECT image_id FROM inbox_items WHERE project_id = ?1 AND image_id IS NOT NULL)`,
    ).bind(projectId, OWNER_ID).all<Record<string, unknown>>(),
    getSettings(db),
  ]);
  PROJECT_ENTITIES.forEach((e, i) => (rows[e] = lists[i]));
  rows.equipment = equipment;
  return { now, project: toApi('projects', proj), rows, images: imagesToApi(images.results), settings };
}

/** Everything that changed since `since` (including deletions) — polled every 10 s by each device. */
export async function changes(db: D1Database, projectId: string, since: number): Promise<Changes & { images: ImageMeta[] }> {
  const now = Date.now();
  const rows: Changes['rows'] = {};
  const [proj, lists, equipment, images, settingsRow] = await Promise.all([
    selectRows(db, 'projects', 'id = ? AND owner_id = ? AND updated_at > ?', projectId, OWNER_ID, since),
    Promise.all(PROJECT_ENTITIES.map((e) => selectRows(db, e, 'project_id = ? AND updated_at > ?', projectId, since))),
    selectRows(db, 'equipment', 'owner_id = ? AND updated_at > ?', OWNER_ID, since),
    db.prepare('SELECT * FROM images WHERE owner_id = ? AND created_at > ?').bind(OWNER_ID, since).all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM settings WHERE owner_id = ? AND updated_at > ?').bind(OWNER_ID, since).first<Record<string, unknown>>(),
  ]);
  if (proj.length) rows.projects = proj;
  PROJECT_ENTITIES.forEach((e, i) => {
    if (lists[i].length) rows[e] = lists[i];
  });
  if (equipment.length) rows.equipment = equipment;
  const out: Changes & { images: ImageMeta[] } = { now, rows, images: imagesToApi(images.results) };
  if (settingsRow) out.settings = settingsToApi(settingsRow);
  return out;
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
         (SELECT s.mood FROM scenes s WHERE s.project_id = p.id AND s.deleted_at IS NULL ORDER BY s.position LIMIT 1) AS cover_mood
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
