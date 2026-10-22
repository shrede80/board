import { describe, expect, it } from 'vitest';
import { call, getJson, ops, setupAndLogin, upload } from './helpers';

/** Update 3 data, phase A1: the photo height of a scene card on the board (UPDATE-3 §3.2, §8). */
describe('scenes.boardImgH and boardCards.h for photo cards', () => {
  it('defaults to null (cards look as before), saves, and travels with export → import and duplicate', async () => {
    const cookie = await setupAndLogin();
    const img = await upload(cookie);
    await ops(cookie, [
      { op: 'create', entity: 'projects', id: 'pr-1', fields: { name: 'p' } },
      { op: 'create', entity: 'scenes', id: 'sc-0', fields: { projectId: 'pr-1', position: 1 } },
      { op: 'create', entity: 'scenes', id: 'sc-1', fields: { projectId: 'pr-1', position: 2, boardW: 400, boardImgH: 150 } },
      { op: 'create', entity: 'boardCards', id: 'bc-i', fields: { projectId: 'pr-1', kind: 'image', refId: img, x: 0, y: 0, w: 360, h: 146 } },
    ]);
    const s = await getJson('/api/projects/pr-1', cookie);
    const byId = (rows: { id: string }[], id: string) => rows.find((r) => r.id === id);
    expect(byId(s.rows.scenes, 'sc-0')).toMatchObject({ boardImgH: null });
    expect(byId(s.rows.scenes, 'sc-1')).toMatchObject({ boardW: 400, boardImgH: 150 });

    const exp = await getJson('/api/projects/pr-1/export', cookie);
    const res = await call('/api/import', { method: 'POST', cookie, json: { project: exp, imageMap: { [img]: img } } });
    const { projectId } = (await res.json()) as { projectId: string };
    const b = await getJson(`/api/projects/${projectId}`, cookie);
    expect(b.rows.scenes.map((x: { boardImgH: number | null }) => x.boardImgH).sort()).toEqual([150, null]);
    expect(b.rows.boardCards[0]).toMatchObject({ kind: 'image', w: 360, h: 146 });

    const dup = await call('/api/projects/pr-1/duplicate', { method: 'POST', cookie, json: {} });
    const d = await getJson(`/api/projects/${((await dup.json()) as { projectId: string }).projectId}`, cookie);
    expect(d.rows.scenes.map((x: { boardImgH: number | null }) => x.boardImgH).sort()).toEqual([150, null]);
  });

  it('an older project file without the column imports with null', async () => {
    const cookie = await setupAndLogin();
    const old = {
      format: 'lawhat-almashahed/1', exportedAt: '2026-10-01T00:00:00Z',
      project: { id: 'pr-o', name: 'قديم', template: 'blank', aspect: '16:9' },
      rows: { scenes: [{ id: 'sc-o', projectId: 'pr-o', position: 1, name: 'م', boardW: 300 }] },
      images: [],
    };
    const res = await call('/api/import', { method: 'POST', cookie, json: { project: old, imageMap: {} } });
    expect(res.status).toBe(200);
    const { projectId } = (await res.json()) as { projectId: string };
    const b = await getJson(`/api/projects/${projectId}`, cookie);
    expect(b.rows.scenes[0]).toMatchObject({ boardW: 300, boardImgH: null });
  });
});
