import { pref } from './prefs';

/**
 * Motion (UPDATE-3 §5): calm and varied, and «حركة أقل» from the system or from the app's own
 * setting (prefs 'motion', synced). With less motion every move becomes a fade ≤ 120 ms and the
 * two signature moments are skipped. CSS follows <html data-motion="less">.
 */
export interface MotionPref {
  less: boolean;
}

const systemLess = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function reducedMotion(): boolean {
  return systemLess() || !!pref<MotionPref>('motion')?.less;
}

/** Keeps <html data-motion> in step with the setting (called on every data change). */
export function applyMotion() {
  const v = reducedMotion() ? 'less' : 'full';
  if (document.documentElement.dataset.motion !== v) document.documentElement.dataset.motion = v;
}

/** Signature moments play once per project opening (UPDATE-3 §5.3). */
const played = new Set<string>();
export function firstTime(key: string): boolean {
  if (played.has(key)) return false;
  played.add(key);
  return true;
}
export function resetSignature(prefix: string) {
  for (const k of [...played]) if (k.startsWith(prefix)) played.delete(k);
}

// ---------- the catalogue (UPDATE-3 §5.2) ----------

export const EASE_IN = 'cubic-bezier(.2,0,0,1)';
export const EASE_OUT = 'cubic-bezier(.4,0,1,1)';
export const EASE_STD = 'cubic-bezier(.4,0,.2,1)';

/** Web Animations with the «حركة أقل» rule: every move becomes a short fade (≤ 120 ms). */
export function play(el: Element | null | undefined, frames: Keyframe[], o: KeyframeAnimationOptions): Animation | null {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return null;
  if (reducedMotion()) {
    const from = frames[0]?.opacity, to = frames[frames.length - 1]?.opacity;
    if (from === undefined && to === undefined) return null;
    return (el as HTMLElement).animate([{ opacity: from ?? 1 }, { opacity: to ?? 1 }], { duration: Math.min(120, Number(o.duration) || 120), easing: 'linear' });
  }
  return (el as HTMLElement).animate(frames, o);
}

/** Board ↔ storyboard: the new view slides 24px in from its tab's side and appears (240 ms); the old one fades (140 ms). */
export function switchViews(from: string, to: string) {
  const old = document.querySelector(`[data-layer="${from}"]`);
  const nu = document.querySelector(`[data-layer="${to}"]`);
  // the storyboard tab sits left of the board tab (RTL): it comes in from the left
  const dx = to === 'storyboard' ? -24 : 24;
  play(old, [{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: EASE_OUT });
  play(nu, [{ opacity: 0, transform: `translateX(${dx}px)` }, { opacity: 1, transform: 'none' }], { duration: 240, easing: EASE_IN });
}

/** Cards coming in when a project opens: rise 8px and appear, 30 ms apart, the first 12 only. */
export function staggerIn(els: Element[]) {
  els.slice(0, 12).forEach((el, i) => play(el, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, delay: i * 30, easing: EASE_IN, fill: 'backwards' }));
}

/** A new item made here (never one that arrives from another device): from 96% with a gold ring. */
export function added(el: Element | null) {
  play(el, [{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: EASE_IN });
  if (!reducedMotion()) play(el, [{ boxShadow: '0 0 0 0 rgba(210,160,106,.9)' }, { boxShadow: '0 0 0 8px rgba(210,160,106,0)' }], { duration: 600, easing: EASE_IN });
}

/** Elements of these ids, once React has drawn them. */
export function afterPaint(f: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(f));
}
export function elsOf(ids: string[]): Element[] {
  return ids.flatMap((id) => [...document.querySelectorAll(`[data-shot-id="${CSS.escape(id)}"], [data-item-id="${CSS.escape(id)}"], [data-row="${CSS.escape(id)}"], [data-m-id="${CSS.escape(id)}"]`)]);
}
export function animateAdded(ids: string[]) {
  afterPaint(() => elsOf(ids).forEach(added));
}

/**
 * Deleting: a copy of the element folds away (160 ms) while the data changes at once, so nothing
 * waits on the animation; the gap then closes by FLIP (200 ms).
 */
export function ghostOut(el: Element | null) {
  if (!el || reducedMotion()) return;
  const r = el.getBoundingClientRect();
  if (!r.width) return;
  const g = el.cloneNode(true) as HTMLElement;
  // a ghost is not a real card: no test ids, no data hooks
  for (const n of [g, ...g.querySelectorAll<HTMLElement>('*')]) for (const a of [...n.attributes]) if (a.name.startsWith('data-') || a.name === 'id') n.removeAttribute(a.name);
  // board items live in a zoomed world: keep their size on screen
  const w = (el as HTMLElement).offsetWidth || r.width, h = (el as HTMLElement).offsetHeight || r.height;
  const k = r.width / w;
  Object.assign(g.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${w}px`, height: `${h}px`, margin: '0', zIndex: '900', pointerEvents: 'none', transformOrigin: '0 0' });
  document.body.appendChild(g);
  const a = g.animate([{ opacity: 1, transform: `scale(${k})` }, { opacity: 0, transform: `translate(${w * k * 0.05}px, ${h * k * 0.05}px) scale(${k * 0.9})` }], { duration: 160, easing: EASE_OUT, fill: 'forwards' });
  a.onfinish = () => g.remove();
  setTimeout(() => g.remove(), 400);
}

/** The placed card settles with a small pulse after a reorder. */
export function settle(el: Element | null) {
  play(el, [{ transform: 'scale(1.03)' }, { transform: 'none' }], { duration: 220, easing: EASE_IN });
}

/** «تصوّرت»: the check draws itself (320 ms) and the card dims to 72% for a moment. */
export function shotDone(card: Element | null) {
  if (!card) return;
  // drawn over the card in its own layer (never inside React's DOM)
  const dot = card.querySelector('[data-testid=shot-status], [data-testid=m-status]') ?? card;
  const r = dot.getBoundingClientRect();
  if (r.width && !reducedMotion()) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('aria-hidden', 'true');
    Object.assign(svg.style, { position: 'fixed', left: `${r.left + r.width / 2 - 9}px`, top: `${r.top + r.height / 2 - 9}px`, zIndex: '901', pointerEvents: 'none' });
    svg.innerHTML = '<circle cx="10" cy="10" r="9" fill="var(--color-accent)"/><path d="M5.5 10.5l3 3 6-6.5" fill="none" stroke="#141210" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="14" stroke-dashoffset="14"/>';
    document.body.appendChild(svg);
    svg.querySelector('path')!.animate([{ strokeDashoffset: 14 }, { strokeDashoffset: 0 }], { duration: 320, easing: EASE_IN, fill: 'forwards' });
    setTimeout(() => svg.remove(), 1500);
  }
  play(card, [{ opacity: 1 }, { opacity: 0.72, offset: 0.3 }, { opacity: 0.72, offset: 0.8 }, { opacity: 1 }], { duration: 1400, easing: 'linear' });
}

/** Signature: the photos «develop» from a warm blur on the first load of a project (500 ms). */
export function develop(els: Element[]) {
  if (reducedMotion()) return;
  els.slice(0, 40).forEach((el) => (el as HTMLElement).animate([{ filter: 'blur(10px) sepia(.8) brightness(1.25)', opacity: 0.35 }, { filter: 'none', opacity: 1 }], { duration: 500, easing: EASE_IN }));
}

/** Signature: the film rhythm bar fills from the right, segment by segment (260 ms, 85 ms apart). */
export function fillRhythm(segs: Element[]) {
  if (reducedMotion()) return;
  segs.forEach((el, i) => (el as HTMLElement).animate([{ transform: 'scaleX(0)', opacity: 0.3 }, { transform: 'none', opacity: 1 }], { duration: 260, delay: i * 85, easing: EASE_IN, fill: 'backwards' }));
}

/** What a batch of local ops looks like on screen: new items pop in, deleted ones fold away. */
export function opsMotion(ops: { op: string; entity: string; id: string }[], cardOfNote: (noteId: string) => string | null) {
  const shown = new Set(['shots', 'scenes', 'boardCards']);
  const made = ops.filter((o) => o.op === 'create' && shown.has(o.entity)).map((o) => o.id);
  for (const o of ops) {
    if (o.op !== 'delete') continue;
    const id = o.entity === 'notes' ? cardOfNote(o.id) : shown.has(o.entity) ? o.id : null;
    if (id) for (const el of elsOf([id])) ghostOut(el);
  }
  if (made.length) animateAdded(made);
  const done = ops.filter((o) => o.op === 'update' && o.entity === 'shots' && (o as { fields?: Record<string, unknown> }).fields?.status === 'shot').map((o) => o.id);
  if (done.length) afterPaint(() => elsOf(done).forEach(shotDone));
}
