/**
 * FLIP animation between the board and the storyboard (ported from the prototype):
 * capture card rects before a change, then animate each [data-flip] element from its old
 * rect to its new one.
 */
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

/** `scale`: zoom of the container the elements live in (board world), so offsets stay in screen px. */
export function playFlip(layer: string, rects: Rects, scale = 1) {
  const el = document.querySelector(`[data-layer="${layer}"]`);
  if (!el) return;
  el.querySelectorAll<HTMLElement>('[data-flip]').forEach((n) => {
    const f = rects[n.getAttribute('data-flip')!];
    const r = n.getBoundingClientRect();
    if (!f || !r.width || !f.width) return;
    const dx = (f.left - r.left) / scale, dy = (f.top - r.top) / scale, sx = f.width / r.width, sy = f.height / r.height;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01) return;
    n.style.transition = 'none';
    n.style.transformOrigin = '0 0';
    n.style.transform = `translate(${dx}px,${dy}px) scale(${sx},${sy})`;
    n.style.zIndex = '30';
    n.getBoundingClientRect();
    n.style.transition = 'transform 600ms var(--ease-standard)';
    n.style.transform = '';
    setTimeout(() => {
      n.style.transition = '';
      n.style.zIndex = '';
      n.style.transformOrigin = '';
    }, 650);
  });
}

/** Runs the FLIP after React has committed the new layout (next frame, before paint). */
export function playFlipLater(layer: string, rects: Rects) {
  requestAnimationFrame(() => playFlip(layer, rects));
}
