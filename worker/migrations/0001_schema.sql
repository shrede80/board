-- Full schema. Times are epoch milliseconds (server clock).
-- deleted_at: soft delete. trash_id: which trash entry hid this row (restore clears them together).

CREATE TABLE settings (
  owner_id TEXT PRIMARY KEY,
  password_hash TEXT,
  session_version INTEGER NOT NULL DEFAULT 1,
  theme TEXT NOT NULL DEFAULT 'light',
  board_snap INTEGER NOT NULL DEFAULT 1,
  last_project_id TEXT,
  last_backup_at INTEGER,
  equipment_roles TEXT NOT NULL DEFAULT '{}',
  equipment_categories TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE login_failures (at INTEGER NOT NULL);
CREATE INDEX login_failures_at ON login_failures(at);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  template TEXT NOT NULL DEFAULT 'blank',
  aspect TEXT NOT NULL DEFAULT '16:9',
  cover_image_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  trash_id TEXT
);
CREATE INDEX projects_owner ON projects(owner_id, updated_at);

CREATE TABLE scenes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  name TEXT NOT NULL DEFAULT '',
  int_ext TEXT NOT NULL DEFAULT 'ext',
  day_night TEXT NOT NULL DEFAULT 'day',
  location_id TEXT,
  summary TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  mood TEXT NOT NULL DEFAULT 'sand',
  cover_image_id TEXT,
  board_x REAL NOT NULL DEFAULT 0,
  board_y REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  trash_id TEXT
);
CREATE INDEX scenes_project ON scenes(project_id, updated_at);

CREATE TABLE shots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT 'MS',
  angle TEXT NOT NULL DEFAULT '',
  camera_id TEXT,
  lens TEXT,
  focal_mm REAL,
  filter TEXT,
  motion TEXT,
  rig_id TEXT,
  lighting_ids TEXT NOT NULL DEFAULT '[]',
  lighting_mood TEXT NOT NULL DEFAULT '',
  audio_ids TEXT NOT NULL DEFAULT '[]',
  audio_notes TEXT NOT NULL DEFAULT '',
  dialogue TEXT NOT NULL DEFAULT '',
  duration_s REAL NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'planned',
  cover_image_id TEXT,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  trash_id TEXT
);
CREATE INDEX shots_project ON shots(project_id, updated_at);
CREATE INDEX shots_scene ON shots(scene_id);

CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  wardrobe TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  cover_image_id TEXT,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  trash_id TEXT
);
CREATE INDEX characters_project ON characters(project_id, updated_at);

CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  map_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  cover_image_id TEXT,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  trash_id TEXT
);
CREATE INDEX locations_project ON locations(project_id, updated_at);

CREATE TABLE moodboards (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  swatches TEXT NOT NULL DEFAULT '[]',
  cover_image_id TEXT,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  trash_id TEXT
);
CREATE INDEX moodboards_project ON moodboards(project_id, updated_at);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  trash_id TEXT
);
CREATE INDEX notes_project ON notes(project_id, updated_at);

CREATE TABLE board_cards (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  trash_id TEXT
);
CREATE INDEX board_cards_project ON board_cards(project_id, updated_at);
CREATE INDEX board_cards_ref ON board_cards(ref_id);

CREATE TABLE inbox_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  image_id TEXT,
  text TEXT NOT NULL DEFAULT '',
  scene_id TEXT,
  is_new INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  trash_id TEXT
);
CREATE INDEX inbox_items_project ON inbox_items(project_id, updated_at);

CREATE TABLE scene_characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  trash_id TEXT
);
CREATE INDEX scene_characters_project ON scene_characters(project_id, updated_at);

CREATE TABLE scene_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  trash_id TEXT
);
CREATE INDEX scene_links_project ON scene_links(project_id, updated_at);

CREATE TABLE images (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  r2_key TEXT,
  thumb_key TEXT,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  -- dev/test seed only: gradient placeholder {x,y,v} like the prototype frames; NULL for real uploads
  placeholder TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE item_images (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  owner_kind TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  image_id TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  trash_id TEXT
);
CREATE INDEX item_images_project ON item_images(project_id, updated_at);
CREATE INDEX item_images_image ON item_images(image_id);

CREATE TABLE equipment (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  name TEXT NOT NULL DEFAULT '',
  brand TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  use TEXT NOT NULL DEFAULT '',
  qty INTEGER NOT NULL DEFAULT 1,
  icon TEXT NOT NULL DEFAULT 'box',
  role TEXT NOT NULL DEFAULT 'other',
  category TEXT NOT NULL DEFAULT '',
  short TEXT,
  motions TEXT,
  lens_ids TEXT,
  default_lens_id TEXT,
  builtin_lenses TEXT,
  fixed_lens INTEGER NOT NULL DEFAULT 0,
  zoom_only INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  virtual INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  trash_id TEXT
);
CREATE INDEX equipment_owner ON equipment(owner_id, updated_at);

CREATE TABLE trash (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  project_id TEXT,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  extra INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER NOT NULL
);
CREATE INDEX trash_owner ON trash(owner_id, deleted_at);
