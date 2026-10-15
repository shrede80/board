import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { seedProjects } from '../../shared/seed';
import type { Row } from '../../shared/schema';
import { call, getJson, setupAndLogin, upload } from './helpers';
import seed from './fixtures/seed.json';

async function importSeed(cookie: string) {
  const portable = seedProjects(seed)[0];
  const res = await call('/api/import', { method: 'POST', cookie, json: { project: portable, imageMap: {}, keepName: true } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { projectId: string }).projectId;
}

/** Project content with ids replaced by their meaning, so two copies can be compared. */
function normalize(p: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const names = new Map<string, string>();
  const rows = p.rows as Record<string, Row[]>;
  const label = (e: string, r: Row) => `${e}:${r.name ?? r.title ?? r.text ?? r.description ?? r.position ?? ''}`;
  for (const [e, list] of Object.entries(rows)) for (const r of list) names.set(r.id, label(e, r));
  p.images.forEach((im: { id: string; placeholder: unknown }) => names.set(im.id, `img:${JSON.stringify(im.placeholder)}`));
  const swap = (v: unknown): unknown => (typeof v === 'string' && names.has(v) ? names.get(v) : Array.isArray(v) ? v.map(swap) : v);
  const out: Record<string, unknown[]> = {};
  for (const [e, list] of Object.entries(rows)) {
    out[e] = list
      .map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !['id', 'projectId', 'createdAt', 'updatedAt', 'deletedAt'].includes(k)).map(([k, v]) => [k, swap(v)])))
      .map((r) => JSON.stringify(r))
      .sort();
  }
  return out;
}

describe('export → import round trip', () => {
  it('imports the prototype seed as a full project', async () => {
    const cookie = await setupAndLogin();
    const id = await importSeed(cookie);
    const snap = await getJson(`/api/projects/${id}`, cookie);
    expect(snap.project.name).toBe('إعلان مشروع سكني — حي الياسمين');
    expect(snap.rows.scenes).toHaveLength(6);
    expect(snap.rows.shots).toHaveLength(22);
    expect(snap.rows.characters).toHaveLength(4);
    expect(snap.rows.boardCards).toHaveLength(5);
    expect(snap.images.length).toBeGreaterThan(20);
    expect(snap.images[0].placeholder).toMatchObject({ x: expect.any(Number) });
    const list = await getJson('/api/projects', cookie);
    expect(list[0]).toMatchObject({ id, scenes: 6, shots: 22, durationS: 63 });
  });

  it('export then import gives back the same project with new ids', async () => {
    const cookie = await setupAndLogin();
    const id = await importSeed(cookie);
    const a = await getJson(`/api/projects/${id}/export`, cookie);
    const res = await call('/api/import', { method: 'POST', cookie, json: { project: a, imageMap: {} } });
    const { projectId } = (await res.json()) as { projectId: string };
    expect(projectId).not.toBe(id);
    const b = await getJson(`/api/projects/${projectId}/export`, cookie);
    expect(b.project.name).toBe(`${a.project.name} (مستورد)`);
    expect(normalize(b)).toEqual(normalize(a));
    // no id is shared between the two copies
    const idsA = new Set(Object.values(a.rows as Record<string, Row[]>).flat().map((r) => r.id));
    const idsB = Object.values(b.rows as Record<string, Row[]>).flat().map((r) => r.id);
    expect(idsB.some((x) => idsA.has(x))).toBe(false);
    // the original is untouched
    expect((await getJson(`/api/projects/${id}`, cookie)).rows.shots).toHaveLength(22);
  });

  it('keeps uploaded photos through the round trip (via the image map)', async () => {
    const cookie = await setupAndLogin();
    const id = await importSeed(cookie);
    const up = await upload(cookie);
    const shot = (await getJson(`/api/projects/${id}`, cookie)).rows.shots[0];
    await call('/api/ops', { method: 'POST', cookie, json: { ops: [{ op: 'create', entity: 'itemImages', id: 'ii-real', fields: { projectId: id, ownerKind: 'shot', ownerId: shot.id, imageId: up, position: 99 } }] } });
    const a = await getJson(`/api/projects/${id}/export`, cookie);
    const real = a.images.find((i: { id: string }) => i.id === up);
    expect(real.file).toBe(`images/${up}.webp`);
    const up2 = await upload(cookie);
    const res = await call('/api/import', { method: 'POST', cookie, json: { project: a, imageMap: { [up]: up2 } } });
    const { projectId } = (await res.json()) as { projectId: string };
    const b = await getJson(`/api/projects/${projectId}`, cookie);
    expect(b.rows.itemImages.some((r: Row) => r.imageId === up2)).toBe(true);
  });

  it('rejects a broken file clearly and creates nothing', async () => {
    const cookie = await setupAndLogin();
    for (const bad of [null, {}, { format: 'other' }, { format: 'lawhat-almashahed/1', project: {}, rows: { scenes: 'x' }, images: [] }]) {
      const res = await call('/api/import', { method: 'POST', cookie, json: { project: bad } });
      expect(res.status).toBe(400);
    }
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM projects').first('n')).toBe(0);
  });

  it('refuses an image map pointing at images that were never uploaded', async () => {
    const cookie = await setupAndLogin();
    const portable = seedProjects(seed)[0];
    const res = await call('/api/import', { method: 'POST', cookie, json: { project: portable, imageMap: { 'img-1': 'img-forged' } } });
    expect(res.status).toBe(400);
  });
});

