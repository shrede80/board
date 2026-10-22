-- Update 3, phase B. Additive only: the shot plan of each scene (UPDATE-3 §6, §8), one row per
-- item, in metres. A plan item never goes to the trash alone: it hides and comes back with its
-- scene (same trash id). Nothing existing changes.
CREATE TABLE IF NOT EXISTS plan_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'camera',   -- camera | light | person | furniture | zone | arrow | text
  ref_id TEXT,                           -- equipment id (camera, light) or character id (person)
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  rot REAL NOT NULL DEFAULT 0,           -- degrees, 0 = facing up
  w REAL NOT NULL DEFAULT 1,
  h REAL NOT NULL DEFAULT 1,
  z REAL NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  color TEXT,
  props TEXT NOT NULL DEFAULT '{}',      -- JSON: lens, focalMm, vertical, range, cct, rgb, modifier, type, points, dashed, height
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  trash_id TEXT
);
CREATE INDEX IF NOT EXISTS plan_items_project ON plan_items(project_id, updated_at);
CREATE INDEX IF NOT EXISTS plan_items_scene ON plan_items(scene_id);
CREATE INDEX IF NOT EXISTS plan_items_trash ON plan_items(trash_id);
