/**
 * Entity registry shared by the Worker (SQL, validation) and the web app (types, sync).
 * API field names are camelCase; columns are snake_case.
 *
 * Every entity row carries `updatedAt` (server ms) and `deletedAt` (soft delete).
 * Project-scoped entities carry `projectId`; owner-scoped ones are global to the user.
 */

export type FieldType = 'text' | 'int' | 'real' | 'bool' | 'json';

export interface FieldDef {
  col: string;
  type: FieldType;
  /** Allowed values for enum-like text fields. */
  values?: readonly string[];
  /** Field may only be set on create (e.g. projectId). */
  createOnly?: boolean;
  /** Default used on create when omitted. */
  def?: unknown;
}

export interface EntityDef {
  table: string;
  scope: 'project' | 'owner';
  /** Deleting puts the row into the 30-day trash (restorable). Others are tombstoned only. */
  trashable: boolean;
  fields: Record<string, FieldDef>;
}

const t = (col: string, def: unknown = ''): FieldDef => ({ col, type: 'text', def });
const tn = (col: string): FieldDef => ({ col, type: 'text', def: null });
const r = (col: string, def: unknown = 0): FieldDef => ({ col, type: 'real', def });
const j = (col: string, def: unknown = []): FieldDef => ({ col, type: 'json', def });
const b = (col: string, def = false): FieldDef => ({ col, type: 'bool', def });
const e = (col: string, values: readonly string[], def: string): FieldDef => ({ col, type: 'text', values, def });
const pid: FieldDef = { col: 'project_id', type: 'text', createOnly: true };

export const ASPECTS = ['16:9', '9:16', '1:1', '2.39:1'] as const;
export const STATUSES = ['planned', 'shot', 'approved'] as const;
export const TEMPLATE_IDS = ['ad', 'clip', 'short', 'doc', 'blank'] as const;
/** heading/frame cards have no referenced row: their ref_id is '' (UPDATE-1 §2.1). image: ref_id = images.id. */
export const CARD_KINDS = ['note', 'character', 'location', 'moodboard', 'image', 'heading', 'frame'] as const;
export const STAGES = ['idea', 'prep', 'shoot', 'post', 'done'] as const;
/** Colour keys for notes, frames and headings (same keys as the scene moods). */
export const COLOR_KEYS = ['gold', 'amber', 'sand', 'clay', 'night', 'olive', 'wine', 'cool'] as const;
export const IMAGE_OWNERS = ['shot', 'character', 'location', 'moodboard'] as const;

export const ENTITIES = {
  projects: {
    table: 'projects', scope: 'owner', trashable: true,
    fields: {
      name: t('name', 'مشروع جديد'),
      template: e('template', TEMPLATE_IDS, 'blank'),
      aspect: e('aspect', ASPECTS, '16:9'),
      coverImageId: tn('cover_image_id'),
      createdAt: { col: 'created_at', type: 'int', createOnly: true },
      client: t('client'),
      /** YYYY-MM-DD */
      shootDate: tn('shoot_date'),
      /** HH:MM */
      shootTime: tn('shoot_time'),
      stage: e('stage', STAGES, 'prep'),
      archived: b('archived'),
    },
  },
  scenes: {
    table: 'scenes', scope: 'project', trashable: true,
    fields: {
      projectId: pid,
      position: r('position'),
      name: t('name', 'مشهد جديد'),
      intExt: e('int_ext', ['int', 'ext'], 'ext'),
      dayNight: e('day_night', ['day', 'night'], 'day'),
      locationId: tn('location_id'),
      summary: t('summary'),
      goal: t('goal'),
      mood: t('mood', 'sand'),
      coverImageId: tn('cover_image_id'),
      boardX: r('board_x'),
      boardY: r('board_y'),
      /** null = default width 280 */
      boardW: { col: 'board_w', type: 'real', def: null },
      boardZ: r('board_z'),
      boardLocked: b('board_locked'),
    },
  },
  shots: {
    table: 'shots', scope: 'project', trashable: true,
    fields: {
      projectId: pid,
      sceneId: { col: 'scene_id', type: 'text' },
      position: r('position'),
      description: t('description'),
      size: t('size', 'MS'),
      angle: t('angle', 'مستوى العين'),
      cameraId: tn('camera_id'),
      lens: tn('lens'),
      focalMm: { col: 'focal_mm', type: 'real', def: null },
      filter: tn('filter'),
      motion: tn('motion'),
      rigId: tn('rig_id'),
      lightingIds: j('lighting_ids'),
      lightingMood: t('lighting_mood'),
      audioIds: j('audio_ids'),
      audioNotes: t('audio_notes'),
      dialogue: t('dialogue'),
      durationS: r('duration_s', 3),
      status: e('status', STATUSES, 'planned'),
      coverImageId: tn('cover_image_id'),
    },
  },
  characters: {
    table: 'characters', scope: 'project', trashable: true,
    fields: {
      projectId: pid,
      position: r('position'),
      name: t('name', 'شخصية جديدة'),
      role: t('role'),
      description: t('description'),
      wardrobe: t('wardrobe'),
      notes: t('notes'),
      coverImageId: tn('cover_image_id'),
    },
  },
  locations: {
    table: 'locations', scope: 'project', trashable: true,
    fields: {
      projectId: pid,
      position: r('position'),
      name: t('name', 'موقع جديد'),
      address: t('address'),
      mapUrl: t('map_url'),
      notes: t('notes'),
      coverImageId: tn('cover_image_id'),
    },
  },
  moodboards: {
    table: 'moodboards', scope: 'project', trashable: true,
    fields: {
      projectId: pid,
      position: r('position'),
      title: t('title', 'لوحة مزاج جديدة'),
      swatches: j('swatches'),
      coverImageId: tn('cover_image_id'),
    },
  },
  notes: {
    table: 'notes', scope: 'project', trashable: true,
    fields: { projectId: pid, text: t('text') },
  },
  boardCards: {
    table: 'board_cards', scope: 'project', trashable: false,
    fields: {
      projectId: pid,
      kind: { ...e('kind', CARD_KINDS, 'note'), createOnly: true },
      refId: { col: 'ref_id', type: 'text', createOnly: true },
      x: r('x'),
      y: r('y'),
      /** null = default size of the kind. heading: w = wrap width, h = font size. */
      w: { col: 'w', type: 'real', def: null },
      h: { col: 'h', type: 'real', def: null },
      z: r('z'),
      locked: b('locked'),
      color: { col: 'color', type: 'text', values: COLOR_KEYS, def: null },
      /** heading text, frame title, image caption */
      text: t('text'),
    },
  },
  inboxItems: {
    table: 'inbox_items', scope: 'project', trashable: false,
    fields: {
      projectId: pid,
      kind: { ...e('kind', ['image', 'note'], 'note'), createOnly: true },
      imageId: tn('image_id'),
      text: t('text'),
      sceneId: tn('scene_id'),
      isNew: b('is_new', true),
      createdAt: { col: 'created_at', type: 'int', createOnly: true },
    },
  },
  sceneCharacters: {
    table: 'scene_characters', scope: 'project', trashable: false,
    fields: {
      projectId: pid,
      sceneId: { col: 'scene_id', type: 'text', createOnly: true },
      characterId: { col: 'character_id', type: 'text', createOnly: true },
    },
  },
  sceneLinks: {
    table: 'scene_links', scope: 'project', trashable: false,
    fields: {
      projectId: pid,
      sceneId: { col: 'scene_id', type: 'text', createOnly: true },
      kind: { ...e('kind', ['note', 'moodboard'], 'note'), createOnly: true },
      refId: { col: 'ref_id', type: 'text', createOnly: true },
    },
  },
  itemImages: {
    table: 'item_images', scope: 'project', trashable: false,
    fields: {
      projectId: pid,
      ownerKind: { ...e('owner_kind', IMAGE_OWNERS, 'shot'), createOnly: true },
      ownerId: { col: 'owner_id', type: 'text', createOnly: true },
      imageId: { col: 'image_id', type: 'text', createOnly: true },
      position: r('position'),
    },
  },
  equipment: {
    table: 'equipment', scope: 'owner', trashable: false,
    fields: {
      position: r('position'),
      name: t('name'),
      brand: t('brand'),
      model: t('model'),
      use: t('use'),
      qty: { col: 'qty', type: 'int', def: 1 },
      icon: t('icon', 'box'),
      role: t('role', 'other'),
      category: t('category'),
      short: tn('short'),
      motions: j('motions', null),
      lensIds: j('lens_ids', null),
      defaultLensId: tn('default_lens_id'),
      builtinLenses: j('builtin_lenses', null),
      fixedLens: b('fixed_lens'),
      zoomOnly: b('zoom_only'),
      isDefault: b('is_default'),
      virtual: b('virtual'),
    },
  },
} as const satisfies Record<string, EntityDef>;

export type EntityName = keyof typeof ENTITIES;
export const ENTITY_NAMES = Object.keys(ENTITIES) as EntityName[];
export const PROJECT_ENTITIES = ENTITY_NAMES.filter((n) => ENTITIES[n].scope === 'project');

export function isEntityName(s: string): s is EntityName {
  return Object.prototype.hasOwnProperty.call(ENTITIES, s);
}

/** A row as sent over the API: id + fields + bookkeeping. */
export type Row = { id: string; updatedAt: number; deletedAt: number | null } & Record<string, unknown>;

/** One write in a batch. `fields` holds only changed fields for updates. */
export type Op =
  | { op: 'create'; entity: EntityName; id: string; fields: Record<string, unknown> }
  | { op: 'update'; entity: EntityName; id: string; fields: Record<string, unknown> }
  /** trashId: chosen by the client so a retried request is idempotent */
  | { op: 'delete'; entity: EntityName; id: string; label?: string; trashId?: string }
  | { op: 'undelete'; entity: EntityName; id: string }
  /** Soft-delete without a trash entry (used to undo a create). */
  | { op: 'discard'; entity: EntityName; id: string }
  | { op: 'restore'; trashId: string };

export interface OpsResult {
  now: number;
  /** For each delete of a trashable entity, the created trash id (same index as the op). */
  trashIds: (string | null)[];
}

export interface Snapshot {
  now: number;
  project: Row;
  rows: Partial<Record<EntityName, Row[]>>;
}

export interface Changes {
  now: number;
  rows: Partial<Record<EntityName, Row[]>>;
  settings?: Settings;
}

export interface Settings {
  theme: 'light' | 'dark';
  boardSnap: boolean;
  lastProjectId: string | null;
  lastBackupAt: number | null;
  equipmentRoles: Record<string, string>;
  equipmentCategories: string[];
}

export interface TrashEntry {
  id: string;
  projectId: string | null;
  kind: string;
  refId: string;
  label: string;
  deletedAt: number;
  /** e.g. number of shots restored with a scene */
  extra: number;
}

export const TRASH_DAYS = 30;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
