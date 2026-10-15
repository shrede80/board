/** Helpers ported from the prototype (sb-core.js `util`). */

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function mmss(s: number | null | undefined): string {
  const v = Math.max(0, Math.round(Number(s) || 0));
  return pad2(Math.floor(v / 60)) + ':' + pad2(v % 60);
}

export function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

/** Readable text colour on a mood swatch. */
export function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fdfcfa';
  const n = parseInt(m[1], 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#141210' : '#fdfcfa';
}

export interface Img {
  /** id in the images table */
  imageId: string;
  /** item_images row id (for removal/reorder); absent for inbox/cover-only images */
  linkId?: string;
  placeholder?: { x: number; y: number; v: number } | null;
  /** local blob URL while uploading */
  localUrl?: string;
  error?: boolean;
  uploading?: boolean;
}

export const imageUrl = (id: string, thumb = true) => `/api/images/${encodeURIComponent(id)}${thumb ? '/thumb' : ''}`;

/**
 * Background for a frame: the photo, or — without a photo — the prototype's
 * mood-tinted gradient (SPEC §4: cards without an image show the gradient frame).
 */
export function frameBg(img: Img | null | undefined, hex: string, full = false): string {
  if (!img) return '#1c1916';
  if (img.localUrl) return `center / cover no-repeat url("${img.localUrl}")`;
  if (!img.placeholder) return `center / cover no-repeat url("${imageUrl(img.imageId, !full)}"), #1c1916`;
  const f = img.placeholder;
  return `radial-gradient(85% 75% at ${f.x}% ${f.y}%, ${hex}d9 0%, ${hex}40 40%, transparent 72%), radial-gradient(45% 35% at ${100 - f.x}% ${85 - f.y * 0.4}%, rgba(253,252,250,.10), transparent 70%), linear-gradient(${150 + (f.v || 0)}deg, #2b2722 0%, #0e0d0b 100%)`;
}

const DAY = 864e5;
export function daysLeft(ms: number): number {
  return Math.max(0, 30 - Math.floor((Date.now() - ms) / DAY));
}

export function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

export function download(name: string, data: Blob | string, type = 'application/json') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

/** Arabic count words used in the prototype: «6 مشاهد», «1 مشهد». */
export const scenesWord = (n: number) => (n === 1 ? 'مشهد' : 'مشاهد');

export function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}
