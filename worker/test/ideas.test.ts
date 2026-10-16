import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import migration from '../migrations/0004_inbox_to_ideas.sql?raw';
import { call, getJson, ops, setupAndLogin, upload } from './helpers';

/** Inserts inbox rows the way the old app wrote them (real-shaped data). */
async function inbox(rows: { id: string; project: string; image?: string | null; text: string; scene?: string | null; isNew?: number; created: number; deleted?: number | null }[]) {
  await env.DB.batch(rows.map((r) =>
    env.DB.prepare(
      `INSERT INTO inbox_items (id, project_id, kind, image_id, text, scene_id, is_new, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(r.id, r.project, r.image ? 'image' : 'note', r.image ?? null, r.text, r.scene ?? null, r.isNew ?? 1, r.created, r.created, r.deleted ?? null),
  ));
}
const runMigration = () => env.DB.prepare(migration).run();
const count = async (sql: string) => (await env.DB.prepare(sql).first<{ n: number }>())!.n;

describe('migration 0004: inbox → ideas (UPDATE-1 §2.2)', () => {
  it('copies every inbox item, keeps the inbox, and is safe to run again', async () => {
    const cookie = await setupAndLogin();
    const img = await upload(cookie);
    await ops(cookie, [
      { op: 'create', entity: 'projects', id: 'pr-1', fields: { name: 'p' } },
      { op: 'create', entity: 'scenes', id: 'sc-1', fields: { projectId: 'pr-1' } },
    ]);
    await inbox([
      { id: 'in-a', project: 'pr-1', image: img, text: 'صورة من الجوال', scene: 'sc-1', created: 1000 },
      { id: 'in-b', project: 'pr-1', text: 'تذكير: إذن الحارس', isNew: 0, created: 2000 },
      { id: 'in-c', project: 'pr-1', text: 'نُقلت إلى لقطة', created: 3000, deleted: 3500 },
    ]);
    await runMigration();
    expect(await count('SELECT COUNT(*) AS n FROM ideas')).toBe(3);
    expect(await count('SELECT COUNT(*) AS n FROM inbox_items')).toBe(3); // nothing removed
    const a = await env.DB.prepare('SELECT * FROM ideas WHERE id = ?').bind('in-a').first<Record<string, unknown>>();
    expect(a).toMatchObject({ owner_id: 'owner', project_id: 'pr-1', scene_id: 'sc-1', text: 'صورة من الجوال', image_ids: JSON.stringify([img]), source: 'phone', is_new: 1, created_at: 1000, deleted_at: null });
    expect(a!.updated_at as number).toBeGreaterThan(Date.now() - 60_000); // polling devices receive it
    const b = await env.DB.prepare('SELECT * FROM ideas WHERE id = ?').bind('in-b').first<Record<string, unknown>>();
    expect(b).toMatchObject({ image_ids: '[]', is_new: 0 });
    const c = await env.DB.prepare('SELECT deleted_at FROM ideas WHERE id = ?').bind('in-c').first<{ deleted_at: number }>();
    expect(c!.deleted_at).toBe(3500);

    // the user edits an idea, an old phone adds one more inbox row, the migration runs again
    await ops(cookie, [{ op: 'update', entity: 'ideas', id: 'in-b', fields: { text: 'معدّلة' } }]);
    await inbox([{ id: 'in-d', project: 'pr-1', text: 'جديدة بين المرحلتين', created: 4000 }]);
    await runMigration();
    await runMigration();
    expect(await count('SELECT COUNT(*) AS n FROM ideas')).toBe(4); // no duplicates, nothing lost
    expect((await env.DB.prepare('SELECT text FROM ideas WHERE id = ?').bind('in-b').first<{ text: string }>())!.text).toBe('معدّلة');
    const live = await getJson('/api/home', cookie);
    expect(live.rows.ideas.map((r: { id: string }) => r.id).sort()).toEqual(['in-a', 'in-b', 'in-d']);
    expect(live.images.map((i: { id: string }) => i.id)).toContain(img);
  });
});

describe('ideas over the API', () => {
  it('an old app writing inboxItems is stored as an idea (create, mark read, convert)', async () => {
    const cookie = await setupAndLogin();
    const img = await upload(cookie);
    await ops(cookie, [{ op: 'create', entity: 'projects', id: 'pr-1', fields: { name: 'p' } }]);
    await ops(cookie, [{ op: 'create', entity: 'inboxItems', id: 'in-old', fields: { projectId: 'pr-1', kind: 'image', imageId: img, text: 'من نسخة قديمة', sceneId: null, isNew: true } }]);
    const row = await env.DB.prepare('SELECT * FROM ideas WHERE id = ?').bind('in-old').first<Record<string, unknown>>();
    expect(row).toMatchObject({ project_id: 'pr-1', text: 'من نسخة قديمة', image_ids: JSON.stringify([img]), source: 'phone', is_new: 1 });
    expect(await count('SELECT COUNT(*) AS n FROM inbox_items')).toBe(0); // never written again
    await ops(cookie, [{ op: 'update', entity: 'inboxItems', id: 'in-old', fields: { isNew: false } }]);
    expect((await env.DB.prepare('SELECT is_new FROM ideas WHERE id = ?').bind('in-old').first<{ is_new: number }>())!.is_new).toBe(0);
    await ops(cookie, [{ op: 'delete', entity: 'inboxItems', id: 'in-old' }]);
    expect((await env.DB.prepare('SELECT deleted_at FROM ideas WHERE id = ?').bind('in-old').first<{ deleted_at: number }>())!.deleted_at).toBeTruthy();
  });

  it('sending the same idea twice (a retried queue) gives one idea', async () => {
    const cookie = await setupAndLogin();
    const op = { op: 'create', entity: 'ideas', id: 'idea-q1', fields: { text: 'فكرة بلا اتصال', imageIds: [], source: 'phone', projectId: null } };
    await ops(cookie, [op]);
    await ops(cookie, [op]);
    expect(await count("SELECT COUNT(*) AS n FROM ideas WHERE id = 'idea-q1'")).toBe(1);
    expect((await getJson('/api/home', cookie)).rows.ideas).toHaveLength(1);
  });

  it('validates images, goes to the trash and comes back', async () => {
    const cookie = await setupAndLogin();
    const bad = await call('/api/ops', { method: 'POST', cookie, json: { ops: [{ op: 'create', entity: 'ideas', id: 'idea-x', fields: { imageIds: Array.from({ length: 11 }, (_, i) => `img-${i}`) } }] } });
    expect(bad.status).toBe(400);
    await ops(cookie, [{ op: 'create', entity: 'ideas', id: 'idea-1', fields: { text: 'لقطة درون' } }]);
    const del = await ops(cookie, [{ op: 'delete', entity: 'ideas', id: 'idea-1' }]);
    expect(del.trashIds[0]).toBeTruthy();
    const trash = await getJson('/api/trash', cookie);
    expect(trash[0]).toMatchObject({ kind: 'ideas', label: 'فكرة: لقطة درون' });
    await ops(cookie, [{ op: 'restore', trashId: del.trashIds[0] }]);
    expect((await getJson('/api/home', cookie)).rows.ideas).toHaveLength(1);
  });

  it('home, owner changes and project snapshots all carry ideas; image cards keep their photo size', async () => {
    const cookie = await setupAndLogin();
    const img = await upload(cookie);
    await ops(cookie, [
      { op: 'create', entity: 'projects', id: 'pr-1', fields: { name: 'p' } },
      { op: 'create', entity: 'boardCards', id: 'bc-i', fields: { projectId: 'pr-1', kind: 'image', refId: img, x: 0, y: 0 } },
    ]);
    const before = (await getJson('/api/home', cookie)).now;
    await ops(cookie, [{ op: 'create', entity: 'ideas', id: 'idea-1', fields: { text: 'x', projectId: 'pr-1' } }]);
    const ch = await getJson(`/api/changes?since=${before}`, cookie);
    expect(ch.rows.ideas.map((r: { id: string }) => r.id)).toEqual(['idea-1']);
    const snap = await getJson('/api/projects/pr-1', cookie);
    expect(snap.rows.ideas).toHaveLength(1);
    expect(snap.images.find((i: { id: string }) => i.id === img)).toMatchObject({ width: 2400, height: 1350 });
    const pch = await getJson(`/api/projects/pr-1/changes?since=${before}`, cookie);
    expect(pch.rows.ideas).toHaveLength(1);
  });

  it('search finds projects, clients, scenes, shots and ideas (UPDATE-1 ب1)', async () => {
    const cookie = await setupAndLogin();
    await ops(cookie, [
      { op: 'create', entity: 'projects', id: 'pr-1', fields: { name: 'إعلان مطعم', client: 'سفرة نجد' } },
      { op: 'create', entity: 'scenes', id: 'sc-1', fields: { projectId: 'pr-1', name: 'المطبخ وقت الغروب' } },
      { op: 'create', entity: 'shots', id: 'sh-1', fields: { projectId: 'pr-1', sceneId: 'sc-1', description: 'لقطة غروب واسعة' } },
      { op: 'create', entity: 'ideas', id: 'idea-1', fields: { text: 'درون وقت الغروب' } },
      { op: 'create', entity: 'ideas', id: 'idea-2', fields: { text: '100% خصم' } },
    ]);
    const hits = await getJson(`/api/search?q=${encodeURIComponent('غروب')}`, cookie);
    expect(hits.map((h: { kind: string }) => h.kind).sort()).toEqual(['idea', 'scene', 'shot']);
    expect((await getJson(`/api/search?q=${encodeURIComponent('نجد')}`, cookie))[0]).toMatchObject({ kind: 'project', id: 'pr-1' });
    // % is a literal, not a wildcard
    expect(await getJson(`/api/search?q=${encodeURIComponent('%')}`, cookie)).toHaveLength(1);
    expect(await getJson('/api/search?q=', cookie)).toEqual([]);
  });

  it('a project file carries its ideas', async () => {
    const cookie = await setupAndLogin();
    const img = await upload(cookie);
    await ops(cookie, [
      { op: 'create', entity: 'projects', id: 'pr-1', fields: { name: 'p' } },
      { op: 'create', entity: 'scenes', id: 'sc-1', fields: { projectId: 'pr-1' } },
      { op: 'create', entity: 'ideas', id: 'idea-1', fields: { text: 'فكرة المشروع', projectId: 'pr-1', sceneId: 'sc-1', imageIds: [img] } },
      { op: 'create', entity: 'ideas', id: 'idea-2', fields: { text: 'فكرة عامة' } },
    ]);
    const exp = await getJson('/api/projects/pr-1/export', cookie);
    expect(exp.rows.ideas).toHaveLength(1);
    expect(exp.images.map((i: { id: string }) => i.id)).toContain(img);
    const res = await call('/api/import', { method: 'POST', cookie, json: { project: exp, imageMap: { [img]: img } } });
    const { projectId } = (await res.json()) as { projectId: string };
    const home = await getJson('/api/home', cookie);
    const copy = home.rows.ideas.find((r: { projectId: string }) => r.projectId === projectId);
    const sc = (await getJson(`/api/projects/${projectId}`, cookie)).rows.scenes[0];
    expect(copy).toMatchObject({ text: 'فكرة المشروع', sceneId: sc.id, imageIds: [img] });
  });
});
