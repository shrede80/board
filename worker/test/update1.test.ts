import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { duplicateProject } from '../src/duplicate';
import { sweepImages } from '../src/maintenance';
import { APP_VERSION } from '../../shared/version';
import { call, getJson, ops, setupAndLogin, upload } from './helpers';

const DAY = 24 * 3600 * 1000;

/** Counts the SQL statements a piece of code sends (D1 counts every statement, batch or not). */
function countingDb(db: D1Database) {
  let n = 0;
  const wrapped = new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') return (sql: string) => (n++, target.prepare(sql));
      const v = Reflect.get(target, prop);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  return { db: wrapped as D1Database, count: () => n };
}

describe('update 1 data: new fields keep their defaults', () => {
  it('projects, scenes and board cards get the new columns with defaults', async () => {
    const cookie = await setupAndLogin();
    await ops(cookie, [
      { op: 'create', entity: 'projects', id: 'pr-1', fields: { name: 'p' } },
      { op: 'create', entity: 'scenes', id: 'sc-1', fields: { projectId: 'pr-1' } },
      { op: 'create', entity: 'boardCards', id: 'bc-h', fields: { projectId: 'pr-1', kind: 'heading', refId: '', x: 0, y: 0, text: 'عنوان' } },
      { op: 'create', entity: 'boardCards', id: 'bc-f', fields: { projectId: 'pr-1', kind: 'frame', refId: '', x: 0, y: 0, w: 640, h: 400, color: 'gold' } },
    ]);
    const s = await getJson(`/api/projects/pr-1`, cookie);
    expect(s.project).toMatchObject({ client: '', shootDate: null, shootTime: null, stage: 'prep', archived: false });
    expect(s.rows.scenes[0]).toMatchObject({ boardW: null, boardZ: 0, boardLocked: false });
    const f = s.rows.boardCards.find((c: { id: string }) => c.id === 'bc-f');
    expect(f).toMatchObject({ kind: 'frame', w: 640, h: 400, z: 0, locked: false, color: 'gold', text: '' });
    // invalid values are refused
    const bad = await call('/api/ops', { method: 'POST', cookie, json: { ops: [{ op: 'update', entity: 'projects', id: 'pr-1', fields: { stage: 'later' } }] } });
    expect(bad.status).toBe(400);
    const badColor = await call('/api/ops', { method: 'POST', cookie, json: { ops: [{ op: 'update', entity: 'boardCards', id: 'bc-f', fields: { color: 'pink' } }] } });
    expect(badColor.status).toBe(400);
  });

  it('every API response carries the app version', async () => {
    const res = await call('/api/auth/status');
    expect(res.headers.get('X-App-Version')).toBe(APP_VERSION);
  });
});

async function bigProject(cookie: string, scenes = 40, shots = 300) {
  const img = await upload(cookie);
  const list: unknown[] = [{ op: 'create', entity: 'projects', id: 'pr-big', fields: { name: 'كبير', client: 'عميل', shootDate: '2026-11-01', stage: 'shoot' } }];
  for (let i = 0; i < scenes; i++) list.push({ op: 'create', entity: 'scenes', id: `sc-${i}`, fields: { projectId: 'pr-big', position: i + 1, locationId: 'loc-1' } });
  for (let i = 0; i < shots; i++) {
    list.push({ op: 'create', entity: 'shots', id: `sh-${i}`, fields: { projectId: 'pr-big', sceneId: `sc-${i % scenes}`, position: i, status: i % 2 ? 'shot' : 'approved', coverImageId: img } });
    list.push({ op: 'create', entity: 'itemImages', id: `ii-${i}`, fields: { projectId: 'pr-big', ownerKind: 'shot', ownerId: `sh-${i}`, imageId: img, position: 1 } });
  }
  list.push(
    { op: 'create', entity: 'locations', id: 'loc-1', fields: { projectId: 'pr-big', name: 'موقع' } },
    { op: 'create', entity: 'characters', id: 'ch-1', fields: { projectId: 'pr-big', name: 'سارة' } },
    { op: 'create', entity: 'sceneCharacters', id: 'sc-0:ch-1', fields: { projectId: 'pr-big', sceneId: 'sc-0', characterId: 'ch-1' } },
    { op: 'create', entity: 'notes', id: 'note-1', fields: { projectId: 'pr-big', text: 'ن' } },
    { op: 'create', entity: 'sceneLinks', id: 'sc-0:note:note-1', fields: { projectId: 'pr-big', sceneId: 'sc-0', kind: 'note', refId: 'note-1' } },
    { op: 'create', entity: 'boardCards', id: 'bc-1', fields: { projectId: 'pr-big', kind: 'character', refId: 'ch-1', x: 1, y: 2 } },
    { op: 'create', entity: 'boardCards', id: 'bc-2', fields: { projectId: 'pr-big', kind: 'image', refId: img, x: 1, y: 2, text: 'تعليق' } },
    { op: 'create', entity: 'boardCards', id: 'bc-3', fields: { projectId: 'pr-big', kind: 'frame', refId: '', x: 1, y: 2 } },
  );
  await ops(cookie, list);
  return img;
}

describe('duplicate project (UPDATE-1 أ1)', () => {
  it('copies everything with new ids, shares the images, resets statuses — within the query limit', async () => {
    const cookie = await setupAndLogin();
    const img = await bigProject(cookie);
    const { db, count } = countingDb(env.DB);
    const { projectId } = await duplicateProject(db, 'pr-big');
    expect(count()).toBeLessThanOrEqual(20);
    const a = await getJson('/api/projects/pr-big', cookie);
    const b = await getJson(`/api/projects/${projectId}`, cookie);
    expect(b.project).toMatchObject({ name: 'كبير (نسخة)', client: 'عميل', shootDate: null, stage: 'prep', archived: false });
    for (const e of ['scenes', 'shots', 'characters', 'locations', 'notes', 'boardCards', 'itemImages', 'sceneCharacters', 'sceneLinks']) {
      expect(b.rows[e].length, e).toBe(a.rows[e].length);
      const oldIds = new Set(a.rows[e].map((r: { id: string }) => r.id));
      expect(b.rows[e].some((r: { id: string }) => oldIds.has(r.id)), e).toBe(false);
    }
    expect(b.rows.shots.every((s: { status: string }) => s.status === 'planned')).toBe(true);
    // references point inside the copy
    const sceneIds = new Set(b.rows.scenes.map((r: { id: string }) => r.id));
    expect(b.rows.shots.every((s: { sceneId: string }) => sceneIds.has(s.sceneId))).toBe(true);
    const loc = b.rows.locations[0].id;
    expect(b.rows.scenes.every((s: { locationId: string }) => s.locationId === loc)).toBe(true);
    const ch = b.rows.characters[0].id;
    expect(b.rows.boardCards.find((c: { kind: string }) => c.kind === 'character').refId).toBe(ch);
    expect(b.rows.boardCards.find((c: { kind: string }) => c.kind === 'image').refId).toBe(img);
    expect(b.rows.boardCards.find((c: { kind: string }) => c.kind === 'frame').refId).toBe('');
    // images by reference, no new image rows
    expect(b.rows.itemImages.every((r: { imageId: string }) => r.imageId === img)).toBe(true);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM images').first<{ n: number }>())!.n).toBe(1);
    // link ids keep the client convention (so unlinking works)
    const sc = b.rows.sceneCharacters[0];
    expect(sc.id).toBe(`${sc.sceneId}:${sc.characterId}`);
    const sl = b.rows.sceneLinks[0];
    expect(sl.id).toBe(`${sl.sceneId}:note:${sl.refId}`);
    // the original is untouched
    expect(a.rows.shots.some((s: { status: string }) => s.status !== 'planned')).toBe(true);
  });

  it('keepStatus keeps the shot statuses; the endpoint works', async () => {
    const cookie = await setupAndLogin();
    await bigProject(cookie, 2, 4);
    const res = await call('/api/projects/pr-big/duplicate', { method: 'POST', cookie, json: { keepStatus: true } });
    expect(res.status).toBe(200);
    const { projectId } = (await res.json()) as { projectId: string };
    const b = await getJson(`/api/projects/${projectId}`, cookie);
    expect(b.rows.shots.filter((s: { status: string }) => s.status !== 'planned').length).toBe(4);
    expect((await call('/api/projects/nope/duplicate', { method: 'POST', cookie, json: {} })).status).toBe(400);
  });

  it('skips rows of deleted scenes', async () => {
    const cookie = await setupAndLogin();
    await bigProject(cookie, 2, 4);
    await ops(cookie, [{ op: 'delete', entity: 'scenes', id: 'sc-1' }]);
    const { projectId } = await duplicateProject(env.DB, 'pr-big');
    const b = await getJson(`/api/projects/${projectId}`, cookie);
    expect(b.rows.scenes).toHaveLength(1);
    expect(b.rows.shots).toHaveLength(2);
  });
});

describe('deleting a library item and restoring it brings its links back (UPDATE-1 أ2)', () => {
  for (const [entity, kind] of [['characters', 'character'], ['locations', 'location'], ['moodboards', 'moodboard']] as const) {
    it(entity, async () => {
      const cookie = await setupAndLogin();
      const id = `x-${kind}`;
      const links: unknown[] =
        kind === 'character' ? [{ op: 'create', entity: 'sceneCharacters', id: `sc-1:${id}`, fields: { projectId: 'pr-1', sceneId: 'sc-1', characterId: id } }]
        : kind === 'location' ? [{ op: 'update', entity: 'scenes', id: 'sc-1', fields: { locationId: id } }]
        : [{ op: 'create', entity: 'sceneLinks', id: `sc-1:moodboard:${id}`, fields: { projectId: 'pr-1', sceneId: 'sc-1', kind: 'moodboard', refId: id } }];
      await ops(cookie, [
        { op: 'create', entity: 'projects', id: 'pr-1', fields: { name: 'p' } },
        { op: 'create', entity: 'scenes', id: 'sc-1', fields: { projectId: 'pr-1' } },
        { op: 'create', entity, id, fields: { projectId: 'pr-1' } },
        { op: 'create', entity: 'boardCards', id: 'bc-1', fields: { projectId: 'pr-1', kind, refId: id, x: 0, y: 0 } },
        ...links,
      ]);
      const del = await ops(cookie, [{ op: 'delete', entity, id }]);
      let s = await getJson('/api/projects/pr-1', cookie);
      expect(s.rows[entity]).toHaveLength(0);
      expect(s.rows.boardCards).toHaveLength(0);
      await ops(cookie, [{ op: 'restore', trashId: del.trashIds[0] }]);
      s = await getJson('/api/projects/pr-1', cookie);
      expect(s.rows[entity]).toHaveLength(1);
      expect(s.rows.boardCards).toHaveLength(1);
      if (kind === 'character') expect(s.rows.sceneCharacters).toHaveLength(1);
      if (kind === 'location') expect(s.rows.scenes[0].locationId).toBe(id);
      if (kind === 'moodboard') expect(s.rows.sceneLinks).toHaveLength(1);
    });
  }
});

describe('orphan image cleanup keeps images used by ideas and image cards (UPDATE-1 §2.3)', () => {
  it('only removes the image nothing points at', async () => {
    const cookie = await setupAndLogin();
    const [onCard, inIdea, orphan] = [await upload(cookie), await upload(cookie), await upload(cookie)];
    await ops(cookie, [
      { op: 'create', entity: 'projects', id: 'pr-1', fields: { name: 'p' } },
      { op: 'create', entity: 'boardCards', id: 'bc-1', fields: { projectId: 'pr-1', kind: 'image', refId: onCard, x: 0, y: 0 } },
    ]);
    await env.DB.prepare(`INSERT INTO ideas (id, owner_id, text, image_ids, created_at, updated_at) VALUES ('idea-1', 'owner', '', ?, 1, 1)`)
      .bind(JSON.stringify([inIdea])).run();
    const removed = await sweepImages(env.DB, env.BUCKET, Date.now() + 2 * DAY);
    expect(removed).toBe(1);
    const left = (await env.DB.prepare('SELECT id FROM images').all<{ id: string }>()).results.map((r) => r.id).sort();
    expect(left).toEqual([onCard, inIdea].sort());
    expect(await env.BUCKET.head(`images/${orphan}.webp`)).toBeNull();
  });
});

describe('export → import carries the new fields and card kinds', () => {
  it('round trip', async () => {
    const cookie = await setupAndLogin();
    const img = await upload(cookie);
    await ops(cookie, [
      { op: 'create', entity: 'projects', id: 'pr-1', fields: { name: 'p', client: 'ع', stage: 'post', shootDate: '2026-12-01', shootTime: '07:30' } },
      { op: 'create', entity: 'scenes', id: 'sc-1', fields: { projectId: 'pr-1', boardW: 400, boardZ: 3, boardLocked: true } },
      { op: 'create', entity: 'characters', id: 'ch-1', fields: { projectId: 'pr-1' } },
      { op: 'create', entity: 'sceneCharacters', id: 'sc-1:ch-1', fields: { projectId: 'pr-1', sceneId: 'sc-1', characterId: 'ch-1' } },
      { op: 'create', entity: 'boardCards', id: 'bc-i', fields: { projectId: 'pr-1', kind: 'image', refId: img, x: 0, y: 0, w: 300, text: 'cap' } },
      { op: 'create', entity: 'boardCards', id: 'bc-h', fields: { projectId: 'pr-1', kind: 'heading', refId: '', x: 0, y: 0, text: 'عنوان', h: 60, color: 'wine' } },
    ]);
    const exp = await getJson('/api/projects/pr-1/export', cookie);
    expect(exp.images.map((i: { id: string }) => i.id)).toContain(img);
    const res = await call('/api/import', { method: 'POST', cookie, json: { project: exp, imageMap: { [img]: img } } });
    expect(res.status).toBe(200);
    const { projectId } = (await res.json()) as { projectId: string };
    const b = await getJson(`/api/projects/${projectId}`, cookie);
    expect(b.project).toMatchObject({ client: 'ع', stage: 'post', shootDate: '2026-12-01', shootTime: '07:30' });
    expect(b.rows.scenes[0]).toMatchObject({ boardW: 400, boardZ: 3, boardLocked: true });
    expect(b.rows.boardCards.find((c: { kind: string }) => c.kind === 'image')).toMatchObject({ refId: img, w: 300, text: 'cap' });
    expect(b.rows.boardCards.find((c: { kind: string }) => c.kind === 'heading')).toMatchObject({ refId: '', text: 'عنوان', h: 60, color: 'wine' });
    const sc = b.rows.sceneCharacters[0];
    expect(sc.id).toBe(`${sc.sceneId}:${sc.characterId}`);
  });

  it('an old file without the new fields imports with defaults', async () => {
    const cookie = await setupAndLogin();
    const old = {
      format: 'lawhat-almashahed/1', exportedAt: '2026-10-01T00:00:00Z',
      project: { id: 'pr-o', name: 'قديم', template: 'blank', aspect: '16:9' },
      rows: { scenes: [{ id: 'sc-o', projectId: 'pr-o', position: 1, name: 'م' }], boardCards: [{ id: 'bc-o', projectId: 'pr-o', kind: 'note', refId: 'note-o', x: 0, y: 0 }], notes: [{ id: 'note-o', projectId: 'pr-o', text: 'ن' }] },
      images: [],
    };
    const res = await call('/api/import', { method: 'POST', cookie, json: { project: old, imageMap: {} } });
    expect(res.status).toBe(200);
    const { projectId } = (await res.json()) as { projectId: string };
    const b = await getJson(`/api/projects/${projectId}`, cookie);
    expect(b.project).toMatchObject({ stage: 'prep', archived: false, client: '' });
    expect(b.rows.boardCards[0]).toMatchObject({ w: null, z: 0, locked: false, text: '' });
  });
});
