-- Update 3, phase A2. Additive only: one new table for the user's preferences, synced between
-- devices and kept in the nightly backup (UPDATE-3 §8). Keys (id): 'fields' (which fields show,
-- §4), 'motion' («حركة أقل», §5), 'keys' (changed shortcuts only, §3.3). Nothing existing changes.
CREATE TABLE IF NOT EXISTS prefs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  value TEXT,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  trash_id TEXT
);
CREATE INDEX IF NOT EXISTS prefs_owner ON prefs(owner_id, updated_at);
