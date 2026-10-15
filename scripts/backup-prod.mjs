// Manual production backup before a migration (UPDATE-1 §2.4):
//   node scripts/backup-prod.mjs <label>
// Writes the same file as the nightly cron backup (worker/src/maintenance.ts → backup()):
// { format: 'lawhat-backup/1', createdAt, tables } with every table, password hash removed,
// to R2 as backups/<YYYY-MM-DD>-<label>.json, then reads it back to check the row counts.
// Run from the cloud session with CLOUDFLARE_API_TOKEN=proxy-injected (see CLAUDE.md).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const label = (process.argv[2] || 'manual').replace(/[^a-z0-9-]/gi, '');
const BUCKET = 'lawhat-images';
const TABLES = ['settings', 'images', 'trash', 'projects', 'scenes', 'shots', 'characters', 'locations', 'moodboards', 'notes', 'board_cards', 'inbox_items', 'scene_characters', 'scene_links', 'item_images', 'equipment', 'ideas'];

const wrangler = (args, opts = {}) => execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });
const existing = new Set(
  JSON.parse(wrangler(['d1', 'execute', 'DB', '--remote', '--json', '--command', "SELECT name FROM sqlite_master WHERE type = 'table'"]))[0].results.map((r) => r.name),
);

const tables = {};
for (const t of TABLES) {
  if (!existing.has(t)) continue; // e.g. ideas before its migration
  const rows = JSON.parse(wrangler(['d1', 'execute', 'DB', '--remote', '--json', '--command', `SELECT * FROM ${t}`]))[0].results;
  // never put the password hash in a backup file
  tables[t] = t === 'settings' ? rows.map((r) => ({ ...r, password_hash: null })) : rows;
}
const now = new Date();
const key = `backups/${now.toISOString().slice(0, 10)}-${label}.json`;
mkdirSync('.backups', { recursive: true });
const file = `.backups/${key.split('/')[1]}`;
writeFileSync(file, JSON.stringify({ format: 'lawhat-backup/1', createdAt: now.toISOString(), tables }));
wrangler(['r2', 'object', 'put', `${BUCKET}/${key}`, '--file', file, '--content-type', 'application/json', '--remote'], { stdio: 'inherit' });

// read it back and compare
const back = `${file}.check`;
wrangler(['r2', 'object', 'get', `${BUCKET}/${key}`, '--file', back, '--remote'], { stdio: 'inherit' });
const got = JSON.parse(readFileSync(back, 'utf8'));
const counts = Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, r.length]));
for (const [t, n] of Object.entries(counts)) if ((got.tables[t] ?? []).length !== n) throw new Error(`backup check failed for ${t}`);
console.log(`\n✓ Backup in R2: ${key}`);
console.log(JSON.stringify(counts));
