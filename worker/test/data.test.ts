import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { emptyStore, numbering, positionAt, shotsOf, orderedScenes, type Store } from '../../shared/model';
import type { Row } from '../../shared/schema';
import { call, getJson, ops, setupAndLogin } from './helpers';

const P = 'pr-test';

async function project(cookie: string) {
  await ops(cookie, [
    { op: 'create', entity: 'projects', id: P, fields: { name: 'إعلان', template: 'ad', aspect: '16:9' } },
    ...['a', 'b', 'c'].map((s, i) => ({ op: 'create', entity: 'scenes', id: `sc-${s}`, fields: { projectId: P, position: i + 1, name: `مشهد ${s}` } })),
    ...[1, 2, 3].map((n) => ({ op: 'create', entity: 'shots', id: `sh-a${n}`, fields: { projectId: P, sceneId: 'sc-a', position: n, description: `a${n}` } })),
    ...[1, 2].map((n) => ({ op: 'create', entity: 'shots', id: `sh-b${n}`, fields: { projectId: P, sceneId: 'sc-b', position: n, description: `b${n}` } })),
  ]);
}

async function store(cookie: string): Promise<Store> {
  const snap = await getJson(`/api/projects/${P}`, cookie);
  const s = emptyStore();
  for (const [e, list] of Object.entries(snap.rows as Record<string, Row[]>)) for (const r of list) s[e as keyof Store].set(r.id, r);
  return s;
}

describe('ops and numbering', () => {
  it('creates a project and derives numbers from positions', async () => {
    const cookie = await setupAndLogin();
    await project(cookie);
    const n = numbering(await store(cookie), P);
    expect([...n.scenes.values()]).toEqual([1, 2, 3]);
    expect(n.shots.get('sh-a3')).toBe('1.3');
    expect(n.shots.get('sh-b1')).toBe('2.1');
  });

  it('moves a shot to another scene in one request and renumbers', async () => {
    const cookie = await setupAndLogin();
    await project(cookie);
    const s = await store(cookie);
    // drop sh-a1 between b1 and b2
    const pos = positionAt(shotsOf(s, 'sc-b'), 1);
    await ops(cookie, [{ op: 'update', entity: 'shots', id: 'sh-a1', fields: { sceneId: 'sc-b', position: pos } }]);
    const n = numbering(await store(cookie), P);
    expect(n.shots.get('sh-a2')).toBe('1.1');
    expect(n.shots.get('sh-a3')).toBe('1.2');
    expect(n.shots.get('sh-b1')).toBe('2.1');
    expect(n.shots.get('sh-a1')).toBe('2.2');
    expect(n.shots.get('sh-b2')).toBe('2.3');
  });

  it('reorders scenes by updating one row', async () => {
    const cookie = await setupAndLogin();
    await project(cookie);
    const s = await store(cookie);
    await ops(cookie, [{ op: 'update', entity: 'scenes', id: 'sc-c', fields: { position: positionAt(orderedScenes(s, P), 0) } }]);
    const n = numbering(await store(cookie), P);
    expect(n.scenes.get('sc-c')).toBe(1);
    expect(n.shots.get('sh-a1')).toBe('2.1');
  });

  it('deleting a scene trashes it with its shots; restore brings both back in place', async () => {
    const cookie = await setupAndLogin();
    await project(cookie);
    const res = await ops(cookie, [{ op: 'delete', entity: 'scenes', id: 'sc-a', label: 'مشهد 01: مشهد a' }]);
    const tid = res.trashIds[0]!;
    expect(tid).toMatch(/^tr-/);
    let n = numbering(await store(cookie), P);
    expect(n.scenes.get('sc-b')).toBe(1);
    expect(n.shots.has('sh-a1')).toBe(false);
    const trash = await getJson('/api/trash', cookie);
    expect(trash).toHaveLength(1);
    expect(trash[0]).toMatchObject({ id: tid, kind: 'scenes', label: 'مشهد 01: مشهد a', extra: 3, projectName: 'إعلان' });

    expect((await call(`/api/trash/${tid}/restore`, { method: 'POST', cookie })).status).toBe(200);
    n = numbering(await store(cookie), P);
    expect(n.scenes.get('sc-a')).toBe(1);
    expect(n.shots.get('sh-a3')).toBe('1.3');
    expect(await getJson('/api/trash', cookie)).toHaveLength(0);
  });

  it('a shot deleted before its scene stays in the trash when the scene is restored', async () => {
    const cookie = await setupAndLogin();
    await project(cookie);
    await ops(cookie, [{ op: 'delete', entity: 'shots', id: 'sh-a2' }]);
    const { trashIds } = await ops(cookie, [{ op: 'delete', entity: 'scenes', id: 'sc-a' }]);
    await ops(cookie, [{ op: 'restore', trashId: trashIds[0] }]);
    const n = numbering(await store(cookie), P);
    expect(n.shots.get('sh-a3')).toBe('1.2');
    expect(n.shots.has('sh-a2')).toBe(false);
    const trash = await getJson('/api/trash', cookie);
    expect(trash.map((t: { kind: string }) => t.kind)).toEqual(['shots']);
  });

  it('discard (undo of create) leaves no trash entry; undelete brings it back', async () => {
    const cookie = await setupAndLogin();
    await project(cookie);
    await ops(cookie, [{ op: 'discard', entity: 'scenes', id: 'sc-c' }]);
    expect(await getJson('/api/trash', cookie)).toHaveLength(0);
    expect((await store(cookie)).scenes.has('sc-c')).toBe(false);
    await ops(cookie, [{ op: 'undelete', entity: 'scenes', id: 'sc-c' }]);
    expect((await store(cookie)).scenes.has('sc-c')).toBe(true);
  });

  it('only changed fields are written (field-level last write wins)', async () => {
    const cookie = await setupAndLogin();
    await project(cookie);
    // phone changes status, laptop edits description of the same shot
    await call('/api/shots/sh-a1', { method: 'PATCH', cookie, json: { status: 'shot' } });
    await call('/api/shots/sh-a1', { method: 'PATCH', cookie, json: { description: 'نص جديد' } });
    const sh = (await store(cookie)).shots.get('sh-a1')!;
    expect(sh.status).toBe('shot');
    expect(sh.description).toBe('نص جديد');
  });

  it('validates input', async () => {
    const cookie = await setupAndLogin();
    await project(cookie);
    const bad = async (o: unknown) => (await call('/api/ops', { method: 'POST', cookie, json: { ops: [o] } })).status;
    expect(await bad({ op: 'update', entity: 'shots', id: 'sh-a1', fields: { status: 'done' } })).toBe(400);
    expect(await bad({ op: 'update', entity: 'shots', id: 'sh-a1', fields: { nope: 1 } })).toBe(400);
    expect(await bad({ op: 'update', entity: 'shots', id: 'sh-a1', fields: { projectId: 'x' } })).toBe(400);
    expect(await bad({ op: 'update', entity: 'nope', id: 'x', fields: {} })).toBe(400);
    expect(await bad({ op: 'create', entity: 'scenes', id: 'sc-z', fields: { projectId: 'pr-missing' } })).toBe(400);
    expect(await bad({ op: 'create', entity: 'scenes', id: "x'; DROP TABLE scenes;--", fields: { projectId: P } })).toBe(400);
    expect(await bad({ op: 'update', entity: 'projects', id: P, fields: { aspect: '4:3' } })).toBe(400);
    expect((await store(cookie)).scenes.size).toBe(3);
  });

  it('a big batch (auto-arrange of 40 scenes) is one transaction', async () => {
    const cookie = await setupAndLogin();
    await project(cookie);
    const many = Array.from({ length: 40 }, (_, i) => ({ op: 'create', entity: 'scenes', id: `sc-m${i}`, fields: { projectId: P, position: 10 + i } }));
    await ops(cookie, many);
    await ops(cookie, many.map((m, i) => ({ op: 'update', entity: 'scenes', id: m.id, fields: { boardX: i * 10, boardY: i * 20 } })));
    const s = await store(cookie);
    expect(s.scenes.get('sc-m39')).toMatchObject({ boardX: 390, boardY: 780 });
    // an invalid op anywhere rejects the whole batch
    const res = await call('/api/ops', { method: 'POST', cookie, json: { ops: [{ op: 'update', entity: 'scenes', id: 'sc-a', fields: { name: 'X' } }, { op: 'update', entity: 'scenes', id: 'sc-b', fields: { intExt: 'bad' } }] } });
    expect(res.status).toBe(400);
    expect((await store(cookie)).scenes.get('sc-a')!.name).toBe('مشهد a');
  });
});

describe('changes since (sync between devices)', () => {
  it('returns rows changed after a time, including deletions', async () => {
    const cookie = await setupAndLogin();
    await project(cookie);
    const first = await getJson(`/api/projects/${P}/changes?since=0`, cookie);
    expect(first.rows.scenes).toHaveLength(3);
    const since = first.now;
    await new Promise((r) => setTimeout(r, 5));
    await ops(cookie, [{ op: 'update', entity: 'shots', id: 'sh-b1', fields: { status: 'approved' } }, { op: 'delete', entity: 'shots', id: 'sh-b2' }]);
    const next = await getJson(`/api/projects/${P}/changes?since=${since}`, cookie);
    expect(next.rows.scenes).toBeUndefined();
    const shots = next.rows.shots as Row[];
    expect(shots.map((r) => r.id).sort()).toEqual(['sh-b1', 'sh-b2']);
    expect(shots.find((r) => r.id === 'sh-b2')!.deletedAt).toBeTruthy();
    expect(shots.find((r) => r.id === 'sh-b1')!.status).toBe('approved');
  });
});

describe('equipment and settings', () => {
  it('serves equipment with lens data and keeps settings', async () => {
    const cookie = await setupAndLogin();
    const eq = await getJson('/api/equipment', cookie);
    const zve = eq.find((e: Row) => e.id === 'cam-zve10');
    expect(zve).toMatchObject({ role: 'camera', icon: 'camera', lensIds: ['lens-sigma1850', 'lens-sonypz'], defaultLensId: 'lens-sigma1850', isDefault: true });
    expect(eq.find((e: Row) => e.id === 'cam-iphone15').builtinLenses).toHaveLength(4);
    expect(eq.find((e: Row) => e.id === 'sup-drone')).toMatchObject({ virtual: true, motions: expect.arrayContaining(['ريفيل']) });
    const s = await (await call('/api/settings', { method: 'PATCH', cookie, json: { theme: 'dark', boardSnap: false } })).json();
    expect(s).toMatchObject({ theme: 'dark', boardSnap: false, equipmentCategories: expect.arrayContaining(['الصوت']) });
    expect(await env.DB.prepare('SELECT theme FROM settings').first('theme')).toBe('dark');
  });

  it('lists free-text values typed by the user', async () => {
    const cookie = await setupAndLogin();
    await project(cookie);
    await ops(cookie, [{ op: 'update', entity: 'shots', id: 'sh-a1', fields: { cameraId: 'كاميرا مستأجرة', rigId: 'sup-benro', lightingIds: ['lt-hs60b', 'شمعة'] } }]);
    const cv = await getJson('/api/custom-values', cookie);
    expect(cv.camera).toEqual(['كاميرا مستأجرة']);
    expect(cv.support).toEqual([]);
    expect(cv.lighting).toEqual(['شمعة']);
  });
});
