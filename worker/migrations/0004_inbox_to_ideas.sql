-- Update 1 phase B: every inbox item becomes an idea (UPDATE-1 §2.2).
-- Copy only — inbox_items is kept untouched and is never written again (the server now
-- stores old clients' inbox writes as ideas, see worker/src/ops.ts).
-- Safe to run again right after the deploy: the idea keeps the inbox item's id, so a second
-- run inserts nothing (INSERT OR IGNORE) and only picks up items added in between.
-- Not later than that: ideas purged 30 days after a conversion or deletion would come back.
-- updated_at = now so devices that are already polling receive the new rows.
INSERT OR IGNORE INTO ideas (id, owner_id, project_id, scene_id, text, image_ids, source, is_new, created_at, updated_at, deleted_at, trash_id)
SELECT
  i.id,
  'owner',
  i.project_id,
  i.scene_id,
  i.text,
  CASE WHEN i.image_id IS NULL OR i.image_id = '' THEN '[]' ELSE json_array(i.image_id) END,
  'phone',
  i.is_new,
  i.created_at,
  CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
  i.deleted_at,
  NULL
FROM inbox_items i;
