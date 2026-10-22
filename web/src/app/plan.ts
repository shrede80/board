import { asItem, camDefaults, FURNITURE, LIGHT_MODIFIERS, LIGHTS, nextLetter, PERSON_COLORS, planSvg, type Names, type PlanItem, type PlanProps } from '../../../shared/plan';
import type { Op, Row } from '../../../shared/schema';
import { pad2, uid } from '../lib/util';
import { commit } from './actions';
import { download } from '../lib/util';
import { engine, getState, project, setState, toast } from './state';

/**
 * مخطط التصوير — data side (UPDATE-3 §6): reading a scene's plan from the store, the palette
 * (cameras and lights from «معداتي»), creating, changing, copying from another scene, and the
 * PNG for the team. Every change is an ordinary op: synced item by item, undoable.
 */

// rows are replaced on every change, so one item object per row keeps unchanged items identical
// between renders (the plan's memoised drawings only redraw what moved — §6.10, 200 items)
const items = new WeakMap<Row, PlanItem>();
const itemOf = (r: Row) => {
  let it = items.get(r);
  if (!it) items.set(r, (it = asItem(r)));
  return it;
};
export const planOf = (sceneId: string): PlanItem[] =>
  [...engine.store.planItems.values()].filter((r) => !r.deletedAt && r.sceneId === sceneId).map(itemOf).sort((a, b) => a.z - b.z);

export const hasPlan = (sceneId: string) => [...engine.store.planItems.values()].some((r) => !r.deletedAt && r.sceneId === sceneId);

export function openPlan(sceneId: string) {
  setState({ plan: sceneId, popMenu: null, menu: false });
}
export function closePlan() {
  setState({ plan: null });
}

const live = (role: string) => [...engine.store.equipment.values()].filter((e) => !e.deletedAt && e.role === role && !e.virtual).sort((a, b) => (a.position as number) - (b.position as number));
/** Cameras of «معداتي». */
export const planCameras = () => live('camera');
/** Lights of «معداتي» (modifiers, stands and adapters are not placed). */
export const planLights = () => live('lighting').filter((e) => !LIGHT_MODIFIERS.has(e.id) && (LIGHTS[e.id] || !['lightstand', 'bowens', 'softbox', 'lantern'].includes(e.icon as string)));
export const eqShort = (id: string | null) => {
  const e = id ? engine.store.equipment.get(id) : null;
  return e ? ((e.short as string) || (e.name as string)) : '';
};
export const planNames: Names = {
  cam: (id) => eqShort(id),
  light: (id) => eqShort(id),
  lens: (_cam, lens) => (!lens ? '' : engine.store.equipment.get(lens) ? eqShort(lens) : lens),
};

export type NewItem = Omit<PlanItem, 'id' | 'sceneId' | 'x' | 'y' | 'z'>;

export function newCamera(refId: string | null, items: PlanItem[]): NewItem {
  const d = camDefaults(refId);
  return { kind: 'camera', refId, rot: 0, w: 0.8, h: 0.8, label: nextLetter(items), color: null, props: { lens: d.lens, focalMm: d.focalMm, vertical: verticalDefault(), range: 4 } };
}
export function newLight(refId: string | null): NewItem {
  return { kind: 'light', refId, rot: 0, w: 0.8, h: 0.8, label: eqShort(refId).replace(/^Neewer |^Light Stick /, ''), color: null, props: { modifier: refId === 'lt-hs60b' ? 'none' : undefined, cct: 5600, range: 2.5 } };
}
export function newPerson(name: string, color: string | null, refId: string | null = null): NewItem {
  return { kind: 'person', refId, rot: 0, w: 0.62, h: 0.62, label: name, color: color ?? PERSON_COLORS[5], props: {} };
}
export function newFurniture(type: string): NewItem {
  const f = FURNITURE.find((x) => x[0] === type) ?? FURNITURE[0];
  return { kind: 'furniture', refId: null, rot: 0, w: f[2], h: f[3], label: f[1], color: null, props: { type } };
}
export const newZone = (): NewItem => ({ kind: 'zone', refId: null, rot: 0, w: 4, h: 2, label: 'منطقة', color: null, props: {} });
export const newText = (): NewItem => ({ kind: 'text', refId: null, rot: 0, w: 2.4, h: 0.6, label: 'نص', color: null, props: {} });
export const newArrow = (dashed: boolean): NewItem => ({ kind: 'arrow', refId: null, rot: 0, w: 1, h: 1, label: dashed ? 'حركة الكاميرا' : 'حركة', color: dashed ? '#3b6fd8' : '#6e2c34', props: { points: [[0, 0], [1.5, -0.8], [2.5, -0.8]], dashed } });

/** Frame orientation by default follows the project's ratio (9:16 → vertical). */
function verticalDefault(): boolean {
  return project()?.aspect === '9:16';
}

const fieldsOf = (it: Omit<PlanItem, 'id'>) => ({
  sceneId: it.sceneId, kind: it.kind, refId: it.refId, x: it.x, y: it.y, rot: it.rot, w: it.w, h: it.h, z: it.z, label: it.label, color: it.color, props: it.props,
});

export function addItem(sceneId: string, it: NewItem, at: { x: number; y: number }): string | null {
  const p = project();
  if (!p) return null;
  const id = uid('pl');
  const z = Math.max(0, ...planOf(sceneId).map((i) => i.z)) + 1;
  const ok = commit([{ op: 'create', entity: 'planItems', id, fields: { projectId: p.id, ...fieldsOf({ ...it, sceneId, x: round(at.x), y: round(at.y), z }) } }], { history: 'إضافة للمخطط' });
  return ok ? id : null;
}

const round = (v: number) => Math.round(v * 100) / 100;

/** One undo step for any set of item changes. */
export function updateItems(changes: { id: string; fields: Partial<Omit<PlanItem, 'props'>> & { props?: PlanProps } }[], label = 'تعديل المخطط', key?: string) {
  const ops: Op[] = changes.filter((c) => Object.keys(c.fields).length).map((c) => ({ op: 'update', entity: 'planItems', id: c.id, fields: c.fields as Record<string, unknown> }));
  if (ops.length) commit(ops, { history: label, key });
}

export function deleteItems(ids: string[]) {
  if (!ids.length) return;
  commit(ids.map((id) => ({ op: 'delete', entity: 'planItems', id })), { history: 'حذف من المخطط' });
}

export function duplicateItems(sceneId: string, ids: string[]): string[] {
  const p = project();
  const all = planOf(sceneId);
  const src = all.filter((i) => ids.includes(i.id));
  if (!p || !src.length) return [];
  let z = Math.max(0, ...all.map((i) => i.z));
  const made: string[] = [];
  const seen = [...all];
  const ops: Op[] = src.map((it) => {
    const id = uid('pl');
    made.push(id);
    const label = it.kind === 'camera' ? nextLetter(seen) : it.label;
    const copy = { ...it, label, x: round(it.x + 0.5), y: round(it.y + 0.5), z: ++z };
    seen.push(copy);
    return { op: 'create', entity: 'planItems', id, fields: { projectId: p.id, ...fieldsOf(copy) } };
  });
  commit(ops, { history: 'تكرار' });
  return made;
}

/** Bring forward / send back (long press menu on the phone). */
export function restack(sceneId: string, id: string, front: boolean) {
  const all = planOf(sceneId);
  const zs = all.map((i) => i.z);
  updateItems([{ id, fields: { z: front ? Math.max(0, ...zs) + 1 : Math.min(0, ...zs) - 1 } }], front ? 'للأمام' : 'للخلف');
}

/** Scenes of the project that already have a plan (for «انسخ من مشهد»). */
export function scenesWithPlan(except: string) {
  const p = project();
  if (!p) return [];
  return p.scenes.map((s, i) => ({ s, i, n: planOf(s.id).length })).filter((x) => x.s.id !== except && x.n > 0);
}

/** «انسخ من مشهد» (§6.7): replace this plan with a copy, or add the copy on top. One undo step. */
export function copyPlanFrom(fromScene: string, toScene: string, mode: 'replace' | 'add') {
  const p = project();
  if (!p) return;
  const src = planOf(fromScene);
  const cur = planOf(toScene);
  const ops: Op[] = mode === 'replace' ? cur.map((i) => ({ op: 'delete', entity: 'planItems', id: i.id }) as Op) : [];
  let z = mode === 'add' ? Math.max(0, ...cur.map((i) => i.z)) : 0;
  for (const it of src) ops.push({ op: 'create', entity: 'planItems', id: uid('pl'), fields: { projectId: p.id, ...fieldsOf({ ...it, sceneId: toScene, z: ++z }) } });
  if (commit(ops, { history: 'نسخ المخطط' })) toast(mode === 'replace' ? 'تبدّل المخطط' : 'انضاف المخطط', { undo: true });
}

/** «صورة للفريق» (§6.8): the whole plan, the project and scene names, and the key, as a 2× PNG. */
export async function exportPlanPng(sceneId: string) {
  const p = project();
  const si = p ? p.scenes.findIndex((s) => s.id === sceneId) : -1;
  if (!p || si < 0) return;
  const sc = p.scenes[si];
  const { svg, width, height } = planSvg(planOf(sceneId), { title: p.name, subtitle: `مخطط المشهد ${pad2(si + 1)} · ${sc.name}`, names: planNames, width: 1200 });
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((ok, bad) => {
      img.onload = () => ok();
      img.onerror = () => bad(new Error('svg'));
      img.src = url;
    });
    const cv = document.createElement('canvas');
    cv.width = width * 2;
    cv.height = height * 2;
    const g = cv.getContext('2d')!;
    g.scale(2, 2);
    g.drawImage(img, 0, 0);
    const blob: Blob = await new Promise((r) => cv.toBlob((b) => r(b!), 'image/png'));
    download(`مخطط-المشهد-${pad2(si + 1)}.png`, blob, 'image/png');
    toast('صورة المخطط جاهزة');
  } catch {
    toast('ما قدرنا نجهّز الصورة', { tone: 'danger' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The plan of a scene as an SVG string, for the storyboard PDF. */
export function planSvgFor(sceneId: string): string | null {
  const items = planOf(sceneId);
  if (!items.length) return null;
  return planSvg(items, { names: planNames, width: 900 }).svg;
}

/** Characters of the scene that aren't on its plan yet (for «أشخاص»). */
export function sceneCharacters(sceneId: string): Row[] {
  const p = project();
  const sc = p?.scenes.find((s) => s.id === sceneId);
  if (!p || !sc) return [];
  return sc.characterIds.map((id) => p.library.characters.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c) as unknown as Row[];
}

export const isPlanOpen = () => !!getState().plan;
