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

describe('planItems (UPDATE-3 §6, §8)', () => {
  const camera = (id: string, sceneId: string, extra: Record<string, unknown> = {}) => ({
    op: 'create', entity: 'planItems', id, fields: { projectId: 'pr-pl', sceneId, kind: 'camera', refId: 'cam-zve10', x: 1.5, y: 2.25, rot: 45, label: 'A', props: { lens: 'lens-sigma1850', focalMm: 24, range: 4 }, ...extra },
  });
  async function base(cookie: string) {
    await ops(cookie, [
      { op: 'create', entity: 'projects', id: 'pr-pl', fields: { name: 'مخطط' } },
      { op: 'create', entity: 'scenes', id: 'sc-pl', fields: { projectId: 'pr-pl', position: 1, name: 'الاستوديو' } },
      { op: 'create', entity: 'characters', id: 'ch-pl', fields: { projectId: 'pr-pl', name: 'سارة' } },
      camera('pl-a', 'sc-pl'),
      { op: 'create', entity: 'planItems', id: 'pl-p', fields: { projectId: 'pr-pl', sceneId: 'sc-pl', kind: 'person', refId: 'ch-pl', x: 3, y: 1, label: 'سارة', color: '#94603f' } },
      { op: 'create', entity: 'planItems', id: 'pl-t', fields: { projectId: 'pr-pl', sceneId: 'sc-pl', kind: 'furniture', x: 2, y: 2, w: 1.6, h: 0.8, label: 'طاولة', props: { type: 'table' } } },
    ]);
  }

  it('create, update, delete and sync item by item; bad kinds are refused', async () => {
    const cookie = await setupAndLogin();
    await base(cookie);
    const s = await getJson('/api/projects/pr-pl', cookie);
    expect(s.rows.planItems).toHaveLength(3);
    expect(s.rows.planItems.find((r: { id: string }) => r.id === 'pl-a')).toMatchObject({ kind: 'camera', x: 1.5, y: 2.25, rot: 45, props: { focalMm: 24, range: 4 } });
    const t0 = Date.now() - 1;
    await ops(cookie, [{ op: 'update', entity: 'planItems', id: 'pl-a', fields: { rot: 90, props: { lens: 'lens-sigma1850', focalMm: 50, range: 4 } } }]);
    const ch = await getJson(`/api/projects/pr-pl/changes?since=${t0}`, cookie);
    expect(ch.rows.planItems).toHaveLength(1);
    expect(ch.rows.planItems[0]).toMatchObject({ id: 'pl-a', rot: 90, props: { focalMm: 50 } });
    await ops(cookie, [{ op: 'delete', entity: 'planItems', id: 'pl-t' }]);
    const after = await getJson('/api/projects/pr-pl', cookie);
    expect(after.rows.planItems.map((r: { id: string }) => r.id).sort()).toEqual(['pl-a', 'pl-p']);
    // a plan item alone never goes to the trash
    expect(await getJson('/api/trash', cookie)).toHaveLength(0);
    // undo of a delete = undelete
    await ops(cookie, [{ op: 'undelete', entity: 'planItems', id: 'pl-t' }]);
    expect((await getJson('/api/projects/pr-pl', cookie)).rows.planItems).toHaveLength(3);
    const bad = await call('/api/ops', { method: 'POST', cookie, json: { ops: [{ op: 'create', entity: 'planItems', id: 'pl-x', fields: { projectId: 'pr-pl', sceneId: 'sc-pl', kind: 'tree' } }] } });
    expect(bad.status).toBe(400);
  });

  it('follows its scene to the trash and back', async () => {
    const cookie = await setupAndLogin();
    await base(cookie);
    const res = (await ops(cookie, [{ op: 'delete', entity: 'scenes', id: 'sc-pl' }])) as { trashIds: string[] };
    expect((await getJson('/api/projects/pr-pl', cookie)).rows.planItems ?? []).toHaveLength(0);
    await call(`/api/trash/${res.trashIds[0]}/restore`, { method: 'POST', cookie });
    expect((await getJson('/api/projects/pr-pl', cookie)).rows.planItems).toHaveLength(3);
  });

  it('travels with export → import and «تكرار المشروع»; the person keeps pointing at the copied character', async () => {
    const cookie = await setupAndLogin();
    await base(cookie);
    const exp = await getJson('/api/projects/pr-pl/export', cookie);
    expect(exp.rows.planItems).toHaveLength(3);
    const imp = await call('/api/import', { method: 'POST', cookie, json: { project: exp, imageMap: {} } });
    const { projectId } = (await imp.json()) as { projectId: string };
    const b = await getJson(`/api/projects/${projectId}`, cookie);
    const scene = b.rows.scenes[0].id, char = b.rows.characters[0].id;
    expect(b.rows.planItems).toHaveLength(3);
    for (const r of b.rows.planItems) expect(r.sceneId).toBe(scene);
    expect(b.rows.planItems.find((r: { kind: string }) => r.kind === 'person').refId).toBe(char);
    expect(b.rows.planItems.find((r: { kind: string }) => r.kind === 'camera')).toMatchObject({ refId: 'cam-zve10', props: { focalMm: 24 } });
    const dup = await call('/api/projects/pr-pl/duplicate', { method: 'POST', cookie, json: {} });
    const d = await getJson(`/api/projects/${((await dup.json()) as { projectId: string }).projectId}`, cookie);
    expect(d.rows.planItems).toHaveLength(3);
    expect(d.rows.planItems.find((r: { kind: string }) => r.kind === 'person').refId).toBe(d.rows.characters[0].id);
    for (const r of d.rows.planItems) expect(r.sceneId).toBe(d.rows.scenes[0].id);
    // an older file without a plan imports as before
    const old = { ...exp, rows: { ...exp.rows } };
    delete old.rows.planItems;
    expect((await call('/api/import', { method: 'POST', cookie, json: { project: old, imageMap: {} } })).status).toBe(200);
  });
});

/** Saved templates (UPDATE-3 §7, §9). */
describe('templates', () => {
  const content = async (cookie: string, id: string) => {
    const s = await getJson(`/api/projects/${id}`, cookie);
    const live = (l: { deletedAt: number | null }[]) => l.filter((r) => !r.deletedAt);
    return {
      project: s.project,
      scenes: live(s.rows.scenes).map((r: Record<string, unknown>) => [r.name, r.position, r.mood]).sort(),
      shots: live(s.rows.shots).map((r: Record<string, unknown>) => [r.description, r.status]).sort(),
      characters: live(s.rows.characters).map((r: Record<string, unknown>) => r.name).sort(),
      locations: live(s.rows.locations).map((r: Record<string, unknown>) => r.name).sort(),
      moodboards: live(s.rows.moodboards).length,
      notes: live(s.rows.notes).length,
      cards: live(s.rows.boardCards).length,
      plan: live(s.rows.planItems).map((r: Record<string, unknown>) => [r.kind, r.x, r.y]).sort(),
      images: live(s.rows.itemImages).map((r: Record<string, unknown>) => r.imageId).sort(),
      links: live(s.rows.sceneCharacters).length,
    };
  };
  const seed = async (cookie: string) => {
    const img = await upload(cookie);
    await ops(cookie, [
      { op: 'create', entity: 'projects', id: 'pr-a', fields: { name: 'إعلان عقار', client: 'شركة', shootDate: '2026-11-02', stage: 'shoot' } },
      { op: 'create', entity: 'locations', id: 'loc-1', fields: { projectId: 'pr-a', name: 'الفيلا' } },
      { op: 'create', entity: 'characters', id: 'ch-1', fields: { projectId: 'pr-a', name: 'المقدّم' } },
      { op: 'create', entity: 'characters', id: 'ch-2', fields: { projectId: 'pr-a', name: 'الضيف' } },
      { op: 'create', entity: 'moodboards', id: 'mb-1', fields: { projectId: 'pr-a', title: 'دافئ' } },
      { op: 'create', entity: 'notes', id: 'note-1', fields: { projectId: 'pr-a', text: 'ملاحظة' } },
      { op: 'create', entity: 'scenes', id: 'sc-1', fields: { projectId: 'pr-a', position: 1, name: 'الوصول', locationId: 'loc-1', mood: 'gold' } },
      { op: 'create', entity: 'scenes', id: 'sc-2', fields: { projectId: 'pr-a', position: 2, name: 'المقابلة', mood: 'night' } },
      { op: 'create', entity: 'shots', id: 'sh-1', fields: { projectId: 'pr-a', sceneId: 'sc-1', position: 1, description: 'واسعة', status: 'shot' } },
      { op: 'create', entity: 'shots', id: 'sh-2', fields: { projectId: 'pr-a', sceneId: 'sc-2', position: 1, description: 'قريبة', status: 'approved' } },
      { op: 'create', entity: 'itemImages', id: 'ii-1', fields: { projectId: 'pr-a', ownerKind: 'shot', ownerId: 'sh-2', imageId: img, position: 1 } },
      { op: 'create', entity: 'sceneCharacters', id: 'sc-2:ch-2', fields: { projectId: 'pr-a', sceneId: 'sc-2', characterId: 'ch-2' } },
      { op: 'create', entity: 'boardCards', id: 'bc-1', fields: { projectId: 'pr-a', kind: 'note', refId: 'note-1', x: 0, y: 0 } },
      { op: 'create', entity: 'planItems', id: 'pl-1', fields: { projectId: 'pr-a', sceneId: 'sc-2', kind: 'camera', refId: 'cam-zve10', x: 1, y: 2 } },
      { op: 'create', entity: 'planItems', id: 'pl-2', fields: { projectId: 'pr-a', sceneId: 'sc-2', kind: 'person', refId: 'ch-2', x: 2, y: 1 } },
    ]);
    return img;
  };

  it('saving a project keeps the original as it was; the template has everything but the client, the day and the statuses', async () => {
    const cookie = await setupAndLogin();
    await seed(cookie);
    const before = await content(cookie, 'pr-a');
    const res = await call('/api/projects/pr-a/template', { method: 'POST', cookie, json: { name: 'قالب: إعلان عقار' } });
    expect(res.status).toBe(200);
    const { projectId: tpl } = (await res.json()) as { projectId: string };
    expect(await content(cookie, 'pr-a')).toEqual(before);
    const t = await content(cookie, tpl);
    expect(t.project).toMatchObject({ name: 'قالب: إعلان عقار', templateKind: 'project', client: '', shootDate: null, stage: 'prep' });
    expect(t.shots).toEqual([['قريبة', 'planned'], ['واسعة', 'planned']]);
    for (const k of ['scenes', 'characters', 'locations', 'moodboards', 'notes', 'cards', 'plan', 'images', 'links'] as const) expect(t[k]).toEqual(before[k]);

    // «مشروع جديد من القالب»: a normal project with the same content
    const res2 = await call(`/api/projects/${tpl}/from-template`, { method: 'POST', cookie, json: { name: 'عقار — الملقا' } });
    const { projectId: np } = (await res2.json()) as { projectId: string };
    const n = await content(cookie, np);
    expect(n.project).toMatchObject({ name: 'عقار — الملقا', templateKind: null });
    for (const k of ['scenes', 'shots', 'characters', 'locations', 'moodboards', 'notes', 'cards', 'plan', 'images', 'links'] as const) expect(n[k]).toEqual(t[k]);

    // the list marks templates (Home keeps them out of «مشاريعي» and the counts); the search badges them
    const list = (await getJson('/api/projects', cookie)) as { id: string; templateKind: string | null; plans: number }[];
    expect(list.find((p) => p.id === tpl)).toMatchObject({ templateKind: 'project', plans: 1 });
    expect(list.find((p) => p.id === np)?.templateKind).toBeNull();
    expect(list.find((p) => p.id === 'pr-a')?.templateKind).toBeNull();
    const hits = (await getJson(`/api/search?q=${encodeURIComponent('قالب')}`, cookie)) as { id: string; template?: boolean }[];
    expect(hits.find((h) => h.id === tpl)?.template).toBe(true);
    // a client can't turn a project into a template (or back) by an edit
    const bad = await call('/api/ops', { method: 'POST', cookie, json: { ops: [{ op: 'update', entity: 'projects', id: 'pr-a', fields: { templateKind: 'project' } }] } });
    expect(bad.status).toBe(400);
  });

  it('a scene template holds that scene, its shots, plan, photos, characters and location only', async () => {
    const cookie = await setupAndLogin();
    const img = await seed(cookie);
    const res = await call('/api/projects/pr-a/template', { method: 'POST', cookie, json: { name: 'مقابلة بكاميرتين', sceneId: 'sc-2' } });
    const { projectId: tpl } = (await res.json()) as { projectId: string };
    const t = await content(cookie, tpl);
    expect(t.project).toMatchObject({ templateKind: 'scene', name: 'مقابلة بكاميرتين' });
    expect(t.scenes).toEqual([['المقابلة', 2, 'night']]);
    expect(t.shots).toEqual([['قريبة', 'planned']]);
    expect(t.characters).toEqual(['الضيف']);
    expect(t.locations).toEqual([]);
    expect(t).toMatchObject({ moodboards: 0, notes: 0, cards: 0, images: [img], links: 1 });
    expect(t.plan).toEqual([['camera', 1, 2], ['person', 2, 1]]);
    const s = await getJson(`/api/projects/${tpl}`, cookie);
    const ch = s.rows.characters[0].id;
    expect(s.rows.planItems.find((r: { kind: string }) => r.kind === 'person').refId).toBe(ch);
    // the first scene carries its location
    const r1 = await call('/api/projects/pr-a/template', { method: 'POST', cookie, json: { name: 'الوصول', sceneId: 'sc-1' } });
    const t1 = await content(cookie, ((await r1.json()) as { projectId: string }).projectId);
    expect(t1.locations).toEqual(['الفيلا']);
    // bad requests
    expect((await call('/api/projects/pr-a/template', { method: 'POST', cookie, json: { name: ' ' } })).status).toBe(400);
    expect((await call('/api/projects/pr-a/template', { method: 'POST', cookie, json: { name: 'x', sceneId: 'sc-nope' } })).status).toBe(400);
  });
});
