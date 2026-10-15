import { arrangeLayout, DEFAULT_SIZE, insideFrame, resize, snapGrid, type ArrangeItem, type Box, type Handle, type ItemKind } from '../../../shared/board';
import type { Op } from '../../../shared/schema';
import type { PCard, PProject, PScene } from '../data/project';
import { GRID, SNAP_PX } from '../lib/constants';
import { commit, isCard, openEditor, registerCenterWorld, registerFitAll } from './actions';
import { capture, playFlip } from './flip';
import { engine, getState, project, setState, toast, type Guide } from './state';

export { snapGrid };
export type { Box };

/**
 * Free board («لوحة الأفكار»): pan/zoom, selection, moving and resizing items, frames that
 * carry their content, alignment guides (SPEC 7ب, UPDATE-1 أ3–أ7). The geometry rules live in
 * shared/board.ts; this file wires them to pointer events and the data engine.
 */

let boardEl: HTMLDivElement | null = null;
export function setBoardEl(el: HTMLDivElement | null) {
  if (el === boardEl) return;
  boardEl?.removeEventListener('wheel', onWheel);
  boardEl?.removeEventListener('touchstart', onTouchStart);
  boardEl = el;
  el?.addEventListener('wheel', onWheel, { passive: false });
  el?.addEventListener('touchstart', onTouchStart, { passive: false });
}
export const getBoardEl = () => boardEl;

// ---------- items ----------

export interface Item {
  id: string;
  kind: ItemKind;
  z: number;
  locked: boolean;
  scene?: PScene;
  card?: PCard;
}

/** Scenes and cards as one list (cards first, as before Update 1, so equal z keeps the old look). */
export function boardItems(p: PProject): Item[] {
  const live = p.cards.filter((c) => cardAlive(p, c));
  return [
    ...live.map((c) => ({ id: c.id, kind: c.kind as ItemKind, z: Number(c.z) || 0, locked: !!c.locked, card: c })),
    ...p.scenes.map((s) => ({ id: s.id, kind: 'scene' as const, z: Number(s.boardZ) || 0, locked: !!s.boardLocked, scene: s })),
  ];
}

/** Does the card's item still exist? (cards of trashed library items are hidden) */
export function cardAlive(p: PProject, c: PCard) {
  const L = p.library;
  if (c.kind === 'note') return p.notes.some((x) => x.id === c.refId);
  if (c.kind === 'character') return L.characters.some((x) => x.id === c.refId);
  if (c.kind === 'location') return L.locations.some((x) => x.id === c.refId);
  if (c.kind === 'moodboard') return L.moodboards.some((x) => x.id === c.refId);
  return true;
}

export function itemOf(id: string): Item | null {
  const p = project();
  return p ? boardItems(p).find((i) => i.id === id) ?? null : null;
}

export function toWorld(cx: number, cy: number) {
  if (!boardEl) return { x: 0, y: 0 };
  const r = boardEl.getBoundingClientRect();
  const v = getState().view;
  return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z };
}
export function toScreen(wx: number, wy: number) {
  if (!boardEl) return { x: 0, y: 0 };
  const r = boardEl.getBoundingClientRect();
  const v = getState().view;
  return { x: r.left + v.x + wx * v.z, y: r.top + v.y + wy * v.z };
}

export function centerWorld() {
  if (!boardEl) return { x: 400, y: 200 };
  const r = boardEl.getBoundingClientRect();
  const w = toWorld(r.left + r.width / 2, r.top + r.height / 2);
  return { x: Math.round(w.x - 120), y: Math.round(w.y - 100) };
}
registerCenterWorld(centerWorld);

/** Current position of a board item, honouring an in-progress drag. */
export function itemPos(id: string): { x: number; y: number } | null {
  const dp = getState().dragPos?.[id];
  if (dp) return dp;
  const p = project();
  if (!p) return null;
  if (isCard(id)) {
    const c = p.cards.find((x) => x.id === id);
    return c ? { x: c.x, y: c.y } : null;
  }
  const sc = p.scenes.find((s) => s.id === id);
  return sc ? { x: sc.boardX, y: sc.boardY } : null;
}

/** Item boxes in world px; sizes measured from the DOM (falls back to the default sizes). */
export function itemBoxes(): (Box & { kind: ItemKind; locked: boolean })[] {
  const p = project();
  if (!p) return [];
  return boardItems(p).map((it) => {
    const pos = itemPos(it.id)!;
    const el = boardEl?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(it.id)}"]`);
    const [w, h] = el && el.offsetWidth ? [el.offsetWidth, el.offsetHeight] : DEFAULT_SIZE[it.kind];
    return { id: it.id, x: pos.x, y: pos.y, w, h, kind: it.kind, locked: it.locked };
  });
}
export function boxOf(id: string) {
  return itemBoxes().find((b) => b.id === id) ?? null;
}

function itemsIn(r: { x: number; y: number; w: number; h: number }) {
  return itemBoxes()
    .filter((b) => b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y)
    // a frame is picked only when the marquee holds all of it (dragging inside a frame selects its content)
    .filter((b) => b.kind !== 'frame' || (b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h))
    .map((b) => b.id);
}

export function fitAll() {
  const p = project();
  if (!boardEl || !p) return;
  const r = boardEl.getBoundingClientRect();
  const bx = itemBoxes();
  if (!bx.length) return setState({ view: { x: r.width / 2 - 200, y: 80, z: 1 } });
  const minX = Math.min(...bx.map((b) => b.x)), minY = Math.min(...bx.map((b) => b.y));
  const maxX = Math.max(...bx.map((b) => b.x + b.w)), maxY = Math.max(...bx.map((b) => b.y + b.h));
  const z = Math.max(0.15, Math.min(1, (r.width - 80) / (maxX - minX), (r.height - 150) / (maxY - minY)));
  setState({ view: { z, x: (r.width - (maxX - minX) * z) / 2 - minX * z, y: Math.max(24, (r.height - 110 - (maxY - minY) * z) / 2) - minY * z } });
}
registerFitAll(() => setTimeout(fitAll, 30));

export function zoomBy(f: number) {
  if (!boardEl) return;
  const r = boardEl.getBoundingClientRect(), v = getState().view;
  const nz = Math.min(2, Math.max(0.15, v.z * f)), cx = r.width / 2, cy = r.height / 2;
  const wx = (cx - v.x) / v.z, wy = (cy - v.y) / v.z;
  setState({ view: { z: nz, x: cx - wx * nz, y: cy - wy * nz } });
}

function onWheel(e: WheelEvent) {
  const st = getState();
  if (st.mode !== 'board' || st.screen !== 'app' || !boardEl) return;
  e.preventDefault();
  const v = st.view;
  if (e.ctrlKey || e.metaKey) {
    const r = boardEl.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
    const nz = Math.min(2, Math.max(0.15, v.z * Math.exp(-e.deltaY * 0.0025)));
    const wx = (cx - v.x) / v.z, wy = (cy - v.y) / v.z;
    setState({ view: { x: cx - wx * nz, y: cy - wy * nz, z: nz } });
  } else setState({ view: { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY } });
}

// ---------- touch: pinch to zoom, two fingers to pan (iPad, UPDATE-1 ج9) ----------

let pinch: { d: number; cx: number; cy: number; view: { x: number; y: number; z: number } } | null = null;
function touchInfo(t: TouchList) {
  const a = t[0], b = t[1];
  return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2 };
}
function onTouchStart(e: TouchEvent) {
  if (e.touches.length !== 2 || getState().mode !== 'board') return;
  e.preventDefault();
  cancelPointer();
  pinch = { ...touchInfo(e.touches), view: getState().view };
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd);
}
function onTouchMove(e: TouchEvent) {
  if (!pinch || e.touches.length !== 2 || !boardEl) return;
  e.preventDefault();
  const t = touchInfo(e.touches);
  const r = boardEl.getBoundingClientRect();
  const v = pinch.view;
  const nz = Math.min(2, Math.max(0.15, v.z * (t.d / pinch.d)));
  const wx = (pinch.cx - r.left - v.x) / v.z, wy = (pinch.cy - r.top - v.y) / v.z;
  setState({ view: { z: nz, x: t.cx - r.left - wx * nz, y: t.cy - r.top - wy * nz } });
}
function onTouchEnd(e: TouchEvent) {
  if (e.touches.length >= 2) return;
  pinch = null;
  window.removeEventListener('touchmove', onTouchMove);
  window.removeEventListener('touchend', onTouchEnd);
}

// ---------- pointer ----------

type Ptr =
  | { type: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { type: 'marq'; wx: number; wy: number; base: string[]; sx: number; sy: number }
  | { type: 'move'; sx: number; sy: number; orig: Record<string, { x: number; y: number }>; moved: boolean; id: string; shift: boolean; others: Box[]; sizes: Record<string, { w: number; h: number }> }
  | { type: 'click'; sx: number; sy: number; id: string; shift: boolean; moved: boolean }
  | { type: 'resize'; sx: number; sy: number; id: string; kind: ItemKind; handle: Handle; start: Box; aspect?: number; font?: number; others: Box[]; moved: boolean };
let ptr: Ptr | null = null;

/** Long press on touch screens opens the menu (UPDATE-1 أ3). */
let press: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null;
const LONG_PRESS_MS = 550;
let onLongPress: (x: number, y: number, id: string | null) => void = () => {};
export function registerLongPress(f: typeof onLongPress) {
  onLongPress = f;
}
function startPress(e: React.PointerEvent, id: string | null) {
  if (e.pointerType !== 'touch') return;
  const x = e.clientX, y = e.clientY;
  press = {
    x, y,
    timer: setTimeout(() => {
      press = null;
      cancelPointer();
      onLongPress(x, y, id);
    }, LONG_PRESS_MS),
  };
}
function endPress() {
  if (press) clearTimeout(press.timer);
  press = null;
}

function listen() {
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once: true });
  window.addEventListener('pointercancel', onUp, { once: true });
}
function cancelPointer() {
  window.removeEventListener('pointermove', onMove);
  ptr = null;
  setState({ dragPos: null, dragSize: null, guides: [], marquee: null });
}

export function onBoardDown(e: React.PointerEvent) {
  const st = getState();
  if (st.mode !== 'board' || (e.target as HTMLElement).closest('[data-item],[data-handle]')) return;
  if (st.popMenu) setState({ popMenu: null });
  if (st.space || e.button === 1) {
    e.preventDefault();
    ptr = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: st.view.x, vy: st.view.y };
  } else if (e.button === 0) {
    const w = toWorld(e.clientX, e.clientY);
    const base = e.shiftKey ? st.selection : [];
    ptr = { type: 'marq', wx: w.x, wy: w.y, base, sx: e.clientX, sy: e.clientY };
    setState({ marquee: { x: w.x, y: w.y, w: 0, h: 0 }, selection: base, renaming: null });
    startPress(e, null);
  } else return;
  listen();
}

export function onItemDown(e: React.PointerEvent, id: string) {
  const st = getState();
  if (st.popMenu) setState({ popMenu: null });
  if (e.button === 1 || st.space) {
    ptr = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: st.view.x, vy: st.view.y };
    e.preventDefault();
    e.stopPropagation();
    listen();
    return;
  }
  if (e.button !== 0) return;
  e.stopPropagation();
  if (st.renaming && st.renaming.id === id) return; // typing inside it
  let sel = st.selection;
  if (e.shiftKey) sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
  else if (!sel.includes(id)) sel = [id];
  setState({ selection: sel, renaming: null });
  startPress(e, id);
  const boxes = itemBoxes();
  const byId = new Map(boxes.map((b) => [b.id, b]));
  // locked items stay put; a moving frame carries what sits inside it at this moment
  const moving = new Set(sel.filter((k) => !byId.get(k)?.locked));
  for (const k of [...moving]) {
    const b = byId.get(k);
    if (b?.kind === 'frame') for (const m of insideFrame(b, boxes)) if (!byId.get(m)?.locked) moving.add(m);
  }
  if (!moving.size) {
    ptr = { type: 'click', sx: e.clientX, sy: e.clientY, id, shift: e.shiftKey, moved: false };
    listen();
    return;
  }
  const orig: Record<string, { x: number; y: number }> = {};
  for (const k of moving) {
    const b = byId.get(k);
    if (b) orig[k] = { x: b.x, y: b.y };
  }
  const sizes: Record<string, { w: number; h: number }> = {};
  for (const b of boxes) sizes[b.id] = { w: b.w, h: b.h };
  ptr = { type: 'move', sx: e.clientX, sy: e.clientY, orig, moved: false, id, shift: e.shiftKey, others: visibleBoxes(boxes.filter((b) => !(b.id in orig) && b.kind !== 'frame')), sizes };
  listen();
}

/** Resize handle pressed (UPDATE-1 أ4). */
export function onHandleDown(e: React.PointerEvent, id: string, handle: Handle) {
  if (e.button !== 0) return;
  e.stopPropagation();
  e.preventDefault();
  const it = itemOf(id);
  const b = boxOf(id);
  if (!it || !b || it.locked) return;
  let aspect: number | undefined;
  if (it.kind === 'image') {
    const m = engine.images.get(it.card!.refId);
    aspect = m && m.width && m.height ? m.width / m.height : b.w / Math.max(1, imageHeight(b));
  }
  const font = it.kind === 'heading' ? Number(it.card!.h) || DEFAULT_SIZE.heading[1] : undefined;
  ptr = { type: 'resize', sx: e.clientX, sy: e.clientY, id, kind: it.kind, handle, start: { id, x: b.x, y: b.y, w: b.w, h: b.h }, aspect, font, others: visibleBoxes(itemBoxes().filter((x) => x.id !== id && x.kind !== 'frame')), moved: false };
  listen();
}
/** Height of the photo inside an image card (without its caption). */
function imageHeight(b: Box) {
  const el = boardEl?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(b.id)}"] [data-photo]`);
  return el?.offsetHeight || b.h;
}

/** Boxes intersecting the visible part of the board (guides only use what's on screen). */
function visibleBoxes(boxes: Box[]): Box[] {
  if (!boardEl) return boxes;
  const r = boardEl.getBoundingClientRect();
  const a = toWorld(r.left, r.top), b = toWorld(r.right, r.bottom);
  return boxes.filter((x) => x.x < b.x && x.x + x.w > a.x && x.y < b.y && x.y + x.h > a.y);
}

function onMove(e: PointerEvent) {
  const P = ptr;
  if (!P) return;
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) endPress();
  const st = getState();
  const z = st.view.z;
  const snapOn = (st.settings?.boardSnap ?? true) && !e.altKey;
  if (P.type === 'pan') setState({ view: { ...st.view, x: P.vx + e.clientX - P.sx, y: P.vy + e.clientY - P.sy } });
  else if (P.type === 'marq') {
    const w = toWorld(e.clientX, e.clientY);
    const r = { x: Math.min(P.wx, w.x), y: Math.min(P.wy, w.y), w: Math.abs(w.x - P.wx), h: Math.abs(w.y - P.wy) };
    setState({ marquee: r, selection: [...new Set([...P.base, ...itemsIn(r)])] });
  } else if (P.type === 'click') {
    if (Math.hypot(e.clientX - P.sx, e.clientY - P.sy) >= 4) P.moved = true;
  } else if (P.type === 'move') {
    if (!P.moved && Math.hypot(e.clientX - P.sx, e.clientY - P.sy) < 4) return;
    P.moved = true;
    let dx = (e.clientX - P.sx) / z, dy = (e.clientY - P.sy) / z;
    let guides: Guide[] = [];
    if (snapOn) {
      const res = align(P.orig, P.sizes, P.others, dx, dy, SNAP_PX / z);
      dx = res.dx;
      dy = res.dy;
      guides = res.guides;
    }
    const dragPos: Record<string, { x: number; y: number }> = {};
    for (const k of Object.keys(P.orig)) dragPos[k] = { x: Math.round(P.orig[k].x + dx), y: Math.round(P.orig[k].y + dy) };
    setState({ dragPos, guides });
  } else if (P.type === 'resize') {
    if (!P.moved && Math.hypot(e.clientX - P.sx, e.clientY - P.sy) < 2) return;
    P.moved = true;
    const r = resize({ kind: P.kind, start: P.start, handle: P.handle, dx: (e.clientX - P.sx) / z, dy: (e.clientY - P.sy) / z, aspect: P.aspect, font: P.font, snap: snapOn ? { others: P.others, tol: SNAP_PX / z } : null });
    const size = P.kind === 'heading' ? { w: r.box.w, h: r.font } : { w: r.box.w, h: r.box.h };
    setState({ dragSize: { [P.id]: size }, dragPos: { [P.id]: { x: r.box.x, y: r.box.y } }, guides: r.guides });
  }
}

function onUp() {
  window.removeEventListener('pointermove', onMove);
  endPress();
  const P = ptr;
  ptr = null;
  if (!P) return;
  if (P.type === 'marq') setState({ marquee: null });
  if (P.type === 'click') {
    if (!P.moved && !P.shift) openItem(P.id);
  }
  if (P.type === 'move') {
    const dp = getState().dragPos;
    if (P.moved && dp) {
      const ops: Op[] = [];
      const inverse: Op[] = [];
      for (const [id, pos] of Object.entries(dp)) {
        const o = P.orig[id];
        if (o.x === pos.x && o.y === pos.y) continue;
        ops.push(posOp(id, pos));
        inverse.push(posOp(id, o));
      }
      if (ops.length) commit(ops, { history: 'تحريك', inverse });
      setState({ dragPos: null, guides: [] });
    } else {
      setState({ dragPos: null, guides: [] });
      if (!P.shift) openItem(P.id);
    }
  }
  if (P.type === 'resize') {
    const st = getState();
    const size = st.dragSize?.[P.id], pos = st.dragPos?.[P.id];
    setState({ dragSize: null, dragPos: null, guides: [] });
    if (!P.moved || !size || !pos) return;
    const it = itemOf(P.id);
    if (!it) return;
    commit([sizeOp(it, pos, size)], { history: 'تغيير الحجم', inverse: [sizeOp(it, { x: P.start.x, y: P.start.y }, it.kind === 'heading' ? { w: P.start.w, h: P.font } : { w: P.start.w, h: P.start.h }, true)] });
  }
}

/** Update for a new size (and position, when the left/top edge moved). */
function sizeOp(it: Item, pos: { x: number; y: number }, size: { w: number; h?: number }, restore = false): Op {
  if (it.scene) {
    const w = restore ? it.scene.boardW ?? null : size.w;
    return { op: 'update', entity: 'scenes', id: it.id, fields: { boardW: w, boardX: pos.x, boardY: pos.y } };
  }
  const c = it.card!;
  const fields: Record<string, unknown> = { x: pos.x, y: pos.y, w: restore ? c.w ?? null : size.w };
  if (it.kind === 'note' || it.kind === 'frame' || it.kind === 'heading') fields.h = restore ? c.h ?? null : size.h ?? null;
  return { op: 'update', entity: 'boardCards', id: it.id, fields };
}

/** Double-click on a handle: back to the default size (UPDATE-1 أ4). */
export function resetSize(id: string) {
  const it = itemOf(id);
  if (!it || it.locked) return;
  if (it.scene) {
    if (it.scene.boardW == null) return;
    commit([{ op: 'update', entity: 'scenes', id, fields: { boardW: null } }], { history: 'الحجم الافتراضي' });
  } else {
    const c = it.card!;
    if (c.w == null && c.h == null) return;
    commit([{ op: 'update', entity: 'boardCards', id, fields: it.kind === 'note' || it.kind === 'frame' || it.kind === 'heading' ? { w: null, h: null } : { w: null } }], { history: 'الحجم الافتراضي' });
  }
}

export function posOp(id: string, pos: { x: number; y: number }): Op {
  return isCard(id) ? { op: 'update', entity: 'boardCards', id, fields: { x: pos.x, y: pos.y } } : { op: 'update', entity: 'scenes', id, fields: { boardX: pos.x, boardY: pos.y } };
}

export function openItem(id: string) {
  const it = itemOf(id);
  if (!it) return;
  if (it.scene) return openEditor('scene', id);
  const c = it.card!;
  if (c.kind === 'note' || c.kind === 'character' || c.kind === 'location' || c.kind === 'moodboard') openEditor(c.kind, c.refId);
  // headings, frames and images are edited in place (double-click / «فتح وتعديل»)
}

// ---------- alignment while moving ----------

/**
 * Snaps a moving group: first to edges/centres of other cards (guides), else to the grid.
 * Guides win over the grid, per axis. Returns the adjusted delta and the guide lines to draw
 * (each spans only the two aligned boxes).
 */
export function align(
  orig: Record<string, { x: number; y: number }>,
  sizes: Record<string, { w: number; h: number }>,
  others: Box[],
  dx: number,
  dy: number,
  tol: number,
): { dx: number; dy: number; guides: Guide[] } {
  const ids = Object.keys(orig);
  const g = {
    x1: Math.min(...ids.map((k) => orig[k].x)) + dx,
    y1: Math.min(...ids.map((k) => orig[k].y)) + dy,
    x2: Math.max(...ids.map((k) => orig[k].x + (sizes[k]?.w ?? 0))) + dx,
    y2: Math.max(...ids.map((k) => orig[k].y + (sizes[k]?.h ?? 0))) + dy,
  };
  const mx = [g.x1, (g.x1 + g.x2) / 2, g.x2];
  const my = [g.y1, (g.y1 + g.y2) / 2, g.y2];
  let bestX: { d: number; at: number; box: Box } | null = null;
  let bestY: { d: number; at: number; box: Box } | null = null;
  for (const b of others) {
    for (const t of [b.x, b.x + b.w / 2, b.x + b.w]) {
      for (const m of mx) {
        const d = t - m;
        if (Math.abs(d) <= tol && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, at: t, box: b };
      }
    }
    for (const t of [b.y, b.y + b.h / 2, b.y + b.h]) {
      for (const m of my) {
        const d = t - m;
        if (Math.abs(d) <= tol && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, at: t, box: b };
      }
    }
  }
  const guides: Guide[] = [];
  if (bestX) dx += bestX.d;
  else dx += snapGrid(g.x1) - g.x1;
  if (bestY) dy += bestY.d;
  else dy += snapGrid(g.y1) - g.y1;
  const fx1 = Math.min(...ids.map((k) => orig[k].x)) + dx, fy1 = Math.min(...ids.map((k) => orig[k].y)) + dy;
  const fx2 = Math.max(...ids.map((k) => orig[k].x + (sizes[k]?.w ?? 0))) + dx, fy2 = Math.max(...ids.map((k) => orig[k].y + (sizes[k]?.h ?? 0))) + dy;
  if (bestX) guides.push({ dir: 'v', at: bestX.at, from: Math.min(fy1, bestX.box.y), to: Math.max(fy2, bestX.box.y + bestX.box.h) });
  if (bestY) guides.push({ dir: 'h', at: bestY.at, from: Math.min(fx1, bestY.box.x), to: Math.max(fx2, bestY.box.x + bestY.box.w) });
  return { dx, dy, guides };
}

// ---------- auto-arrange (SPEC 7ب.4) ----------

export function autoArrange() {
  const p = project();
  if (!p || !boardEl) return;
  const boxes = itemBoxes();
  if (!boxes.length) return;
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const r = boardEl.getBoundingClientRect();
  const z = getState().view.z;
  const scenes = p.scenes.map((s) => byId.get(s.id)!).filter(Boolean);
  const cards: ArrangeItem[] = boxes.filter((b) => isCard(b.id));
  const target = arrangeLayout(scenes, cards, r.width / z);
  const ops: Op[] = [];
  const inverse: Op[] = [];
  for (const [id, pos] of Object.entries(target)) {
    const b = byId.get(id)!;
    if (b.locked || (b.x === pos.x && b.y === pos.y)) continue;
    ops.push(posOp(id, pos));
    inverse.push(posOp(id, { x: b.x, y: b.y }));
  }
  if (!ops.length) return toast('اللوحة مرتّبة مسبقاً');
  const rects = capture('board');
  const n = p.scenes.length;
  if (!commit(ops, { history: 'ترتيب تلقائي', inverse })) return;
  requestAnimationFrame(() => playFlip('board', rects, getState().view.z));
  toast(`رُتّبت ${n} ${n === 1 ? 'مشهد' : n === 2 ? 'مشهدان' : n <= 10 ? 'مشاهد' : 'مشهداً'}`, { undo: true });
}

export const GRID_PX = GRID;
