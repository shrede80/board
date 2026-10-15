import { allShots } from '../data/project';
import { getState, project, setState } from './state';

/** Presentation mode (client view): ported from the prototype. */
let timer: ReturnType<typeof setTimeout> | null = null;

export function openPresent(i = 0) {
  setState({ present: { open: true, i, playing: false, tech: false, fill: 0 }, modal: null, menu: false });
}

export function closePresent() {
  if (timer) clearTimeout(timer);
  setState((s) => ({ present: { ...s.present, open: false, playing: false } }));
}

export function presGo(i: number) {
  const p = project();
  const n = p ? allShots(p).length : 0;
  const j = Math.max(0, Math.min(n - 1, i));
  setState((s) => ({ present: { ...s.present, i: j, fill: 0 } }));
  schedule();
}

export function presToggle() {
  setState((s) => ({ present: { ...s.present, playing: !s.present.playing } }));
  schedule();
}

export function toggleTech() {
  setState((s) => ({ present: { ...s.present, tech: !s.present.tech } }));
}

function schedule() {
  if (timer) clearTimeout(timer);
  const pr = getState().present;
  const p = project();
  if (!pr.open || !pr.playing || !p) return;
  const list = allShots(p);
  const it = list[pr.i];
  if (!it) return;
  setState((s) => ({ present: { ...s.present, fill: 0 } }));
  requestAnimationFrame(() => requestAnimationFrame(() => setState((s) => ({ present: { ...s.present, fill: 1 } }))));
  timer = setTimeout(() => {
    const s = getState().present;
    if (s.i < list.length - 1) {
      setState({ present: { ...s, i: s.i + 1 } });
      schedule();
    } else setState({ present: { ...s, playing: false, fill: 0 } });
  }, (Number(it.sh.durationS) || 3) * 1000);
}
