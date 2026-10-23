import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import { backup, BACKUP_KEEP, daily } from '../src/maintenance';
import { call, getJson, ops, setupAndLogin, upload } from './helpers';

const DAY = 24 * 3600 * 1000;
void exports;

async function withProject(cookie: string) {
  const img = await upload(cookie);
  await ops(cookie, [
    { op: 'create', entity: 'projects', id: 'pr-1', fields: { name: 'p' } },
    { op: 'create', entity: 'scenes', id: 'sc-1', fields: { projectId: 'pr-1' } },
    { op: 'create', entity: 'shots', id: 'sh-1', fields: { projectId: 'pr-1', sceneId: 'sc-1' } },
    { op: 'create', entity: 'itemImages', id: 'ii-1', fields: { projectId: 'pr-1', ownerKind: 'shot', ownerId: 'sh-1', imageId: img } },
  ]);
  return img;
}

describe('daily backup', () => {
  it('writes every table to R2 without the password hash and records the time', async () => {
    const cookie = await setupAndLogin();
    await withProject(cookie);
    await ops(cookie, [{ op: 'create', entity: 'ideas', id: 'idea-1', fields: { text: 'فكرة', imageIds: [] } }]);
    const now = Date.parse('2026-10-15T00:00:00Z');
    const key = await backup(env.DB, env.BUCKET, now);
    expect(key).toBe('backups/2026-10-15.json');
    const obj = await env.BUCKET.get(key);
    const data = (await obj!.json()) as { tables: Record<string, Record<string, unknown>[]> };
    expect(data.tables.shots).toHaveLength(1);
    expect(data.tables.ideas).toHaveLength(1);
    expect(data.tables.ideas[0].text).toBe('فكرة');
    expect(data.tables.inbox_items).toEqual([]); // still backed up (kept, never written)
    expect(data.tables.equipment.length).toBe(74);
    expect(data.tables.settings[0].password_hash).toBeNull();
    expect((await getJson('/api/settings', cookie)).lastBackupAt).toBe(now);
  });

  it('keeps only the newest 30', async () => {
    await setupAndLogin();
    const start = Date.parse('2026-01-01T00:00:00Z');
    for (let d = 0; d < BACKUP_KEEP + 3; d++) await backup(env.DB, env.BUCKET, start + d * DAY);
    const keys = (await env.BUCKET.list({ prefix: 'backups/' })).objects.map((o) => o.key).sort();
    expect(keys).toHaveLength(BACKUP_KEEP);
    expect(keys[0]).toBe('backups/2026-01-04.json');
  });

  it('runs from the cron trigger', async () => {
    await setupAndLogin();
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ scheduledTime: Date.now(), cron: '0 0 * * *' }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect((await env.BUCKET.list({ prefix: 'backups/' })).objects).toHaveLength(1);
  });
});

describe('trash cleanup', () => {
  it('keeps trash for 30 days, then deletes rows and finally the photo', async () => {
    const cookie = await setupAndLogin();
    const img = await withProject(cookie);
    await ops(cookie, [{ op: 'delete', entity: 'scenes', id: 'sc-1' }]);
    // day 29: still restorable, photo still there
    await daily(env.DB, env.BUCKET, Date.now() + 29 * DAY);
    expect(await getJson('/api/trash', cookie)).toHaveLength(1);
    expect(await env.BUCKET.head(`img/${img}`)).not.toBeNull();
    // day 31: gone for good, including the photo nothing points to any more
    await daily(env.DB, env.BUCKET, Date.now() + 31 * DAY);
    expect(await getJson('/api/trash', cookie)).toHaveLength(0);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM shots').first('n')).toBe(0);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM item_images').first('n')).toBe(0);
    expect(await env.BUCKET.head(`img/${img}`)).toBeNull();
    expect(await env.BUCKET.head(`img/${img}_t`)).toBeNull();
  });

  it('a photo still used elsewhere is kept', async () => {
    const cookie = await setupAndLogin();
    const img = await withProject(cookie);
    await ops(cookie, [
      { op: 'create', entity: 'shots', id: 'sh-2', fields: { projectId: 'pr-1', sceneId: 'sc-1' } },
      { op: 'create', entity: 'itemImages', id: 'ii-2', fields: { projectId: 'pr-1', ownerKind: 'shot', ownerId: 'sh-2', imageId: img } },
    ]);
    await ops(cookie, [{ op: 'delete', entity: 'shots', id: 'sh-1' }]);
    await daily(env.DB, env.BUCKET, Date.now() + 31 * DAY);
    expect(await env.BUCKET.head(`img/${img}`)).not.toBeNull();
  });

  it('the nightly job stays under the free plan’s 50 queries even when a full project expires; the rest goes the next night', async () => {
    const cookie = await setupAndLogin();
    const img = await withProject(cookie);
    await ops(cookie, [
      { op: 'create', entity: 'characters', id: 'ch-1', fields: { projectId: 'pr-1', name: 'م' } },
      { op: 'create', entity: 'locations', id: 'loc-1', fields: { projectId: 'pr-1', name: 'م' } },
      { op: 'create', entity: 'moodboards', id: 'mb-1', fields: { projectId: 'pr-1', title: 'م' } },
      { op: 'create', entity: 'notes', id: 'note-1', fields: { projectId: 'pr-1', text: 'م' } },
      { op: 'create', entity: 'boardCards', id: 'bc-1', fields: { projectId: 'pr-1', kind: 'note', refId: 'note-1', x: 0, y: 0 } },
      { op: 'create', entity: 'sceneCharacters', id: 'sc-1:ch-1', fields: { projectId: 'pr-1', sceneId: 'sc-1', characterId: 'ch-1' } },
      { op: 'create', entity: 'sceneLinks', id: 'sc-1:note:note-1', fields: { projectId: 'pr-1', sceneId: 'sc-1', kind: 'note', refId: 'note-1' } },
      { op: 'create', entity: 'planItems', id: 'pl-1', fields: { projectId: 'pr-1', sceneId: 'sc-1', kind: 'camera', x: 1, y: 1 } },
      { op: 'create', entity: 'inboxItems', id: 'in-1', fields: { projectId: 'pr-1', text: 'م' } },
      { op: 'create', entity: 'ideas', id: 'id-1', fields: { text: 'م' } },
      { op: 'create', entity: 'prefs', id: 'motion', fields: { value: { reduced: true } } },
    ]);
    await ops(cookie, [{ op: 'delete', entity: 'ideas', id: 'id-1' }, { op: 'delete', entity: 'prefs', id: 'motion' }]);
    await ops(cookie, [{ op: 'delete', entity: 'projects', id: 'pr-1' }]);
    let n = 0;
    const db = new Proxy(env.DB, {
      get(t, k) {
        if (k === 'prepare') return (q: string) => (n++, t.prepare(q));
        const v = (t as unknown as Record<string | symbol, unknown>)[k];
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
      },
    });
    await daily(db, env.BUCKET, Date.now() + 31 * DAY);
    // the scheduled handler adds one (bootstrap): room is kept under 50
    expect(n).toBeLessThanOrEqual(45);
    n = 0;
    await daily(db, env.BUCKET, Date.now() + 32 * DAY);
    expect(n).toBeLessThanOrEqual(45);
    expect(await getJson('/api/trash', cookie)).toHaveLength(0);
    for (const t of ['projects', 'scenes', 'shots', 'item_images', 'characters', 'locations', 'moodboards', 'notes', 'board_cards', 'scene_characters', 'scene_links', 'plan_items', 'inbox_items']) {
      expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first('n'), t).toBe(0);
    }
    expect(await env.BUCKET.head(`img/${img}`)).toBeNull();
  });

  it('a plan item left without its scene is cleaned up', async () => {
    const cookie = await setupAndLogin();
    await withProject(cookie);
    await ops(cookie, [{ op: 'create', entity: 'planItems', id: 'pl-o', fields: { projectId: 'pr-1', sceneId: 'sc-gone', kind: 'text', x: 0, y: 0 } }]);
    await daily(env.DB, env.BUCKET, Date.now() + DAY);
    expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM plan_items`).first('n')).toBe(0);
  });

  it('purging from the trash page deletes now; deleting a project removes its contents', async () => {
    const cookie = await setupAndLogin();
    await withProject(cookie);
    const { trashIds } = await ops(cookie, [{ op: 'delete', entity: 'projects', id: 'pr-1' }]);
    expect(await getJson('/api/projects', cookie)).toHaveLength(0);
    expect((await call(`/api/trash/${trashIds[0]}`, { method: 'DELETE', cookie })).status).toBe(200);
    for (const t of ['projects', 'scenes', 'shots', 'item_images']) {
      expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first('n'), t).toBe(0);
    }
  });
});
