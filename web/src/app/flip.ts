/**
 * FLIP (ported from the prototype): capture card rects before a change, then animate each
 * [data-flip] element from its old rect to its new one. Update 3 (§5.2): reordering slides the
 * cards to their places in 220 ms and the placed card settles with a small pulse; with «حركة
 * أقل» the cards just appear in place.
 */
import { reducedMotion, settle } from './motion';

let settleKey: string | null = null;
/** The card the next FLIP should settle (the one just dropped). */
export function settleNext(flipKey: string) {
  settleKey = flipKey;
}
type Rects = Record<string, DOMRect>;

export function capture(layer: string): Rects {
  const el = document.querySelector(`[data-layer="${layer}"]`);
  const m: Rects = {};
  if (!el) return m;
  el.querySelectorAll<HTMLElement>('[data-flip]').forEach((n) => {
    m[n.getAttribute('data-flip')!] = n.getBoundingClientRect();
  });
  return m;
}

/**
 * `scale`: zoom of the container the elements live in (board world), so offsets stay in screen px.
 * Reads all rects first, then writes all transforms: one layout pass for hundreds of cards.
 */
export function playFlip(layer: string, rects: Rects, scale = 1, ms = 220) {
  const el = document.querySelector(`[data-layer="${layer}"]`);
  const key = settleKey;
  settleKey = null;
  if (!el || reducedMotion()) return;
  const moves: { n: HTMLElement; t: string }[] = [];
  el.querySelectorAll<HTMLElement>('[data-flip]').forEach((n) => {
    const f = rects[n.getAttribute('data-flip')!];
    if (!f || !f.width) return;
    const r = n.getBoundingClientRect();
    if (!r.width) return;
    const dx = (f.left - r.left) / scale, dy = (f.top - r.top) / scale, sx = f.width / r.width, sy = f.height / r.height;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01) return;
    moves.push({ n, t: `translate(${dx}px,${dy}px) scale(${sx},${sy})` });
  });
  for (const { n, t } of moves) {
    n.style.transition = 'none';
    n.style.transformOrigin = '0 0';
    n.style.transform = t;
    n.style.zIndex = '30';
  }
  void (el as HTMLElement).offsetHeight; // one reflow
  for (const { n } of moves) {
    n.style.transition = `transform ${ms}ms var(--ease-standard)`;
    n.style.transform = '';
  }
  setTimeout(() => {
    for (const { n } of moves) {
      n.style.transition = '';
      n.style.zIndex = '';
      n.style.transformOrigin = '';
    }
    if (key) settle(el.querySelector(`[data-flip="${CSS.escape(key)}"]`));
  }, ms + 20);
}

/** Runs the FLIP after React has committed the new layout (next frame, before paint). */
export function playFlipLater(layer: string, rects: Rects) {
  requestAnimationFrame(() => playFlip(layer, rects));
}
