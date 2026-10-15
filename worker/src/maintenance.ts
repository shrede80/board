import { ENTITIES, TRASH_DAYS } from '../../shared/schema';
import { fullKey, thumbKey } from './images';
import { OWNER_ID } from './rows';

const DAY = 24 * 3600 * 1000;
export const BACKUP_KEEP = 30;
const DATA_TABLES: string[] = [...new Set(Object.values(ENTITIES).map((e) => e.table))];
const BACKUP_TABLES = ['settings', 'images', 'trash', ...DATA_TABLES];
const PROJECT_TABLES: string[] = Object.values(ENTITIES).filter((e) => e.scope === 'project').map((e) => e.table);

/** Daily backup: every table → R2 `backups/YYYY-MM-DD.json`; keep the newest 30. */
export async function backup(db: D1Database, bucket: R2Bucket, now = Date.now()): Promise<string> {
  const results = await db.batch(BACKUP_TABLES.map((t) => db.prepare(`SELECT * FROM ${t}`)));
  const tables: Record<string, unknown[]> = {};
  BACKUP_TABLES.forEach((t, i) => {
    tables[t] = results[i].results.map((r) => {
      // Never put the password hash in a backup file.
      if (t === 'settings') return { ...(r as Record<string, unknown>), password_hash: null };
      return r;
    });
  });
  const key = `backups/${new Date(now).toISOString().slice(0, 10)}.json`;
  await bucket.put(key, JSON.stringify({ format: 'lawhat-backup/1', createdAt: new Date(now).toISOString(), tables }), {
    httpMetadata: { contentType: 'application/json' },
  });
  const listed = await bucket.list({ prefix: 'backups/' });
  const keys = listed.objects.map((o) => o.key).sort();
  if (keys.length > BACKUP_KEEP) await bucket.delete(keys.slice(0, keys.length - BACKUP_KEEP));
  await db.prepare('UPDATE settings SET last_backup_at = ?, updated_at = ? WHERE owner_id = ?').bind(now, now, OWNER_ID).run();
  return key;
}

/**
 * Permanently deletes trash entries (with everything they hid), expired tombstones and orphans.
 * Images are removed from R2 only once nothing references them any more.
 */
export async function purge(db: D1Database, bucket: R2Bucket, trashIds: string[], opts: { now?: number; sweepImages?: boolean } = {}) {
  const now = opts.now ?? Date.now();
  const tids = JSON.stringify(trashIds);
  const projects = await db
    .prepare(`SELECT ref_id FROM trash WHERE kind = 'projects' AND id IN (SELECT value FROM json_each(?))`)
    .bind(tids)
    .all<{ ref_id: string }>();
  const pids = JSON.stringify(projects.results.map((r) => r.ref_id));
  const cutoff = now - TRASH_DAYS * DAY;

  const stmts: D1PreparedStatement[] = DATA_TABLES.map((t) =>
    db
      .prepare(
        `DELETE FROM ${t} WHERE trash_id IN (SELECT value FROM json_each(?1))
           OR (deleted_at < ?2 AND trash_id IS NULL)` +
          (PROJECT_TABLES.includes(t) ? ' OR project_id IN (SELECT value FROM json_each(?3))' : ''),
      )
      .bind(tids, cutoff, ...(PROJECT_TABLES.includes(t) ? [pids] : [])),
  );
  stmts.push(db.prepare('DELETE FROM trash WHERE id IN (SELECT value FROM json_each(?))').bind(tids));
  // Orphans: rows pointing at rows that no longer exist at all (deleted rows still count as existing).
  stmts.push(
    db.prepare(
      `DELETE FROM item_images WHERE
         (owner_kind = 'shot' AND owner_id NOT IN (SELECT id FROM shots)) OR
         (owner_kind = 'character' AND owner_id NOT IN (SELECT id FROM characters)) OR
         (owner_kind = 'location' AND owner_id NOT IN (SELECT id FROM locations)) OR
         (owner_kind = 'moodboard' AND owner_id NOT IN (SELECT id FROM moodboards))`,
    ),
    db.prepare(
      `DELETE FROM board_cards WHERE
         (kind = 'note' AND ref_id NOT IN (SELECT id FROM notes)) OR
         (kind = 'character' AND ref_id NOT IN (SELECT id FROM characters)) OR
         (kind = 'location' AND ref_id NOT IN (SELECT id FROM locations)) OR
         (kind = 'moodboard' AND ref_id NOT IN (SELECT id FROM moodboards))`,
    ),
    // shots whose scene no longer exists at all (never shown, never purged otherwise)
    db.prepare(`DELETE FROM shots WHERE scene_id NOT IN (SELECT id FROM scenes)`),
    db.prepare(`DELETE FROM scene_characters WHERE scene_id NOT IN (SELECT id FROM scenes) OR character_id NOT IN (SELECT id FROM characters)`),
    db.prepare(
      `DELETE FROM scene_links WHERE scene_id NOT IN (SELECT id FROM scenes) OR
         (kind = 'note' AND ref_id NOT IN (SELECT id FROM notes)) OR
         (kind = 'moodboard' AND ref_id NOT IN (SELECT id FROM moodboards))`,
    ),
  );
  await db.batch(stmts);
  if (opts.sweepImages !== false) await sweepImages(db, bucket, now);
}

/**
 * Deletes images nothing points at (older than a day, so a fresh upload not yet linked survives).
 * Rows in the trash or tombstoned still count as pointers until they are purged themselves.
 */
export async function sweepImages(db: D1Database, bucket: R2Bucket, now = Date.now()) {
  const orphans = await db
    .prepare(
      `SELECT id, r2_key, thumb_key FROM images i WHERE created_at < ?
         AND NOT EXISTS (SELECT 1 FROM item_images x WHERE x.image_id = i.id)
         AND NOT EXISTS (SELECT 1 FROM inbox_items x WHERE x.image_id = i.id)
         AND NOT EXISTS (SELECT 1 FROM board_cards x WHERE x.kind = 'image' AND x.ref_id = i.id)
         AND NOT EXISTS (SELECT 1 FROM ideas x, json_each(x.image_ids) j WHERE j.value = i.id)
         ${['projects', 'scenes', 'shots', 'characters', 'locations', 'moodboards']
           .map((t) => `AND NOT EXISTS (SELECT 1 FROM ${t} x WHERE x.cover_image_id = i.id)`)
           .join('\n         ')}
       LIMIT 500`,
    )
    .bind(now - DAY)
    .all<{ id: string; r2_key: string | null; thumb_key: string | null }>();
  if (!orphans.results.length) return 0;
  const keys = orphans.results.flatMap((o) => [o.r2_key ?? fullKey(o.id), o.thumb_key ?? thumbKey(o.id)]);
  await bucket.delete(keys);
  await db.prepare('DELETE FROM images WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(orphans.results.map((o) => o.id))).run();
  return orphans.results.length;
}

/** The daily job (03:00 Riyadh): backup first, then empty what has been in the trash for 30 days. */
export async function daily(db: D1Database, bucket: R2Bucket, now = Date.now()) {
  await backup(db, bucket, now);
  const expired = await db
    .prepare('SELECT id FROM trash WHERE deleted_at < ?')
    .bind(now - TRASH_DAYS * DAY)
    .all<{ id: string }>();
  await purge(db, bucket, expired.results.map((r) => r.id), { now });
}
