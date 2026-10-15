import type { Op } from '../../../shared/schema';
import { CARD, GRID, SNAP_PX } from '../lib/constants';
import { commit, isCard, openEditor, registerCenterWorld, registerFitAll } from './actions';
import { capture, playFlip } from './flip';
import { getState, project, setState, toast, type Guide } from './state';

/**
 * Free board («لوحة الأفكار»): pan/zoom, selection, moving cards, and alignment (SPEC 7ب):
 * smart guides against other visible cards (6 screen px snap, any zoom), else snap to the dot
 * grid; magnet toggle (settings.boardSnap) and Alt to disable for one drag; auto-arrange.
 */

let boardEl: HTMLDivElement | null = null;
export function setBoardEl(el: HTMLDivElement | null) {
  if (el === boardEl) return;
  boardEl?.removeEventListener('wheel', onWheel);
  boardEl = el;
  el?.addEventListener('wheel', onWheel, { passive: false });
}

export interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function toWorld(cx: number, cy: number) {
  if (!boardEl) return { x: 0, y: 0 };
  const r = boardEl.getBoundingClientRect();
  const v = getState().view;
  return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z };
}

export function centerWorld() {
  if (!boardEl) return { x: 400, y: 200 };
  const r = boardEl.getBoundingClientRect();
  const w = toWorld(r.left + r.width / 2, r.top + r.height / 2);
  return { x: Math.round(w.x - 120), y: Math.round(w.y - 100) };
}
registerCenterWorld(centerWorld);

/** Current position of a board item (scene or card), honouring an in-progress drag. */
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

/** Item boxes in world px; sizes measured from the DOM (falls back to the prototype sizes). */
export function itemBoxes(): Box[] {
  const p = project();
  if (!p) return [];
  const size = (id: string, kind: string): [number, number] => {
    const el = boardEl?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`);
    if (el && el.offsetWidth) return [el.offsetWidth, el.offsetHeight];
    return CARD[kind] ?? [220, 160];
  };
  const out: Box[] = [];
  for (const sc of p.scenes) {
    const pos = itemPos(sc.id)!;
    const [w, h] = size(sc.id, 'scene');
    out.push({ id: sc.id, x: pos.x, y: pos.y, w, h });
  }
  for (const c of p.cards) {
    const pos = itemPos(c.id)!;
    const [w, h] = size(c.id, c.kind);
    out.push({ id: c.id, x: pos.x, y: pos.y, w, h });
  }
  return out;
}

function itemsIn(r: { x: number; y: number; w: number; h: number }) {
  return itemBoxes().filter((b) => b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y).map((b) => b.id);
}

export function fitAll() {
  const p = project();
  if (!boardEl || !p) return;
  const r = boardEl.getBoundingClientRect();
  const bx = itemBoxes();
  if (!bx.length) return setState({ view: { x: r.width / 2 - 200, y: 80, z: 1 } });
  const minX = Math.min(...bx.map((b) => b.x)), minY = Math.min(...bx.map((b) => b.y));
  const maxX = Math.max(...bx.map((b) => b.x + b.w)), maxY = Math.max(...bx.map((b) => b.y + b.h));
  const z = Math.max(0.3, Math.min(1, (r.width - 80) / (maxX - minX), (r.height - 150) / (maxY - minY)));
  setState({ view: { z, x: (r.width - (maxX - minX) * z) / 2 - minX * z, y: Math.max(24, (r.height - 110 - (maxY - minY) * z) / 2) - minY * z } });
}
registerFitAll(() => setTimeout(fitAll, 30));

export function zoomBy(f: number) {
  if (!boardEl) return;
  const r = boardEl.getBoundingClientRect(), v = getState().view;
  const nz = Math.min(2, Math.max(0.25, v.z * f)), cx = r.width / 2, cy = r.height / 2;
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
    const nz = Math.min(2, Math.max(0.25, v.z * Math.exp(-e.deltaY * 0.0025)));
    const wx = (cx - v.x) / v.z, wy = (cy - v.y) / v.z;
    setState({ view: { x: cx - wx * nz, y: cy - wy * nz, z: nz } });
  } else setState({ view: { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY } });
}

// ---------- pointer ----------

type Ptr =
  | { type: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { type: 'marq'; wx: number; wy: number; base: string[] }
  | { type: 'move'; sx: number; sy: number; orig: Record<string, { x: number; y: number }>; moved: boolean; id: string; shift: boolean; others: Box[]; sizes: Record<string, { w: number; h: number }> };
let ptr: Ptr | null = null;

function listen() {
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once: true });
}

export function onBoardDown(e: React.PointerEvent) {
  const st = getState();
  if (st.mode !== 'board' || (e.target as HTMLElement).closest('[data-item]')) return;
  if (st.space || e.button === 1) {
    e.preventDefault();
    ptr = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: st.view.x, vy: st.view.y };
  } else if (e.button === 0) {
    const w = toWorld(e.clientX, e.clientY);
    const base = e.shiftKey ? st.selection : [];
    ptr = { type: 'marq', wx: w.x, wy: w.y, base };
    setState({ marquee: { x: w.x, y: w.y, w: 0, h: 0 }, selection: base });
  } else return;
  listen();
}

export function onItemDown(e: React.PointerEvent, id: string) {
  const st = getState();
  if (e.button === 1 || st.space) {
    ptr = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: st.view.x, vy: st.view.y };
    e.preventDefault();
    e.stopPropagation();
    listen();
    return;
  }
  if (e.button !== 0) return;
  e.stopPropagation();
  let sel = st.selection;
  if (e.shiftKey) sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
  else if (!sel.includes(id)) sel = [id];
  const orig: Record<string, { x: number; y: number }> = {};
  for (const k of sel) {
    const pos = itemPos(k);
    if (pos) orig[k] = pos;
  }
  const boxes = itemBoxes();
  const sizes: Record<string, { w: number; h: number }> = {};
  for (const b of boxes) sizes[b.id] = { w: b.w, h: b.h };
  ptr = { type: 'move', sx: e.clientX, sy: e.clientY, orig, moved: false, id, shift: e.shiftKey, others: visibleBoxes(boxes.filter((b) => !(b.id in orig))), sizes };
  setState({ selection: sel });
  listen();
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
  const st = getState();
  const z = st.view.z;
  if (P.type === 'pan') setState({ view: { ...st.view, x: P.vx + e.clientX - P.sx, y: P.vy + e.clientY - P.sy } });
  else if (P.type === 'marq') {
    const w = toWorld(e.clientX, e.clientY);
    const r = { x: Math.min(P.wx, w.x), y: Math.min(P.wy, w.y), w: Math.abs(w.x - P.wx), h: Math.abs(w.y - P.wy) };
    setState({ marquee: r, selection: [...new Set([...P.base, ...itemsIn(r)])] });
  } else if (P.type === 'move') {
    if (!P.moved && Math.hypot(e.clientX - P.sx, e.clientY - P.sy) < 4) return;
    P.moved = true;
    let dx = (e.clientX - P.sx) / z, dy = (e.clientY - P.sy) / z;
    const snapOn = (st.settings?.boardSnap ?? true) && !e.altKey;
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
  }
}

function onUp() {
  window.removeEventListener('pointermove', onMove);
  const P = ptr;
  ptr = null;
  if (!P) return;
  if (P.type === 'marq') setState({ marquee: null });
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
}

function posOp(id: string, pos: { x: number; y: number }): Op {
  return isCard(id) ? { op: 'update', entity: 'boardCards', id, fields: { x: pos.x, y: pos.y } } : { op: 'update', entity: 'scenes', id, fields: { boardX: pos.x, boardY: pos.y } };
}

export function openItem(id: string) {
  const p = project();
  if (!p) return;
  if (isCard(id)) {
    const c = p.cards.find((x) => x.id === id);
    if (c) openEditor(c.kind, c.refId);
  } else openEditor('scene', id);
}

// ---------- alignment ----------

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
  // final group box after snapping, for drawing guides between the two boxes only
  const fx1 = Math.min(...ids.map((k) => orig[k].x)) + dx, fy1 = Math.min(...ids.map((k) => orig[k].y)) + dy;
  const fx2 = Math.max(...ids.map((k) => orig[k].x + (sizes[k]?.w ?? 0))) + dx, fy2 = Math.max(...ids.map((k) => orig[k].y + (sizes[k]?.h ?? 0))) + dy;
  if (bestX) guides.push({ dir: 'v', at: bestX.at, from: Math.min(fy1, bestX.box.y), to: Math.max(fy2, bestX.box.y + bestX.box.h) });
  if (bestY) guides.push({ dir: 'h', at: bestY.at, from: Math.min(fx1, bestY.box.x), to: Math.max(fx2, bestY.box.x + bestY.box.w) });
  return { dx, dy, guides };
}

export const snapGrid = (v: number) => Math.round(v / GRID) * GRID;

// ---------- auto-arrange (SPEC 7ب.4) ----------

const GAP = GRID * 2;

export function autoArrange() {
  const p = project();
  if (!p || !boardEl) return;
  const boxes = itemBoxes();
  if (!boxes.length) return;
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const r = boardEl.getBoundingClientRect();
  const z = getState().view.z;
  const sceneW = Math.max(...p.scenes.map((s) => byId.get(s.id)?.w ?? CARD.scene[0]), CARD.scene[0]);
  const sceneH = Math.max(...p.scenes.map((s) => byId.get(s.id)?.h ?? CARD.scene[1]), CARD.scene[1]);
  const cols = Math.max(3, Math.floor((r.width / z - GAP) / (sceneW + GAP)));
  const right = snapGrid(Math.max(...boxes.map((b) => b.x + b.w)));
  const top = snapGrid(Math.min(...boxes.map((b) => b.y)));
  const target: Record<string, { x: number; y: number }> = {};
  // Scenes by number: 01 top-right, then leftwards, then a new row (RTL).
  p.scenes.forEach((sc, i) => {
    const c = i % cols, row = Math.floor(i / cols);
    target[sc.id] = { x: snapGrid(right - (c + 1) * sceneW - c * GAP), y: snapGrid(top + row * (sceneH + GAP)) };
  });
  // Other cards under the scene grid, one row per kind.
  let y = top + (p.scenes.length ? Math.ceil(p.scenes.length / cols) * (sceneH + GAP) : 0);
  const width = cols * sceneW + (cols - 1) * GAP;
  for (const kind of ['note', 'character', 'location', 'moodboard'] as const) {
    const cards = p.cards.filter((c) => c.kind === kind);
    if (!cards.length) continue;
    let x = right, rowH = 0;
    for (const c of cards) {
      const b = byId.get(c.id)!;
      if (right - (x - b.w) > width && x !== right) {
        x = right;
        y += rowH + GAP;
        rowH = 0;
      }
      target[c.id] = { x: snapGrid(x - b.w), y: snapGrid(y) };
      x -= b.w + GAP;
      rowH = Math.max(rowH, b.h);
    }
    y += rowH + GAP;
  }
  const ops: Op[] = [];
  const inverse: Op[] = [];
  for (const [id, pos] of Object.entries(target)) {
    const b = byId.get(id)!;
    if (b.x === pos.x && b.y === pos.y) continue;
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
