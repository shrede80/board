-- Update 2 («تحدي العشرين إطاراً»): two new tables. Additive only — nothing existing changes.
-- Owner-scoped rows, synced and backed up like every entity. Never trashed: a run is archived,
-- a day is never deleted.

CREATE TABLE IF NOT EXISTS challenge_runs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',      -- active | done | archived
  deck_version INTEGER NOT NULL DEFAULT 1,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  burn_used INTEGER NOT NULL DEFAULT 0,
  location TEXT,                              -- JSON {lat, lng, label} | NULL (Riyadh)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  trash_id TEXT
);
-- One run in progress (or finished, waiting for «دورة جديدة») per owner.
CREATE UNIQUE INDEX IF NOT EXISTS challenge_runs_current ON challenge_runs(owner_id) WHERE status <> 'archived';
CREATE INDEX IF NOT EXISTS challenge_runs_owner ON challenge_runs(owner_id, updated_at);

CREATE TABLE IF NOT EXISTS challenge_days (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  card_id INTEGER NOT NULL,                   -- card number in the deck file (0–20)
  seq INTEGER,                                -- day shown (0 = prep); NULL while postponed
  state TEXT NOT NULL DEFAULT 'drawn',        -- drawn | done | burned | postponed
  drawn_at INTEGER NOT NULL,
  completed_at INTEGER,
  overrode INTEGER NOT NULL DEFAULT 0,
  postpone_count INTEGER NOT NULL DEFAULT 0,
  burn_reason TEXT NOT NULL DEFAULT '',
  bts TEXT NOT NULL DEFAULT '[false,false,false,false,false]',
  journal TEXT NOT NULL DEFAULT '{}',
  film_url TEXT NOT NULL DEFAULT '',
  publish_url TEXT NOT NULL DEFAULT '',
  still_image_ids TEXT NOT NULL DEFAULT '[]',
  bts_image_ids TEXT NOT NULL DEFAULT '[]',
  voice_id TEXT,
  project_id TEXT,
  commitment TEXT,                            -- JSON {shot, total} | NULL
  regret_idea_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  trash_id TEXT
);
-- A card appears once per run, and a day number is taken once: two devices drawing at the same
-- moment cannot both win.
CREATE UNIQUE INDEX IF NOT EXISTS challenge_days_card ON challenge_days(run_id, card_id);
CREATE UNIQUE INDEX IF NOT EXISTS challenge_days_seq ON challenge_days(run_id, seq) WHERE seq IS NOT NULL;
CREATE INDEX IF NOT EXISTS challenge_days_owner ON challenge_days(owner_id, updated_at);
