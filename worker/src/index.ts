import { Hono } from 'hono';
import type { Env } from './env';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', async (c) => {
  const db = await c.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
  const r2 = await c.env.BUCKET.head('__health__');
  return c.json({ ok: true, db: db?.ok === 1, r2: r2 === null || !!r2 });
});

app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext) {
    // Phase 2: daily backup + trash cleanup.
  },
} satisfies ExportedHandler<Env>;

export { app };
