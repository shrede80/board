/**
 * Loads the prototype's demo projects into the LOCAL dev server (never used for the deployed app).
 *   npm run dev            (in one terminal)
 *   npm run seed           (in another)
 * First run sets the dev password through the one-time setup using SETUP_TOKEN from .dev.vars.
 */
import { readFileSync } from 'node:fs';
import { seedProjects } from '../shared/seed';

const BASE = process.env.SEED_URL ?? 'http://localhost:5173';
const PASSWORD = process.env.SEED_PASSWORD ?? 'dev-password';
if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error('seed is for the local dev server only');

const vars = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

async function main() {
  const status = (await (await fetch(`${BASE}/api/auth/status`)).json()) as { setupDone: boolean };
  const res = status.setupDone
    ? await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) })
    : await fetch(`${BASE}/api/setup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: vars.SETUP_TOKEN, password: PASSWORD }) });
  if (!res.ok) throw new Error(`auth failed: ${res.status} ${await res.text()}`);
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  const seed = JSON.parse(readFileSync('prototype/data/seed.json', 'utf8'));
  for (const p of seedProjects(seed).reverse()) {
    const r = await fetch(`${BASE}/api/import`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ project: p, keepName: true }) });
    console.log(r.ok ? `✓ ${p.project.name}` : `✗ ${p.project.name}: ${await r.text()}`);
  }
  console.log(`\nDev password: ${PASSWORD}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
