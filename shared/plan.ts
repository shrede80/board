/**
 * مخطط التصوير (UPDATE-3 §6): a scene seen from above, in metres. Pure: the field-of-view
 * maths, the gear table (by equipment id), the palette and the top-down drawings (SVG strings,
 * used by the interactive plan, the PNG for the team and the storyboard PDF). Tested in
 * shared/plan.test.ts.
 */
import type { Row } from './schema';

// ---------- cameras (§6.3, §6.4) ----------

export interface CamSpec {
  /** sensor width in mm for the real focal length (APS-C 23.5); 36 = the focal length is 35mm-equivalent */
  w: number;
  hex: string;
  /** zoom lenses by equipment id: [min, max] mm */
  lenses?: Record<string, [number, number]>;
  /** built-in lenses: label → mm (35mm-equivalent) */
  builtin?: Record<string, number>;
  /** fixed focal length */
  fixed?: number;
  /** zoom range of a bridge camera (equivalent) */
  zoom?: [number, number];
  icon: 'mirrorless' | 'phone' | 'drone' | 'bridge' | 'generic';
}

export const CAMS: Record<string, CamSpec> = {
  'cam-zve10': { w: 23.5, hex: '#c27a32', lenses: { 'lens-sigma1850': [18, 50], 'lens-sonypz': [16, 50] }, icon: 'mirrorless' },
  'cam-iphone15': { w: 36, hex: '#3b6fd8', builtin: { '0.5x': 13, '1x': 24, '2x': 48, '3x': 77 }, icon: 'phone' },
  'cam-mini4': { w: 36, hex: '#1f9e8f', fixed: 24, icon: 'drone' },
  'cam-hx200v': { w: 36, hex: '#7b55c7', zoom: [27, 810], icon: 'bridge' },
};
/** Any camera added later: a generic icon, 35mm-equivalent maths. */
export const GENERIC_CAM: CamSpec = { w: 36, hex: '#7c8288', zoom: [12, 300], icon: 'generic' };
export const camSpec = (id: string | null | undefined): CamSpec => (id && CAMS[id]) || GENERIC_CAM;

/** Horizontal angle of view in degrees: 2·atan(W / 2f); a vertical (9:16) frame uses W × 9/16. */
export function hfov(cam: string | null | undefined, focalMm: number, vertical = false): number {
  const c = camSpec(cam);
  const f = Math.max(1, focalMm || c.fixed || 24);
  const W = c.w * (vertical ? 9 / 16 : 1);
  return (2 * Math.atan(W / (2 * f)) * 180) / Math.PI;
}

/** Width of the frame at distance d (m): 2·d·tan(hfov / 2). */
export function frameWidth(fovDeg: number, d: number): number {
  return 2 * d * Math.tan((fovDeg * Math.PI) / 360);
}

/** Default lens and focal length when a camera is placed or changed. */
export function camDefaults(cam: string | null | undefined): { lens: string | null; focalMm: number } {
  const c = camSpec(cam);
  if (c.lenses) {
    const lens = Object.keys(c.lenses)[0];
    return { lens, focalMm: Math.max(c.lenses[lens][0], 24) };
  }
  if (c.builtin) return { lens: '1x', focalMm: c.builtin['1x'] ?? 24 };
  if (c.fixed) return { lens: null, focalMm: c.fixed };
  return { lens: null, focalMm: c.zoom?.[0] ?? 24 };
}

/** The focal length of an item, honouring the camera's fixed lens. */
export function focalOf(it: { refId?: unknown; props?: unknown }): number {
  const p = (it.props ?? {}) as PlanProps;
  const c = camSpec(it.refId as string);
  return c.fixed ?? (Number(p.focalMm) || camDefaults(it.refId as string).focalMm);
}

// ---------- lights (§6.5) ----------

export interface LightSpec {
  beam: number;
  cct?: boolean;
  rgb?: boolean;
  bounce?: boolean;
  /** modifier equipment id → beam (HS60B) */
  mods?: Record<string, number>;
  icon: 'cob' | 'stick' | 'wand' | 'panel' | 'reflector' | 'mirror' | 'generic';
}
export const LIGHTS: Record<string, LightSpec> = {
  'lt-hs60b': { beam: 55, cct: true, mods: { none: 55, 'lt-softbox45': 95, 'lt-lantern30': 360 }, icon: 'cob' },
  'lt-ua20c': { beam: 120, cct: true, rgb: true, icon: 'stick' },
  'lt-lm07': { beam: 110, cct: true, icon: 'wand' },
  'lt-desiontal': { beam: 110, rgb: true, cct: true, icon: 'panel' },
  'lt-reflector': { beam: 60, bounce: true, icon: 'reflector' },
  'lt-mirror': { beam: 18, bounce: true, icon: 'mirror' },
};
export const GENERIC_LIGHT: LightSpec = { beam: 90, cct: true, icon: 'generic' };
export const lightSpec = (id: string | null | undefined): LightSpec => (id && LIGHTS[id]) || GENERIC_LIGHT;
/** Modifiers are equipment too; they are chosen on the HS60B, not placed. */
export const LIGHT_MODIFIERS = new Set(['lt-softbox45', 'lt-lantern30']);

export function beamOf(it: { refId?: unknown; props?: unknown }): number {
  const L = lightSpec(it.refId as string);
  const p = (it.props ?? {}) as PlanProps;
  return L.mods ? L.mods[p.modifier || 'none'] ?? L.beam : L.beam;
}

/** Colour temperature → light colour: 2700K amber … 6500K bluish white. */
export function cctColor(k: number): string {
  const t = Math.max(0, Math.min(1, ((k || 5600) - 2700) / (6500 - 2700)));
  const stops: [number, [number, number, number]][] = [[0, [255, 160, 64]], [0.35, [255, 200, 130]], [0.7, [255, 236, 200]], [1, [205, 224, 255]]];
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
  const [a, ca] = stops[i], [b, cb] = stops[i + 1];
  const k2 = (t - a) / (b - a);
  const c = ca.map((v, j) => Math.round(v + (cb[j] - v) * k2));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
export function lightColor(it: { refId?: unknown; props?: unknown }): string {
  const L = lightSpec(it.refId as string);
  const p = (it.props ?? {}) as PlanProps;
  return p.rgb && L.rgb ? p.rgb : cctColor(Number(p.cct) || 5600);
}

// ---------- items ----------

export type PlanKind = 'camera' | 'light' | 'person' | 'furniture' | 'zone' | 'arrow' | 'text';
export interface PlanProps {
  lens?: string | null;
  focalMm?: number;
  vertical?: boolean;
  range?: number;
  cct?: number;
  rgb?: string;
  modifier?: string;
  /** furniture type */
  type?: string;
  /** arrow points, relative to x/y (m) */
  points?: [number, number][];
  dashed?: boolean;
  /** drone height (m) */
  height?: number | null;
}
export interface PlanItem {
  id: string;
  sceneId: string;
  kind: PlanKind;
  refId: string | null;
  x: number;
  y: number;
  rot: number;
  w: number;
  h: number;
  z: number;
  label: string;
  color: string | null;
  props: PlanProps;
}
export const asItem = (r: Row): PlanItem => ({
  id: r.id, sceneId: r.sceneId as string, kind: r.kind as PlanKind, refId: (r.refId as string) ?? null,
  x: Number(r.x) || 0, y: Number(r.y) || 0, rot: Number(r.rot) || 0, w: Number(r.w) || 1, h: Number(r.h) || 1, z: Number(r.z) || 0,
  label: (r.label as string) ?? '', color: (r.color as string) ?? null, props: ((r.props as PlanProps) ?? {}) as PlanProps,
});

/** Furniture (§6.3): type, name, width × depth (m). */
export const FURNITURE: [string, string, number, number][] = [
  ['table', 'طاولة', 1.6, 0.8], ['roundtable', 'طاولة دائرية', 1, 1], ['chair', 'كرسي', 0.55, 0.55], ['sofa', 'كنبة', 2, 0.9],
  ['desk', 'مكتب', 1.4, 0.7], ['screen', 'شاشة', 1.6, 0.14], ['stage', 'منصة', 4, 2], ['door', 'باب', 0.9, 0.9],
  ['window', 'نافذة', 1.2, 0.15], ['wall', 'جدار', 4, 0.15], ['plant', 'نبتة', 0.6, 0.6], ['car', 'سيارة', 4.5, 1.8],
];
export const PERSON_COLORS = ['#c9a14f', '#94603f', '#2e3d5c', '#6c6a3c', '#6e2c34', '#7c8288'];

/** Next free camera letter: A, B, C … (Z, then AA). */
export function nextLetter(items: { kind: string; label: string }[]): string {
  const used = new Set(items.filter((i) => i.kind === 'camera').map((i) => i.label));
  for (let i = 0; i < 52; i++) {
    const l = i < 26 ? String.fromCharCode(65 + i) : 'A' + String.fromCharCode(65 + i - 26);
    if (!used.has(l)) return l;
  }
  return '?';
}

/** Footprint of an item (m) for selection and alignment, axis-aligned after rotation. */
export function footprint(it: PlanItem): { x: number; y: number; w: number; h: number } {
  let w = it.w, h = it.h;
  if (it.kind === 'camera' || it.kind === 'light') w = h = 0.8;
  if (it.kind === 'person') w = h = 0.62;
  if (it.kind === 'arrow') {
    const pts = (it.props.points ?? [[0, 0]]).map(([a, b]) => [it.x + a, it.y + b]);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(0.1, Math.max(...xs) - Math.min(...xs)), h: Math.max(0.1, Math.max(...ys) - Math.min(...ys)) };
  }
  const a = (it.rot * Math.PI) / 180;
  const W = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a)), H = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
  return { x: it.x - W / 2, y: it.y - H / 2, w: W, h: H };
}

export const PLAN_GRID = 0.25;
export const snapM = (v: number, on: boolean) => (on ? Math.round(v / PLAN_GRID) * PLAN_GRID : Math.round(v * 100) / 100);
/** Rotation from the handle: steps of 15°, Alt = free. 0 = facing up. */
export function rotFromPoint(cx: number, cy: number, px: number, py: number, free: boolean): number {
  let a = (Math.atan2(px - cx, -(py - cy)) * 180) / Math.PI;
  if (!free) a = Math.round(a / 15) * 15;
  return ((a % 360) + 360) % 360;
}

// ---------- drawings (top-down, coloured, §6.3) ----------

const n = (v: number) => Math.round(v * 100) / 100;

/** A camera seen from above, s = px per metre, facing up (−y). */
export function camIcon(cam: string | null, s: number): string {
  const c = camSpec(cam), h = c.hex;
  if (c.icon === 'drone') {
    return `<g><path d="M${n(-0.32 * s)} ${n(-0.32 * s)}L${n(0.32 * s)} ${n(0.32 * s)}M${n(0.32 * s)} ${n(-0.32 * s)}L${n(-0.32 * s)} ${n(0.32 * s)}" stroke="#20201f" stroke-width="${n(0.07 * s)}"/>${[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => `<circle cx="${n(a * 0.32 * s)}" cy="${n(b * 0.32 * s)}" r="${n(0.15 * s)}" fill="${h}33" stroke="${h}" stroke-width="${n(0.035 * s)}"/>`).join('')}<rect x="${n(-0.12 * s)}" y="${n(-0.17 * s)}" width="${n(0.24 * s)}" height="${n(0.34 * s)}" rx="${n(0.06 * s)}" fill="#2a2a2c"/><circle cx="0" cy="${n(-0.16 * s)}" r="${n(0.05 * s)}" fill="${h}"/></g>`;
  }
  if (c.icon === 'phone') {
    return `<g><rect x="${n(-0.4 * s)}" y="${n(0.02 * s)}" width="${n(0.8 * s)}" height="${n(0.12 * s)}" rx="${n(0.05 * s)}" fill="#55534f"/><rect x="${n(-0.2 * s)}" y="${n(-0.22 * s)}" width="${n(0.4 * s)}" height="${n(0.26 * s)}" rx="${n(0.05 * s)}" fill="#6f6c66"/><rect x="${n(-0.36 * s)}" y="${n(-0.05 * s)}" width="${n(0.72 * s)}" height="${n(0.1 * s)}" rx="${n(0.04 * s)}" fill="${h}"/><circle cx="${n(-0.08 * s)}" cy="${n(-0.13 * s)}" r="${n(0.045 * s)}" fill="#1b1b1d"/><circle cx="${n(0.08 * s)}" cy="${n(-0.13 * s)}" r="${n(0.045 * s)}" fill="#1b1b1d"/></g>`;
  }
  const big = c.icon === 'bridge', gen = c.icon === 'generic';
  return `<g><rect x="${n(-0.3 * s)}" y="${n(-0.05 * s)}" width="${n(0.6 * s)}" height="${n(0.32 * s)}" rx="${n(0.06 * s)}" fill="#2d2c2a"/><rect x="${n(-0.3 * s)}" y="${n(0.17 * s)}" width="${n(0.6 * s)}" height="${n(0.1 * s)}" rx="${n(0.04 * s)}" fill="${h}"/><rect x="${n(-(big ? 0.17 : 0.14) * s)}" y="${n(-(big ? 0.42 : 0.3) * s)}" width="${n((big ? 0.34 : 0.28) * s)}" height="${n((big ? 0.4 : 0.28) * s)}" rx="${n(0.05 * s)}" fill="#151515"/><rect x="${n(-(big ? 0.15 : 0.12) * s)}" y="${n(-(big ? 0.44 : 0.32) * s)}" width="${n((big ? 0.3 : 0.24) * s)}" height="${n(0.05 * s)}" rx="${n(0.02 * s)}" fill="${gen ? '#9aa0a6' : h}"/></g>`;
}

export function lightIcon(refId: string | null, props: PlanProps, s: number): string {
  const L = lightSpec(refId), col = lightColor({ refId, props });
  if (L.icon === 'reflector') return `<g><ellipse cx="0" cy="0" rx="${n(0.36 * s)}" ry="${n(0.1 * s)}" fill="#e8c46a" stroke="#9a7a2e" stroke-width="${n(0.025 * s)}"/><path d="M${n(-0.36 * s)} 0A${n(0.36 * s)} ${n(0.1 * s)} 0 0 0 ${n(0.36 * s)} 0Z" fill="#cfd3d8"/></g>`;
  if (L.icon === 'mirror') return `<rect x="${n(-0.18 * s)}" y="${n(-0.04 * s)}" width="${n(0.36 * s)}" height="${n(0.08 * s)}" fill="#dfe6ee" stroke="#8796a6" stroke-width="${n(0.02 * s)}"/>`;
  if (L.icon === 'stick') return `<g><rect x="${n(-0.4 * s)}" y="${n(-0.06 * s)}" width="${n(0.8 * s)}" height="${n(0.12 * s)}" rx="${n(0.06 * s)}" fill="#2a2a2c"/><rect x="${n(-0.36 * s)}" y="${n(-0.07 * s)}" width="${n(0.72 * s)}" height="${n(0.05 * s)}" rx="${n(0.02 * s)}" fill="${col}"/></g>`;
  if (L.icon === 'wand') return `<g><rect x="${n(-0.22 * s)}" y="${n(-0.04 * s)}" width="${n(0.44 * s)}" height="${n(0.08 * s)}" rx="${n(0.04 * s)}" fill="#2a2a2c"/><rect x="${n(-0.18 * s)}" y="${n(-0.05 * s)}" width="${n(0.36 * s)}" height="${n(0.03 * s)}" fill="${col}"/></g>`;
  if (L.icon === 'panel' || L.icon === 'generic') return `<g><rect x="${n(-0.14 * s)}" y="${n(-0.1 * s)}" width="${n(0.28 * s)}" height="${n(0.2 * s)}" rx="${n(0.03 * s)}" fill="#2a2a2c"/><rect x="${n(-0.12 * s)}" y="${n(-0.12 * s)}" width="${n(0.24 * s)}" height="${n(0.04 * s)}" fill="${col}"/></g>`;
  const head = `<rect x="${n(-0.17 * s)}" y="${n(-0.02 * s)}" width="${n(0.34 * s)}" height="${n(0.3 * s)}" rx="${n(0.05 * s)}" fill="#3a3936"/><circle cx="0" cy="${n(0.13 * s)}" r="${n(0.05 * s)}" fill="#777"/>`;
  if (props.modifier === 'lt-softbox45') return `<g>${head}<path d="M${n(-0.15 * s)} ${n(-0.02 * s)}L${n(-0.42 * s)} ${n(-0.34 * s)}L${n(0.42 * s)} ${n(-0.34 * s)}L${n(0.15 * s)} ${n(-0.02 * s)}Z" fill="#f4f1ea" stroke="#9b958a" stroke-width="${n(0.025 * s)}"/><rect x="${n(-0.42 * s)}" y="${n(-0.38 * s)}" width="${n(0.84 * s)}" height="${n(0.05 * s)}" fill="${col}"/></g>`;
  if (props.modifier === 'lt-lantern30') return `<g>${head}<circle cx="0" cy="${n(-0.2 * s)}" r="${n(0.24 * s)}" fill="#fbf8f1" stroke="#9b958a" stroke-width="${n(0.025 * s)}"/></g>`;
  return `<g>${head}<rect x="${n(-0.15 * s)}" y="${n(-0.06 * s)}" width="${n(0.3 * s)}" height="${n(0.06 * s)}" fill="${col}"/></g>`;
}

export function furnIcon(type: string, w0: number, h0: number, s: number): string {
  const w = w0 * s, h = h0 * s, x = -w / 2, y = -h / 2;
  const F = 'var(--plan-furn)', E = 'var(--plan-furn-edge)', sw = n(Math.max(1, 0.025 * s));
  switch (type) {
    case 'screen': return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(h / 2)}" fill="#1b1a18"/>`;
    case 'chair': return `<g><rect x="${n(x)}" y="${n(y + h * 0.18)}" width="${n(w)}" height="${n(h * 0.82)}" rx="${n(w * 0.18)}" fill="${F}" stroke="${E}" stroke-width="${sw}"/><path d="M${n(x)} ${n(y + h * 0.3)}Q0 ${n(y - h * 0.25)} ${n(-x)} ${n(y + h * 0.3)}" fill="none" stroke="${E}" stroke-width="${n(sw * 2.4)}" stroke-linecap="round"/></g>`;
    case 'roundtable': return `<ellipse rx="${n(w / 2)}" ry="${n(h / 2)}" fill="${F}" stroke="${E}" stroke-width="${sw}"/>`;
    case 'sofa': return `<g><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(h * 0.2)}" fill="${F}" stroke="${E}" stroke-width="${sw}"/><rect x="${n(x + w * 0.08)}" y="${n(y + h * 0.3)}" width="${n(w * 0.84)}" height="${n(h * 0.62)}" rx="${n(h * 0.12)}" fill="none" stroke="${E}" stroke-width="${sw}"/></g>`;
    case 'door': return `<g><path d="M${n(x)} ${n(y + h)}L${n(x)} ${n(y)}" stroke="${E}" stroke-width="${n(sw * 2)}"/><path d="M${n(x)} ${n(y)}A${n(w)} ${n(h)} 0 0 1 ${n(x + w)} ${n(y + h)}" fill="none" stroke="${E}" stroke-width="${sw}" stroke-dasharray="${n(sw * 3)}"/></g>`;
    case 'window': return `<g><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="#dfe9f2" stroke="${E}" stroke-width="${sw}"/><line x1="${n(x)}" y1="0" x2="${n(-x)}" y2="0" stroke="${E}" stroke-width="${sw}"/></g>`;
    case 'wall': return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="#4a443b"/>`;
    case 'plant': return `<g>${[0, 60, 120, 180, 240, 300].map((a) => `<ellipse cx="0" cy="${n(-w * 0.25)}" rx="${n(w * 0.12)}" ry="${n(w * 0.26)}" fill="#6c8a4a" transform="rotate(${a})"/>`).join('')}<circle r="${n(w * 0.12)}" fill="#4f6b33"/></g>`;
    case 'car': return `<g><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(h * 0.3)}" fill="#8a8f96" stroke="#4d5258" stroke-width="${sw}"/><rect x="${n(x + w * 0.22)}" y="${n(y + h * 0.12)}" width="${n(w * 0.5)}" height="${n(h * 0.76)}" rx="${n(h * 0.15)}" fill="#5c626a"/></g>`;
    case 'stage': return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${F}" stroke="${E}" stroke-width="${sw}" stroke-dasharray="${n(sw * 4)}"/>`;
    default: return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(Math.min(w, h) * 0.12)}" fill="${F}" stroke="${E}" stroke-width="${sw}"/>`;
  }
}

export function personIcon(color: string | null, s: number): string {
  const c = color || '#7c8288';
  return `<g><ellipse cx="0" cy="${n(0.04 * s)}" rx="${n(0.3 * s)}" ry="${n(0.17 * s)}" fill="${c}" opacity=".9"/><circle cx="0" cy="${n(0.02 * s)}" r="${n(0.13 * s)}" fill="#e9d9c4" stroke="${c}" stroke-width="${n(0.035 * s)}"/><path d="M${n(-0.06 * s)} ${n(-0.12 * s)}L0 ${n(-0.22 * s)}L${n(0.06 * s)} ${n(-0.12 * s)}" fill="${c}"/></g>`;
}

/** The body of an item, centred at 0,0, before its rotation. */
export function itemBody(it: PlanItem, s: number): string {
  if (it.kind === 'camera') return camIcon(it.refId, s);
  if (it.kind === 'light') return lightIcon(it.refId, it.props, s * 1.25);
  if (it.kind === 'person') return personIcon(it.color, s);
  if (it.kind === 'furniture') return furnIcon(it.props.type ?? 'table', it.w, it.h, s);
  return '';
}

/** A wedge (cone) from the item's centre, rotation 0 = up. */
export function wedge(px: number, py: number, rotDeg: number, spanDeg: number, r: number): string {
  if (spanDeg >= 359) return `M${n(px - r)} ${n(py)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`;
  const a = ((rotDeg - 90 - spanDeg / 2) * Math.PI) / 180, b = ((rotDeg - 90 + spanDeg / 2) * Math.PI) / 180;
  return `M${n(px)} ${n(py)}L${n(px + r * Math.cos(a))} ${n(py + r * Math.sin(a))}A${n(r)} ${n(r)} 0 ${spanDeg > 180 ? 1 : 0} 1 ${n(px + r * Math.cos(b))} ${n(py + r * Math.sin(b))}Z`;
}

export interface Names {
  cam: (id: string | null) => string;
  light: (id: string | null) => string;
  lens: (cam: string | null, lens: string | null) => string;
}

/**
 * The whole plan as one standalone SVG (for «صورة للفريق» and the storyboard PDF): fitted,
 * the grid, cones, beams, items, labels, and a key of the cameras and lights. Colours are plain
 * values so the file looks the same anywhere.
 */
export function planSvg(items: PlanItem[], o: { title?: string; subtitle?: string; names: Names; width?: number; dark?: boolean; legend?: boolean }): { svg: string; width: number; height: number } {
  const W = o.width ?? 1200;
  const pad = 0.8;
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const it of items) {
    const f = footprint(it);
    a = Math.min(a, f.x); b = Math.min(b, f.y); c = Math.max(c, f.x + f.w); d = Math.max(d, f.y + f.h);
    // cones and beams are part of the picture: take their far edge too
    if (it.kind === 'camera' || it.kind === 'light') {
      const r = Number(it.props.range) || 3;
      const span = it.kind === 'camera' ? hfov(it.refId, focalOf(it), !!it.props.vertical) : beamOf(it);
      const angles = span >= 359 ? [0, 90, 180, 270] : [-span / 2, 0, span / 2].map((x) => it.rot + x);
      for (const ang of angles) {
        const t = ((ang - 90) * Math.PI) / 180;
        const ex = it.x + r * Math.cos(t), ey = it.y + r * Math.sin(t);
        a = Math.min(a, ex); b = Math.min(b, ey); c = Math.max(c, ex); d = Math.max(d, ey);
      }
    }
  }
  if (!items.length) { a = 0; b = 0; c = 6; d = 4; }
  a -= pad; b -= pad; c += pad + 0.6; d += pad;
  const head = o.title ? 70 : 0;
  const cams = items.filter((i) => i.kind === 'camera'), lights = items.filter((i) => i.kind === 'light');
  const legendRows = o.legend === false ? 0 : cams.length + lights.length;
  const foot = legendRows ? 24 + legendRows * 22 : 0;
  const s = Math.min(160, W / (c - a));
  const H = Math.round((d - b) * s) + head + foot;
  const bg = o.dark ? '#171512' : '#faf8f3', ink = o.dark ? '#fdfcfa' : '#141210', mute = o.dark ? '#b3aa9c' : '#6b6359';
  const gridA = o.dark ? 'rgba(253,252,250,.05)' : 'rgba(20,18,16,.07)', gridB = o.dark ? 'rgba(253,252,250,.1)' : 'rgba(20,18,16,.13)';
  const px = (x: number) => (x - a) * s, py = (y: number) => (y - b) * s + head;
  let out = `<rect width="${W}" height="${H}" fill="${bg}"/>`;
  if (o.title) out += `<text x="${W - 24}" y="34" text-anchor="end" font-size="24" font-weight="700" fill="${ink}" font-family="sans-serif">${esc(o.title)}</text><text x="${W - 24}" y="58" text-anchor="end" font-size="15" fill="${mute}" font-family="sans-serif">${esc(o.subtitle ?? '')}</text>`;
  for (let x = Math.ceil(a * 2) / 2; x <= c; x += 0.5) out += `<line x1="${n(px(x))}" y1="${head}" x2="${n(px(x))}" y2="${n(py(d))}" stroke="${Math.abs(x % 1) < 1e-6 ? gridB : gridA}"/>`;
  for (let y = Math.ceil(b * 2) / 2; y <= d; y += 0.5) out += `<line x1="0" y1="${n(py(y))}" x2="${W}" y2="${n(py(y))}" stroke="${Math.abs(y % 1) < 1e-6 ? gridB : gridA}"/>`;
  out += itemsSvg(items, s, px, py, { ink, mute, names: o.names, labels: true });
  if (legendRows) {
    let y = Math.round((d - b) * s) + head + 24;
    const line = (color: string, text: string) => {
      out += `<rect x="${W - 34}" y="${y - 11}" width="12" height="12" rx="3" fill="${color}"/><text x="${W - 42}" y="${y}" text-anchor="end" font-size="14" fill="${ink}" font-family="sans-serif">${esc(text)}</text>`;
      y += 22;
    };
    for (const cam of cams) {
      const f = focalOf(cam), fov = hfov(cam.refId, f, !!cam.props.vertical);
      line(camSpec(cam.refId).hex, `${cam.label} · ${o.names.cam(cam.refId)} · ${o.names.lens(cam.refId, cam.props.lens ?? null) || ''} ${Math.round(f)}mm · ${Math.round(fov)}°`.replace(/ ·  /, ' · '));
    }
    for (const l of lights) line(lightColor(l), `${l.label || o.names.light(l.refId)} · ${o.names.light(l.refId)}`);
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${out}</svg>`, width: W, height: H };
}

/** Cones, beams and items (shared by the standalone SVG). */
export function itemsSvg(items: PlanItem[], s: number, px: (x: number) => number, py: (y: number) => number, o: { ink: string; mute: string; names: Names; labels: boolean }): string {
  let out = '';
  const sorted = [...items].sort((p, q) => (q.kind === 'zone' ? 1 : 0) - (p.kind === 'zone' ? 1 : 0) || p.z - q.z);
  for (const it of sorted) {
    const X = px(it.x), Y = py(it.y), r = (Number(it.props.range) || 3) * s;
    if (it.kind === 'camera') {
      const hex = camSpec(it.refId).hex, f = focalOf(it), fov = hfov(it.refId, f, !!it.props.vertical);
      out += `<path d="${wedge(X, Y, it.rot, fov, r)}" fill="${hex}" fill-opacity=".1" stroke="${hex}" stroke-opacity=".55" stroke-width="1.5"/>`;
      const m = ((it.rot - 90) * Math.PI) / 180;
      if (o.labels) out += `<text x="${n(X + (r + 14) * Math.cos(m))}" y="${n(Y + (r + 14) * Math.sin(m))}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="700" fill="${hex}" font-family="sans-serif" direction="ltr">${esc(`${it.label} · ${Math.round(f)}mm · ${Math.round(fov)}°`)}</text>`;
    }
    if (it.kind === 'light') {
      const col = lightColor(it), gid = `lg-${it.id.replace(/[^a-z0-9]/gi, '')}`;
      out += `<defs><radialGradient id="${gid}" cx="${n(X)}" cy="${n(Y)}" r="${n(r)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${col}" stop-opacity=".55"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient></defs><path d="${wedge(X, Y, it.rot, beamOf(it), r)}" fill="url(#${gid})" stroke="#e0a64a" stroke-opacity=".45" stroke-dasharray="4 5" stroke-width="1.2"/>`;
    }
  }
  for (const it of sorted) {
    const X = px(it.x), Y = py(it.y);
    if (it.kind === 'zone' || it.kind === 'text') {
      const w = it.w * s, h = it.h * s;
      out += `<g transform="translate(${n(X)} ${n(Y)}) rotate(${n(it.rot)})">${it.kind === 'zone' ? `<rect x="${n(-w / 2)}" y="${n(-h / 2)}" width="${n(w)}" height="${n(h)}" rx="10" fill="#d2a06a" fill-opacity=".08" stroke="#d2a06a" stroke-dasharray="6 5" stroke-width="1.4"/>` : ''}<text x="${it.kind === 'zone' ? n(w / 2 - 12) : 0}" y="${it.kind === 'zone' ? n(-h / 2 + 22) : 5}" text-anchor="${it.kind === 'zone' ? 'end' : 'middle'}" font-size="15" font-weight="700" fill="${o.mute}" font-family="sans-serif">${esc(it.label)}</text></g>`;
      continue;
    }
    if (it.kind === 'arrow') {
      out += arrowSvg(it, px, py);
      continue;
    }
    out += `<g transform="translate(${n(X)} ${n(Y)}) rotate(${n(it.rot)})">${itemBody(it, s).replace(/var\(--plan-furn\)/g, '#d9cdb6').replace(/var\(--plan-furn-edge\)/g, '#8a7a62')}</g>`;
    if (it.kind === 'camera') out += `<g transform="translate(${n(X + 0.42 * s)} ${n(Y - 0.42 * s)})"><circle r="10" fill="${camSpec(it.refId).hex}"/><text text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="700" fill="#fff" font-family="sans-serif">${esc(it.label)}</text></g>`;
    else if (o.labels && it.label && (it.kind === 'person' || it.kind === 'furniture')) out += `<text x="${n(X)}" y="${n(Y + (it.kind === 'person' ? 0.48 : it.h / 2) * s + (it.kind === 'person' ? 0 : 16))}" text-anchor="middle" font-size="12" font-weight="700" fill="${it.kind === 'person' ? o.ink : o.mute}" font-family="sans-serif">${esc(it.label)}</text>`;
  }
  return out;
}

export function arrowSvg(it: PlanItem, px: (x: number) => number, py: (y: number) => number, color = '#3b6fd8'): string {
  const pts = (it.props.points ?? [[0, 0], [1.5, -0.8]]).map(([a, b]) => [px(it.x + a), py(it.y + b)]);
  if (pts.length < 2) return '';
  const d = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${n(a)} ${n(b)}`).join('');
  const [ex, ey] = pts[pts.length - 1], [fx, fy] = pts[pts.length - 2];
  const ang = Math.atan2(ey - fy, ex - fx), L = 11;
  const col = it.color || color;
  return `<g><path d="${d}" fill="none" stroke="${col}" stroke-width="2.2" stroke-dasharray="${it.props.dashed ? '7 6' : ''}" stroke-linecap="round"/><path d="M${n(ex)} ${n(ey)}L${n(ex - L * Math.cos(ang - 0.45))} ${n(ey - L * Math.sin(ang - 0.45))}L${n(ex - L * Math.cos(ang + 0.45))} ${n(ey - L * Math.sin(ang + 0.45))}Z" fill="${col}"/></g>`;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
