/**
 * Pure board geometry (UPDATE-1 أ3–أ7): resizing with snapping, auto-arrange without
 * overlaps, alignment/distribution, frames, layer order, card colours. No DOM here, so the
 * rules are unit-tested (shared/board.test.ts) and the web app only wires pointer events.
 */

export interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Guide {
  dir: 'v' | 'h';
  at: number;
  from: number;
  to: number;
}

export const GRID = 24;
export const snapGrid = (v: number) => Math.round(v / GRID) * GRID;

export type ItemKind = 'scene' | 'note' | 'character' | 'location' | 'moodboard' | 'image' | 'heading' | 'frame';

/** Default size per kind (world px). heading: [wrap width, font size]. */
export const DEFAULT_SIZE: Record<ItemKind, [number, number]> = {
  scene: [280, 330], note: [210, 130], character: [210, 200], location: [230, 220], moodboard: [250, 250],
  image: [260, 200], heading: [300, 40], frame: [640, 400],
};

/** Size limits per kind (UPDATE-1 أ4). h = null: height follows the content. heading: font 20–120. */
export const LIMITS: Record<ItemKind, { w: [number, number]; h: [number, number] | null }> = {
  scene: { w: [220, 640], h: null },
  note: { w: [160, 640], h: [90, 640] },
  character: { w: [180, 420], h: null },
  location: { w: [200, 600], h: null },
  moodboard: { w: [200, 800], h: null },
  image: { w: [120, 1400], h: null },
  heading: { w: [80, 2400], h: null },
  frame: { w: [240, 5000], h: [160, 4000] },
};
export const HEADING_FONT: [number, number] = [20, 120];

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Kinds whose card shows a photo that is cropped (never stretched) when only the width changes (UPDATE-3 §3.2). */
export const PHOTO_KINDS: ItemKind[] = ['scene', 'location', 'moodboard', 'image'];
/** Photo height limits for the image card's top/bottom handles. */
export const PHOTO_H: [number, number] = [70, 900];

/** Which handles a kind gets: width-only kinds have no top/bottom handles; images get them for the photo height. */
export function handlesFor(kind: ItemKind): Handle[] {
  return LIMITS[kind].h || kind === 'image' ? ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] : ['e', 'w', 'ne', 'nw', 'se', 'sw'];
}

const clamp = (v: number, [a, b]: [number, number]) => Math.min(b, Math.max(a, v));

/** Snap targets along one axis from other boxes: start, centre, end. */
function targets(others: Box[], axis: 'x' | 'y'): { t: number; box: Box }[] {
  const out: { t: number; box: Box }[] = [];
  for (const b of others) {
    const s = axis === 'x' ? b.x : b.y, l = axis === 'x' ? b.w : b.h;
    out.push({ t: s, box: b }, { t: s + l / 2, box: b }, { t: s + l, box: b });
  }
  return out;
}

/**
 * Snaps one moving edge: to the nearest edge/centre of another box within `tol` (a guide),
 * else to the dot grid. Returns the snapped coordinate and the box it aligned with.
 */
export function snapEdge(v: number, axis: 'x' | 'y', others: Box[], tol: number): { v: number; box: Box | null } {
  let best: { d: number; t: number; box: Box } | null = null;
  for (const c of targets(others, axis)) {
    const d = c.t - v;
    if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t: c.t, box: c.box };
  }
  if (best) return { v: best.t, box: best.box };
  return { v: snapGrid(v), box: null };
}

export interface ResizeInput {
  kind: ItemKind;
  start: Box;
  handle: Handle;
  dx: number;
  dy: number;
  /** image: width / height of the photo (used when photoH is not given) */
  aspect?: number;
  /** photo kinds: height of the photo at the start (world px) */
  photoH?: number;
  /** heading: font size at the start */
  font?: number;
  /** note / frame corner: keep the ratio */
  shift?: boolean;
  snap?: { others: Box[]; tol: number } | null;
}
export interface ResizeOutput {
  box: Box;
  font?: number;
  /** photo kinds: the photo height after the drag */
  photoH?: number;
  guides: Guide[];
}

/**
 * New box while dragging a handle (world px). The opposite edge stays put (UPDATE-3 §3.2):
 * a side stretches one direction only, a corner scales. A photo is never stretched: on a side
 * drag its height stays and it is cropped to the new width; the image card's top/bottom change
 * the photo height; a corner scales the photo with the width. Notes and frames: sides change one
 * dimension, corners both freely (Shift keeps the ratio). A heading's corner scales its font.
 */
export function resize(inp: ResizeInput): ResizeOutput {
  const { kind, start, handle } = inp;
  const lim = LIMITS[kind];
  const corner = handle.length === 2;
  const west = handle.includes('w'), east = handle.includes('e');
  const north = handle.includes('n'), south = handle.includes('s');
  let x1 = start.x, x2 = start.x + start.w, y1 = start.y, y2 = start.y + start.h;
  const guides: Guide[] = [];
  const snapX = (v: number) => {
    if (!inp.snap) return v;
    const r = snapEdge(v, 'x', inp.snap.others, inp.snap.tol);
    if (r.box) guides.push({ dir: 'v', at: r.v, from: Math.min(y1, r.box.y), to: Math.max(y2, r.box.y + r.box.h) });
    return r.v;
  };
  const snapY = (v: number) => {
    if (!inp.snap) return v;
    const r = snapEdge(v, 'y', inp.snap.others, inp.snap.tol);
    if (r.box) guides.push({ dir: 'h', at: r.v, from: Math.min(x1, r.box.x), to: Math.max(x2, r.box.x + r.box.w) });
    return r.v;
  };
  const isPhoto = PHOTO_KINDS.includes(kind);
  const photo0 = inp.photoH ?? (inp.aspect ? start.w / inp.aspect : undefined);
  let photoH: number | undefined = isPhoto ? photo0 : undefined;

  if (west) x1 = snapX(start.x + inp.dx);
  if (east) x2 = snapX(start.x + start.w + inp.dx);
  let w = west || east ? clamp(x2 - x1, lim.w) : start.w;
  if (west) x1 = x2 - w;
  else x2 = x1 + w;

  let h = start.h;
  if (lim.h && (north || south)) {
    if (corner && inp.shift) {
      h = clamp(Math.round(start.h * (w / start.w)), lim.h);
      if (north) y1 = y2 - h;
    } else {
      if (north) y1 = snapY(start.y + inp.dy);
      if (south) y2 = snapY(start.y + start.h + inp.dy);
      h = clamp(y2 - y1, lim.h);
      if (north) y1 = y2 - h;
    }
  } else if (isPhoto && photo0 != null) {
    if (!corner && (north || south)) {
      // image card top/bottom: only the photo height changes, the card grows with it
      const rest = start.h - photo0;
      let outer = start.h;
      if (south) outer = snapY(start.y + start.h + inp.dy) - start.y;
      if (north) outer = start.y + start.h - snapY(start.y + inp.dy);
      photoH = clamp(outer - rest, PHOTO_H);
      h = rest + photoH;
      if (north) y1 = y2 - h;
    } else if (corner) {
      photoH = photo0 * (w / start.w);
      h = start.h - photo0 + photoH;
      if (north) y1 = y2 - h;
    }
    // a side: width only, the photo keeps its height (cropped)
  }
  let font: number | undefined;
  if (kind === 'heading' && inp.font) {
    if (corner) {
      // corner: scale the font with the width
      font = clamp(Math.round(inp.font * (w / start.w)), HEADING_FONT);
      w = Math.round(start.w * (font / inp.font));
      if (west) x1 = x2 - w;
      h = Math.round(start.h * (font / inp.font));
    } else font = inp.font;
  }
  // keep guides only for edges that really ended on the guide after clamping
  const fx1 = x1, fx2 = x1 + w, fy1 = y1, fy2 = y1 + h;
  const kept = guides.filter((g) => (g.dir === 'v' ? Math.abs(g.at - fx1) < 0.5 || Math.abs(g.at - fx2) < 0.5 : Math.abs(g.at - fy1) < 0.5 || Math.abs(g.at - fy2) < 0.5));
  return { box: { id: start.id, x: Math.round(x1), y: Math.round(y1), w: Math.round(w), h: Math.round(h) }, font, photoH: photoH == null ? undefined : Math.round(photoH), guides: kept };
}

// ---------- arrow keys align like the mouse (UPDATE-3 §3.1) ----------

export type NudgeDir = 'left' | 'right' | 'up' | 'down';
/** step: 1 unit · next: Shift, the next stop (guide or grid line) · jump: Alt, straight to the next guide */
export type NudgeMode = 'step' | 'next' | 'jump';

export interface NudgeInput {
  /** bounding box of what moves */
  group: Box;
  /** boxes that can be aligned with (visible, not moving) */
  others: Box[];
  dir: NudgeDir;
  mode: NudgeMode;
  /** the magnet: off → no guides, Shift = one grid step, Alt does nothing */
  snap: boolean;
  /** plain arrow step (board: 1px; plan: 0.05m) */
  step?: number;
  /** grid spacing (board: 24px; plan: 0.25m) */
  grid?: number;
  /** "on the line" tolerance */
  eps?: number;
}
export interface NudgeResult {
  dx: number;
  dy: number;
  /** what stopped the move: an alignment guide, a grid line, a plain step, nothing to jump to, or the magnet is off */
  stop: 'guide' | 'grid' | 'step' | 'none' | 'off';
  /** the box aligned with, when stop = 'guide' */
  box: Box | null;
  /** guides where the moved group now sits exactly on another box's edge or centre */
  guides: Guide[];
}

const marks = (a: number, len: number) => [a, a + len / 2, a + len];

/** Guides for every edge/centre of `g` that sits exactly (< eps) on an edge/centre of another box. */
export function exactGuides(g: Box, others: Box[], eps = 0.5): (Guide & { box: Box })[] {
  const out: (Guide & { box: Box })[] = [];
  const seen = new Set<string>();
  for (const b of others) {
    for (const t of marks(b.x, b.w)) for (const m of marks(g.x, g.w)) {
      if (Math.abs(t - m) < eps && !seen.has('v' + t)) {
        seen.add('v' + t);
        out.push({ dir: 'v', at: t, from: Math.min(g.y, b.y), to: Math.max(g.y + g.h, b.y + b.h), box: b });
      }
    }
    for (const t of marks(b.y, b.h)) for (const m of marks(g.y, g.h)) {
      if (Math.abs(t - m) < eps && !seen.has('h' + t)) {
        seen.add('h' + t);
        out.push({ dir: 'h', at: t, from: Math.min(g.x, b.x), to: Math.max(g.x + g.w, b.x + b.w), box: b });
      }
    }
  }
  return out;
}

/**
 * One arrow key press. Arrows move one step; Shift moves to the next stop in that direction
 * (the nearest alignment line or grid line, never past an edge); Alt jumps straight to the
 * nearest alignment line, or stays put when there is none. ← always moves left on screen.
 */
export function nudgeStep(inp: NudgeInput): NudgeResult {
  const step = inp.step ?? 1, grid = inp.grid ?? GRID, eps = inp.eps ?? 0.5;
  const horiz = inp.dir === 'left' || inp.dir === 'right';
  const sign = inp.dir === 'right' || inp.dir === 'down' ? 1 : -1;
  const g = inp.group;
  const at = (d: number): NudgeResult => {
    const moved = horiz ? { ...g, x: g.x + d } : { ...g, y: g.y + d };
    return { dx: horiz ? d : 0, dy: horiz ? 0 : d, stop: 'step', box: null, guides: inp.snap ? exactGuides(moved, inp.others, eps).map(({ box: _b, ...x }) => x) : [] };
  };
  if (inp.mode === 'step') return at(sign * step);
  if (!inp.snap) {
    if (inp.mode === 'jump') return { dx: 0, dy: 0, stop: 'off', box: null, guides: [] };
    return { ...at(sign * grid), stop: 'grid' };
  }
  // nearest alignment line ahead: any edge/centre of the group onto any edge/centre of another box
  const own = horiz ? marks(g.x, g.w) : marks(g.y, g.h);
  let best: { d: number; box: Box } | null = null;
  for (const b of inp.others) {
    for (const t of horiz ? marks(b.x, b.w) : marks(b.y, b.h)) {
      for (const m of own) {
        const d = (t - m) * sign;
        if (d > eps && (!best || d < best.d)) best = { d, box: b };
      }
    }
  }
  if (inp.mode === 'jump') {
    if (!best) return { dx: 0, dy: 0, stop: 'none', box: null, guides: [] };
    return { ...at(sign * best.d), stop: 'guide', box: best.box };
  }
  // Shift: whichever comes first, the guide or the next grid line of the leading-start edge
  const p0 = horiz ? g.x : g.y;
  const nextGrid = sign > 0 ? Math.floor(p0 / grid + 1e-9) * grid + grid : Math.ceil(p0 / grid - 1e-9) * grid - grid;
  let gd = Math.abs(nextGrid - p0);
  if (gd <= eps) gd += grid;
  if (best && best.d <= gd + 1e-9) return { ...at(sign * best.d), stop: 'guide', box: best.box };
  return { ...at(sign * gd), stop: 'grid' };
}

// ---------- auto-arrange (SPEC 7ب.4, UPDATE-1 أ4: real sizes, never overlapping) ----------

export interface ArrangeItem extends Box {
  kind: ItemKind;
}

/** Kinds laid out under the scene grid, one row band per kind, in this order. */
export const ARRANGE_ORDER: ItemKind[] = ['heading', 'note', 'image', 'character', 'location', 'moodboard'];

/**
 * Scenes (already in number order) on a grid of the largest scene cell: 01 top-right then
 * leftwards (RTL), then the other cards in bands below, wrapped to the grid width. Frames are
 * backgrounds and stay where they are. Returns the new top-left of every arranged item.
 */
export function arrangeLayout(scenes: Box[], cards: ArrangeItem[], viewWidth: number, gap = GRID * 2): Record<string, { x: number; y: number }> {
  const all = [...scenes, ...cards.filter((c) => c.kind !== 'frame')];
  if (!all.length) return {};
  const sceneW = Math.max(DEFAULT_SIZE.scene[0], ...scenes.map((s) => s.w));
  const sceneH = Math.max(DEFAULT_SIZE.scene[1], ...scenes.map((s) => s.h));
  const cols = Math.max(3, Math.floor((viewWidth - gap) / (sceneW + gap)));
  const right = snapGrid(Math.max(...all.map((b) => b.x + b.w)));
  const top = snapGrid(Math.min(...all.map((b) => b.y)));
  const out: Record<string, { x: number; y: number }> = {};
  scenes.forEach((sc, i) => {
    const c = i % cols, row = Math.floor(i / cols);
    // right-align each scene inside its cell so narrower scenes keep the RTL reading line
    out[sc.id] = { x: snapGrid(right - c * (sceneW + gap) - sc.w), y: snapGrid(top + row * (sceneH + gap)) };
  });
  // ceil to the grid so snapping can never pull the next band up into this one
  const ceilGrid = (v: number) => Math.ceil(v / GRID) * GRID;
  let y = ceilGrid(top + (scenes.length ? Math.ceil(scenes.length / cols) * (sceneH + gap) : 0));
  const width = Math.max(cols * sceneW + (cols - 1) * gap, ...cards.map((c) => c.w));
  for (const kind of ARRANGE_ORDER) {
    const list = cards.filter((c) => c.kind === kind);
    if (!list.length) continue;
    let x = right, rowH = 0;
    for (const c of list) {
      if (right - (x - c.w) > width && x !== right) {
        x = right;
        y = ceilGrid(y + rowH + gap);
        rowH = 0;
      }
      // floor the left edge to the grid: the card only moves further left, never into its neighbour
      const left = Math.floor((x - c.w) / GRID) * GRID;
      out[c.id] = { x: left, y };
      x = left - gap;
      rowH = Math.max(rowH, c.h);
    }
    y = ceilGrid(y + rowH + gap);
  }
  return out;
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ---------- alignment and distribution (UPDATE-1 أ3, multi-selection) ----------

export type AlignMode = 'right' | 'hcenter' | 'left' | 'top' | 'vmiddle' | 'bottom';

export function alignBoxes(boxes: Box[], mode: AlignMode): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  if (boxes.length < 2) return out;
  const x1 = Math.min(...boxes.map((b) => b.x)), x2 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.min(...boxes.map((b) => b.y)), y2 = Math.max(...boxes.map((b) => b.y + b.h));
  for (const b of boxes) {
    let { x, y } = b;
    if (mode === 'left') x = x1;
    if (mode === 'right') x = x2 - b.w;
    if (mode === 'hcenter') x = Math.round((x1 + x2) / 2 - b.w / 2);
    if (mode === 'top') y = y1;
    if (mode === 'bottom') y = y2 - b.h;
    if (mode === 'vmiddle') y = Math.round((y1 + y2) / 2 - b.h / 2);
    out[b.id] = { x, y };
  }
  return out;
}

/** Equal gaps between 3+ boxes along an axis; the two outer boxes stay put. */
export function distribute(boxes: Box[], axis: 'h' | 'v'): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  if (boxes.length < 3) return out;
  const pos = (b: Box) => (axis === 'h' ? b.x : b.y);
  const len = (b: Box) => (axis === 'h' ? b.w : b.h);
  const sorted = [...boxes].sort((a, b) => pos(a) - pos(b));
  const first = sorted[0], last = sorted[sorted.length - 1];
  const span = pos(last) + len(last) - pos(first);
  const gap = (span - sorted.reduce((a, b) => a + len(b), 0)) / (sorted.length - 1);
  let at = pos(first);
  for (const b of sorted) {
    out[b.id] = axis === 'h' ? { x: Math.round(at), y: b.y } : { x: b.x, y: Math.round(at) };
    at += len(b) + gap;
  }
  return out;
}

// ---------- frames ----------

/** Items whose centre lies inside the frame (membership is geometric, never stored). */
export function insideFrame(frame: Box, boxes: Box[]): string[] {
  return boxes
    .filter((b) => b.id !== frame.id)
    .filter((b) => {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      return cx >= frame.x && cx <= frame.x + frame.w && cy >= frame.y && cy <= frame.y + frame.h;
    })
    .map((b) => b.id);
}

/** «إطار حول المحدد»: the selection's bounding box with a margin. */
export function frameAround(boxes: Box[], margin = 40): { x: number; y: number; w: number; h: number } {
  const x1 = Math.min(...boxes.map((b) => b.x)) - margin, y1 = Math.min(...boxes.map((b) => b.y)) - margin;
  const x2 = Math.max(...boxes.map((b) => b.x + b.w)) + margin, y2 = Math.max(...boxes.map((b) => b.y + b.h)) + margin;
  return { x: Math.round(x1), y: Math.round(y1), w: Math.round(Math.max(LIMITS.frame.w[0], x2 - x1)), h: Math.round(Math.max(LIMITS.frame.h![0], y2 - y1)) };
}

// ---------- layer order ----------

export interface Layered {
  id: string;
  z: number;
}

/**
 * New z values after moving `ids` forward/backward one step or to the top/bottom. Ties in z
 * are broken by the given order (the current drawing order), then everything is renumbered
 * 1..n; only changed values are returned.
 */
export function reorder(items: Layered[], ids: string[], how: 'forward' | 'backward' | 'front' | 'back'): Record<string, number> {
  const order = items.map((it, i) => ({ ...it, i })).sort((a, b) => a.z - b.z || a.i - b.i).map((x) => x.id);
  const sel = new Set(ids);
  let next = [...order];
  if (how === 'front') next = [...order.filter((id) => !sel.has(id)), ...order.filter((id) => sel.has(id))];
  if (how === 'back') next = [...order.filter((id) => sel.has(id)), ...order.filter((id) => !sel.has(id))];
  if (how === 'forward') {
    for (let i = next.length - 2; i >= 0; i--) if (sel.has(next[i]) && !sel.has(next[i + 1])) [next[i], next[i + 1]] = [next[i + 1], next[i]];
  }
  if (how === 'backward') {
    for (let i = 1; i < next.length; i++) if (sel.has(next[i]) && !sel.has(next[i - 1])) [next[i], next[i - 1]] = [next[i - 1], next[i]];
  }
  const z = new Map(items.map((it) => [it.id, it.z]));
  const out: Record<string, number> = {};
  next.forEach((id, i) => {
    if (z.get(id) !== i + 1) out[id] = i + 1;
  });
  return out;
}

/** Drawing order: by z, ties keep the given order. */
export function drawOrder<T extends Layered>(items: T[]): T[] {
  return items.map((it, i) => ({ it, i })).sort((a, b) => a.it.z - b.it.z || a.i - b.i).map((x) => x.it);
}

// ---------- colours for notes, frames and headings (UPDATE-1 أ5) ----------

export const COLOR_HEX: Record<string, string> = {
  gold: '#c9a14f', amber: '#c27a32', sand: '#cdb488', clay: '#94603f', night: '#2e3d5c', olive: '#6c6a3c', wine: '#6e2c34', cool: '#7c8288',
};
const LIGHT_BG = '#fdfcfa', DARK_BG = '#141210';

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]: number[]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b);
  return toHex(x.map((v, i) => v * t + y[i] * (1 - t)));
}
function lum(hex: string): number {
  const c = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string): number {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Calm tint in light mode, deeper tone in dark mode, with readable text (AA ≥ 4.5). */
export function cardColors(key: string | null | undefined, theme: 'light' | 'dark'): { bg: string; fg: string; accent: string } | null {
  const hex = key ? COLOR_HEX[key] : undefined;
  if (!hex) return null;
  if (theme === 'light') {
    const bg = mix(hex, LIGHT_BG, 0.24);
    return { bg, fg: '#141210', accent: hex };
  }
  const bg = mix(hex, DARK_BG, 0.45);
  return { bg, fg: '#fdfcfa', accent: mix(hex, '#fdfcfa', 0.8) };
}

/** Heading text colour on the board background: the colour itself, darkened/lightened to ≥ 3:1 (large text). */
export function headingColor(key: string | null | undefined, theme: 'light' | 'dark'): string | null {
  const hex = key ? COLOR_HEX[key] : undefined;
  if (!hex) return null;
  const bg = theme === 'light' ? LIGHT_BG : DARK_BG;
  const toward = theme === 'light' ? '#141210' : '#fdfcfa';
  let c = hex;
  for (let t = 1; contrast(c, bg) < 3 && t > 0; t -= 0.05) c = mix(hex, toward, t);
  return c;
}
