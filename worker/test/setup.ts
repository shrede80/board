import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach } from 'vitest';
import { resetBootstrapCache } from '../src/bootstrap';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

/** Every test starts from an empty database and bucket (first run state). */
beforeEach(async () => {
  const tables = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '_cf_%'",
  ).all<{ name: string }>();
  await env.DB.batch(tables.results.map((t) => env.DB.prepare(`DELETE FROM ${t.name}`)));
  let listed = await env.BUCKET.list();
  while (listed.objects.length) {
    await env.BUCKET.delete(listed.objects.map((o) => o.key));
    listed = await env.BUCKET.list();
  }
  resetBootstrapCache();
});
