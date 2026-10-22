import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { shownFields } from '../../shared/fields';
import { backup } from '../src/maintenance';
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

describe('prefs (UPDATE-3 §8): the fields, motion and keys settings', () => {
  it('nothing saved = «بسيط»; a saved value syncs through /api/changes and home; unknown keys are refused', async () => {
    const cookie = await setupAndLogin();
    const home0 = await getJson('/api/home', cookie);
    expect(home0.rows.prefs ?? []).toEqual([]);
    expect(shownFields(null).shotEditor.has('camera')).toBe(false); // the default is «بسيط»
    const t0 = Date.now() - 1;
    await ops(cookie, [
      { op: 'create', entity: 'prefs', id: 'fields', fields: { value: { preset: 'full' } } },
      { op: 'create', entity: 'prefs', id: 'keys', fields: { value: { duplicate: 'Alt+KeyK' } } },
      { op: 'create', entity: 'prefs', id: 'motion', fields: { value: { less: true } } },
    ]);
    const ch = await getJson(`/api/changes?since=${t0}`, cookie);
    const byId = Object.fromEntries((ch.rows.prefs as { id: string; value: unknown }[]).map((r) => [r.id, r.value]));
    expect(byId).toEqual({ fields: { preset: 'full' }, keys: { duplicate: 'Alt+KeyK' }, motion: { less: true } });
    // a second write updates the same row
    await ops(cookie, [{ op: 'update', entity: 'prefs', id: 'keys', fields: { value: {} } }]);
    const home = await getJson('/api/home', cookie);
    expect(home.rows.prefs.find((r: { id: string }) => r.id === 'keys').value).toEqual({});
    // also inside a project snapshot
    await ops(cookie, [{ op: 'create', entity: 'projects', id: 'pr-p', fields: { name: 'p' } }]);
    const snap = await getJson('/api/projects/pr-p', cookie);
    expect(snap.rows.prefs.map((r: { id: string }) => r.id).sort()).toEqual(['fields', 'keys', 'motion']);
    const bad = await call('/api/ops', { method: 'POST', cookie, json: { ops: [{ op: 'create', entity: 'prefs', id: 'theme', fields: { value: 1 } }] } });
    expect(bad.status).toBe(400);
  });

  it('the nightly backup carries the prefs', async () => {
    const cookie = await setupAndLogin();
    await ops(cookie, [{ op: 'create', entity: 'prefs', id: 'fields', fields: { value: { preset: 'custom', shown: { shotCard: ['camera'] } } } }]);
    const key = await backup(env.DB, env.BUCKET, Date.now());
    const obj = await env.BUCKET.get(key);
    const file = JSON.parse(await obj!.text()) as { tables: Record<string, { id: string }[]> };
    expect(file.tables.prefs.map((r) => r.id)).toEqual(['fields']);
  });
});
