import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { isEntityName, type Op } from '../../shared/schema';
import {
  authRow, checkSession, clearFailures, LOCK_ATTEMPTS, recentFailures, clearSessionCookie, COOKIE, equalStrings, hashPassword, lockRemaining, makeSessionCookie,
  readCookie, recordFailure, validNewPassword, verifyPassword,
} from './auth';
import { ensureBootstrap } from './bootstrap';
import type { Env } from './env';
import { serveImage, uploadImage } from './images';
import { daily, purge } from './maintenance';
import { burn, challengeState, complete, draw, listRuns, META, newRun, postpone, Refused, start, uploadVoice } from './challenge';
import { duplicateProject } from './duplicate';
import { APP_VERSION, VERSION_HEADER } from '../../shared/version';
import { applyOps, parseOps } from './ops';
import { exportProject, importProject } from './portable';
import { changes, customValues, getSettings, home, listProjects, listTrash, ownerChanges, search, snapshot } from './queries';
import { BadRequest, isId, OWNER_ID, toApi } from './rows';

type App = { Bindings: Env };
const app = new Hono<App>();

/** Security headers for everything the Worker answers (static files get theirs from public/_headers). */
app.use('*', async (c, next) => {
  await next();
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('Referrer-Policy', 'same-origin');
  c.res.headers.set('X-Frame-Options', 'DENY');
  if (c.req.path.startsWith('/api/') && !c.req.path.startsWith('/api/images/')) c.res.headers.set('Cache-Control', 'no-store');
  // Lets an open tab notice that a newer version was deployed (UPDATE-1 أ10).
  if (c.req.path.startsWith('/api/')) c.res.headers.set(VERSION_HEADER, APP_VERSION);
});

app.onError((err, c) => {
  if (err instanceof Refused) return c.json({ error: err.code, ...err.extra }, 409);
  if (err instanceof BadRequest) return c.json({ error: 'bad_request', message: err.message }, 400);
  console.error(err);
  return c.json({ error: 'server_error' }, 500);
});

app.use('/api/*', async (c, next) => {
  // Reject cross-site writes (cookie is SameSite=Lax; this is a second lock).
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const origin = c.req.header('Origin');
    if (origin) {
      let host = '';
      try {
        host = new URL(origin).host;
      } catch {
        /* "null" or garbage */
      }
      if (host !== new URL(c.req.url).host) return c.json({ error: 'forbidden' }, 403);
    }
  }
  await ensureBootstrap(c.env.DB);
  await next();
});

async function isAuthed(c: Context<App>): Promise<boolean> {
  const row = await authRow(c.env.DB);
  if (!row?.password_hash) return false;
  return checkSession(c.env.SESSION_SECRET, readCookie(c.req.header('Cookie'), COOKIE), row.session_version);
}

const requireAuth: MiddlewareHandler<App> = async (c, next) => {
  if (!(await isAuthed(c))) return c.json({ error: 'unauthorized' }, 401);
  await next();
};

async function body<T = Record<string, unknown>>(c: Context<App>): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    throw new BadRequest('invalid JSON');
  }
}

// ---------- public: auth ----------
app.get('/api/auth/status', async (c) => {
  const row = await authRow(c.env.DB);
  return c.json({ setupDone: !!row?.password_hash, authed: await isAuthed(c), lockedMs: await lockRemaining(c.env.DB) });
});

app.post('/api/auth/login', async (c) => {
  const { password } = await body<{ password?: unknown }>(c);
  const row = await authRow(c.env.DB);
  if (!row?.password_hash) return c.json({ error: 'setup_required' }, 409);
  // Count the attempt BEFORE checking it, so parallel requests can't slip past the limit.
  const attempt = await recordFailure(c.env.DB);
  if ((await recentFailures(c.env.DB)) > LOCK_ATTEMPTS) return c.json({ error: 'locked', lockedMs: await lockRemaining(c.env.DB) }, 429);
  if (typeof password !== 'string' || !(await verifyPassword(password, row.password_hash))) {
    const lockedMs = await lockRemaining(c.env.DB);
    return c.json({ error: lockedMs ? 'locked' : 'wrong_password', lockedMs }, lockedMs ? 429 : 401);
  }
  void attempt;
  await clearFailures(c.env.DB);
  c.header('Set-Cookie', await makeSessionCookie(c.env.SESSION_SECRET, row.session_version));
  return c.json({ ok: true });
});

app.post('/api/auth/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie);
  return c.json({ ok: true });
});

/** One-time password setup, unlocked by the SETUP_TOKEN secret. Closed for good once a password exists. */
app.post('/api/setup', async (c) => {
  const { token, password } = await body<{ token?: unknown; password?: unknown }>(c);
  const locked = await lockRemaining(c.env.DB);
  if (locked > 0) return c.json({ error: 'locked', lockedMs: locked }, 429);
  const row = await authRow(c.env.DB);
  if (row?.password_hash) return c.json({ error: 'already_set' }, 409);
  if (!c.env.SETUP_TOKEN || typeof token !== 'string' || !equalStrings(token, c.env.SETUP_TOKEN)) {
    await recordFailure(c.env.DB);
    return c.json({ error: 'bad_token' }, 401);
  }
  if (!validNewPassword(password)) return c.json({ error: 'weak_password' }, 400);
  const hash = await hashPassword(password);
  // Conditional write: if two setups race, only the first one wins.
  const res = await c.env.DB.prepare('UPDATE settings SET password_hash = ?, updated_at = ? WHERE owner_id = ? AND password_hash IS NULL')
    .bind(hash, Date.now(), OWNER_ID).run();
  if (!res.meta.changes) return c.json({ error: 'already_set' }, 409);
  await clearFailures(c.env.DB);
  c.header('Set-Cookie', await makeSessionCookie(c.env.SESSION_SECRET, row?.session_version ?? 1));
  return c.json({ ok: true });
});

// ---------- everything else needs a session ----------
app.use('/api/*', requireAuth);

app.get('/api/health', async (c) => {
  const db = await c.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
  await c.env.BUCKET.head('__health__');
  return c.json({ ok: db?.ok === 1 });
});

app.post('/api/auth/password', async (c) => {
  const { current, next } = await body<{ current?: unknown; next?: unknown }>(c);
  const row = await authRow(c.env.DB);
  if (!row?.password_hash || typeof current !== 'string' || !(await verifyPassword(current, row.password_hash))) {
    return c.json({ error: 'wrong_password' }, 401);
  }
  if (!validNewPassword(next)) return c.json({ error: 'weak_password' }, 400);
  const version = row.session_version + 1;
  await c.env.DB.prepare('UPDATE settings SET password_hash = ?, session_version = ?, updated_at = ? WHERE owner_id = ?')
    .bind(await hashPassword(next), version, Date.now(), OWNER_ID).run();
  // Other devices are signed out (their cookie has the old version); this one stays in.
  c.header('Set-Cookie', await makeSessionCookie(c.env.SESSION_SECRET, version));
  return c.json({ ok: true });
});

app.get('/api/settings', async (c) => c.json(await getSettings(c.env.DB)));

app.patch('/api/settings', async (c) => {
  const b = await body(c);
  const sets: string[] = [];
  const binds: unknown[] = [];
  if ('theme' in b) {
    if (b.theme !== 'light' && b.theme !== 'dark') throw new BadRequest('theme');
    sets.push('theme = ?'), binds.push(b.theme);
  }
  if ('boardSnap' in b) {
    if (typeof b.boardSnap !== 'boolean') throw new BadRequest('boardSnap');
    sets.push('board_snap = ?'), binds.push(b.boardSnap ? 1 : 0);
  }
  if ('lastProjectId' in b) {
    if (b.lastProjectId !== null && !isId(b.lastProjectId)) throw new BadRequest('lastProjectId');
    sets.push('last_project_id = ?'), binds.push(b.lastProjectId);
  }
  if ('equipmentCategories' in b) {
    if (!Array.isArray(b.equipmentCategories) || !b.equipmentCategories.every((x) => typeof x === 'string')) throw new BadRequest('equipmentCategories');
    sets.push('equipment_categories = ?'), binds.push(JSON.stringify(b.equipmentCategories));
  }
  if (sets.length) {
    await c.env.DB.prepare(`UPDATE settings SET ${sets.join(', ')}, updated_at = ? WHERE owner_id = ?`).bind(...binds, Date.now(), OWNER_ID).run();
  }
  return c.json(await getSettings(c.env.DB));
});

app.get('/api/projects', async (c) => c.json(await listProjects(c.env.DB)));
app.get('/api/home', async (c) => c.json(await home(c.env.DB)));
app.get('/api/changes', async (c) => {
  const since = Number(c.req.query('since'));
  if (!Number.isFinite(since) || since < 0) throw new BadRequest('since');
  return c.json(await ownerChanges(c.env.DB, since));
});
app.get('/api/search', async (c) => c.json(await search(c.env.DB, c.req.query('q') ?? '')));

app.get('/api/projects/:id', async (c) => {
  const s = await snapshot(c.env.DB, c.req.param('id'));
  return s ? c.json(s) : c.json({ error: 'not_found' }, 404);
});

app.get('/api/projects/:id/changes', async (c) => {
  const since = Number(c.req.query('since'));
  if (!Number.isFinite(since) || since < 0) throw new BadRequest('since');
  return c.json(await changes(c.env.DB, c.req.param('id'), since));
});

app.post('/api/projects/:id/duplicate', async (c) => {
  const { keepStatus } = await body<{ keepStatus?: unknown }>(c);
  return c.json(await duplicateProject(c.env.DB, c.req.param('id'), { keepStatus: keepStatus === true }));
});

/** «احفظ كقالب» (UPDATE-3 §7): the whole project, or one scene (sceneId), as a template. */
app.post('/api/projects/:id/template', async (c) => {
  const { name, sceneId } = await body<{ name?: unknown; sceneId?: unknown }>(c);
  if (typeof name !== 'string' || !name.trim()) throw new BadRequest('name');
  if (sceneId !== undefined && typeof sceneId !== 'string') throw new BadRequest('sceneId');
  return c.json(await duplicateProject(c.env.DB, c.req.param('id'), { name, templateKind: sceneId ? 'scene' : 'project', sceneId: sceneId || undefined }));
});

/** «مشروع جديد من القالب»: an ordinary copy with the name given. */
app.post('/api/projects/:id/from-template', async (c) => {
  const { name } = await body<{ name?: unknown }>(c);
  if (typeof name !== 'string' || !name.trim()) throw new BadRequest('name');
  return c.json(await duplicateProject(c.env.DB, c.req.param('id'), { name, templateKind: null }));
});

app.get('/api/projects/:id/export', async (c) => {
  const p = await exportProject(c.env.DB, c.req.param('id'));
  return p ? c.json(p) : c.json({ error: 'not_found' }, 404);
});

app.post('/api/import', async (c) => {
  const { project, imageMap, keepName } = await body<{ project?: unknown; imageMap?: unknown; keepName?: unknown }>(c);
  const map = imageMap && typeof imageMap === 'object' ? (imageMap as Record<string, string>) : {};
  return c.json(await importProject(c.env.DB, project, map, { keepName: keepName === true }));
});

app.get('/api/equipment', async (c) => {
  const res = await c.env.DB.prepare('SELECT * FROM equipment WHERE owner_id = ? AND deleted_at IS NULL ORDER BY position').bind(OWNER_ID).all<Record<string, unknown>>();
  return c.json(res.results.map((r) => toApi('equipment', r)));
});

app.get('/api/custom-values', async (c) => c.json(await customValues(c.env.DB)));

// ---------- writes ----------
app.post('/api/ops', async (c) => {
  const { ops } = await body<{ ops?: unknown }>(c);
  return c.json(await applyOps(c.env.DB, parseOps(ops)));
});

// ---------- trash ----------
app.get('/api/trash', async (c) => c.json(await listTrash(c.env.DB)));
app.post('/api/trash/:id/restore', async (c) => c.json(await applyOps(c.env.DB, [{ op: 'restore', trashId: c.req.param('id') }])));
app.delete('/api/trash/:id', async (c) => {
  const id = c.req.param('id');
  if (!isId(id)) throw new BadRequest('id');
  await purge(c.env.DB, c.env.BUCKET, [id], { sweepImages: false });
  return c.json({ ok: true });
});

// ---------- images ----------
app.post('/api/images', async (c) => {
  const len = Number(c.req.header('Content-Length') || 0);
  if (len > 20 * 1024 * 1024) throw new BadRequest('image too large');
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw new BadRequest('multipart form expected');
  }
  return c.json(await uploadImage(c.env.DB, c.env.BUCKET, form));
});
app.get('/api/images/:id', (c) => (isId(c.req.param('id')) ? serveImage(c.env.BUCKET, c.req.param('id'), false) : c.notFound()));
app.get('/api/images/:id/thumb', (c) => (isId(c.req.param('id')) ? serveImage(c.env.BUCKET, c.req.param('id'), true) : c.notFound()));

// ---------- «تحدي العشرين إطاراً» (UPDATE-2) ----------
const cardNo = (v: unknown) => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 99) throw new BadRequest('cardId');
  return v;
};
app.get('/api/challenge/meta', (c) => c.json(META));
app.get('/api/challenge', async (c) => {
  const run = c.req.query('run');
  if (run !== undefined && !isId(run)) throw new BadRequest('run');
  return c.json(await challengeState(c.env.DB, run));
});
app.get('/api/challenge/runs', async (c) => c.json(await listRuns(c.env.DB)));
app.post('/api/challenge/start', async (c) => c.json(await start(c.env.DB)));
app.post('/api/challenge/draw', async (c) => {
  const { tz, override } = await body<{ tz?: unknown; override?: unknown }>(c);
  if (typeof tz !== 'number' || !Number.isFinite(tz) || Math.abs(tz) > 16 * 60) throw new BadRequest('tz');
  return c.json(await draw(c.env.DB, { tz, override: override === true }));
});
app.post('/api/challenge/postpone', async (c) => c.json(await postpone(c.env.DB, cardNo((await body(c)).cardId))));
app.post('/api/challenge/burn', async (c) => {
  const b = await body<{ cardId?: unknown; reason?: unknown }>(c);
  if (typeof b.reason !== 'string') throw new BadRequest('reason');
  return c.json(await burn(c.env.DB, cardNo(b.cardId), b.reason));
});
app.post('/api/challenge/complete', async (c) => c.json(await complete(c.env.DB, cardNo((await body(c)).cardId))));
app.post('/api/challenge/new-run', async (c) => c.json(await newRun(c.env.DB)));
app.post('/api/challenge/voice', async (c) => {
  const len = Number(c.req.header('Content-Length') || 0);
  if (len > 6 * 1024 * 1024) throw new BadRequest('audio too large');
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw new BadRequest('multipart form expected');
  }
  return c.json(await uploadVoice(c.env.DB, c.env.BUCKET, form));
});

// ---------- single-item REST sugar over /api/ops ----------
app.post('/api/:entity', async (c) => {
  const entity = c.req.param('entity');
  if (!isEntityName(entity)) return c.json({ error: 'not_found' }, 404);
  const { id, ...fields } = await body<{ id?: unknown } & Record<string, unknown>>(c);
  const ops = parseOps([{ op: 'create', entity, id, fields }]) as Op[];
  return c.json(await applyOps(c.env.DB, ops));
});
app.patch('/api/:entity/:id', async (c) => {
  const entity = c.req.param('entity');
  if (!isEntityName(entity)) return c.json({ error: 'not_found' }, 404);
  const ops = parseOps([{ op: 'update', entity, id: c.req.param('id'), fields: await body(c) }]);
  return c.json(await applyOps(c.env.DB, ops));
});
app.delete('/api/:entity/:id', async (c) => {
  const entity = c.req.param('entity');
  if (!isEntityName(entity)) return c.json({ error: 'not_found' }, 404);
  const ops = parseOps([{ op: 'delete', entity, id: c.req.param('id'), label: c.req.query('label') }]);
  return c.json(await applyOps(c.env.DB, ops));
});

app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      (async () => {
        await ensureBootstrap(env.DB);
        await daily(env.DB, env.BUCKET);
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
