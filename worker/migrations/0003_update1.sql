-- Update 1 («حرية المحرر»), part 1. Additive only: new columns with defaults and a new table.
-- No existing row or column is changed or removed. The inbox → ideas copy is a separate migration
-- (0004) shipped with phase B, so nothing captured between the two phases is missed.

-- Projects: client, shoot day/time, stage, archive (UPDATE-1 §2.1)
ALTER TABLE projects ADD COLUMN client TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN shoot_date TEXT;
ALTER TABLE projects ADD COLUMN shoot_time TEXT;
ALTER TABLE projects ADD COLUMN stage TEXT NOT NULL DEFAULT 'prep';
ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

-- Scenes on the board: width (NULL = 280), layer order, lock
ALTER TABLE scenes ADD COLUMN board_w REAL;
ALTER TABLE scenes ADD COLUMN board_z REAL NOT NULL DEFAULT 0;
ALTER TABLE scenes ADD COLUMN board_locked INTEGER NOT NULL DEFAULT 0;

-- Board cards: size (NULL = default for the kind), layer order, lock, colour, text.
-- New kinds: image (ref_id = images.id), heading and frame (ref_id = '').
ALTER TABLE board_cards ADD COLUMN w REAL;
ALTER TABLE board_cards ADD COLUMN h REAL;
ALTER TABLE board_cards ADD COLUMN z REAL NOT NULL DEFAULT 0;
ALTER TABLE board_cards ADD COLUMN locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE board_cards ADD COLUMN color TEXT;
ALTER TABLE board_cards ADD COLUMN text TEXT NOT NULL DEFAULT '';

-- Ideas box (replaces the inbox; global to the owner, project/scene optional). Used from phase B.
CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  project_id TEXT,
  scene_id TEXT,
  text TEXT NOT NULL DEFAULT '',
  image_ids TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'laptop',
  is_new INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  trash_id TEXT
);
CREATE INDEX IF NOT EXISTS ideas_owner ON ideas(owner_id, updated_at);
CREATE INDEX IF NOT EXISTS ideas_trash ON ideas(trash_id);
CREATE INDEX IF NOT EXISTS projects_trash ON projects(trash_id);
CREATE INDEX IF NOT EXISTS characters_trash ON characters(trash_id);
CREATE INDEX IF NOT EXISTS locations_trash ON locations(trash_id);
CREATE INDEX IF NOT EXISTS moodboards_trash ON moodboards(trash_id);
CREATE INDEX IF NOT EXISTS notes_trash ON notes(trash_id);
