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
