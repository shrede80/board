import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { nudgeStep, type NudgeDir, type NudgeMode } from '../../../shared/board';
import {
  arrowFrom, arrowMids, arrowPath, arrowPoints, arrowSvg, beamOf, insertPoint, removePoint, snapPoint, camSpec, cctColor, focalOf, footprint, frameWidth, FURNITURE, hfov, itemBody, lightColor, lightSpec, PERSON_COLORS, rotFromPoint, snapM, wedge,
  type PlanItem, type PlanProps,
  freeSpot,
} from '../../../shared/plan';
import { redo, undo } from '../app/actions';
import { registerCommand } from '../app/commands';
import { isMac } from '../app/keyLabels';
import { play, reducedMotion, EASE_IN } from '../app/motion';
import {
  addItem, closePlan, copyPlanFrom, deleteItems, duplicateItems, eqShort, exportPlanPng, newArrow, newCamera, newFurniture, newLight, newPerson, newText, newZone, planCameras,
  planLights, planOf, restack, sceneCharacters, scenesWithPlan, updateItems, type NewItem,
} from '../app/plan';
import { engine, getState, openMenu, useApp, useProject } from '../app/state';
import { Button, Icon } from '../ds/ds';
import { useIsMobile } from '../lib/device';
import { pad2 } from '../lib/util';
import { avatar } from './Library';

/**
 * مخطط التصوير (UPDATE-3 §6, mockups/plan.html): full screen on the laptop and the phone (ق3).
 * Items live in a world group (100 units = 1 m) under one transform, so panning never redraws
 * them; while dragging only the moved items change (memo). Saved item by item when a drag ends.
 */

const U = 100; // world units per metre
type View = { s: number; ox: number; oy: number };
type Drag =
  | { mode: 'pan'; sx: number; sy: number; o: View }
  | { mode: 'move'; ids: string[]; start: Record<string, { x: number; y: number }>; wx: number; wy: number; moved: boolean; px: number; py: number; pointer: string }
  | { mode: 'rot' | 'range' | 'size'; id: string }
  /** one point of an arrow (a mid-point pulled out is a new point): one undo step per drag */
  | { mode: 'pt'; id: string; i: number; abs: [number, number][]; moved: boolean; px: number; py: number; pointer: string; added: boolean }
  | { mode: 'marquee'; wx: number; wy: number; base: string[] }
  | { mode: 'pinch'; d0: number; a0: number; c: [number, number]; o: View; rotId: string | null; rot0: number };

const PTABS = ['كاميرات', 'إضاءة', 'أشخاص', 'ديكور', 'رسم'] as const;
type PTab = (typeof PTABS)[number];

interface PalEntry { name: string; sub: string; make: (items: PlanItem[]) => NewItem; thumb: NewItem }

/** Live API for the plan's shortcut commands (C, L, P, R, Shift+R, Shift+1). */
const api: { add?: (k: 'camera' | 'light' | 'person') => void; rotate?: (d: number) => void; fit?: () => void } = {};
registerCommand('planCamera', () => api.add?.('camera'));
registerCommand('planLight', () => api.add?.('light'));
registerCommand('planPerson', () => api.add?.('person'));
registerCommand('planRotate', () => api.rotate?.(15));
registerCommand('planRotateBack', () => api.rotate?.(-15));
registerCommand('planFit', () => api.fit?.());

export function PlanScreen() {
  const sceneId = useApp((s) => s.plan)!;
  const dv = useApp((s) => s.dataVersion);
  const p = useProject();
  const mobile = useIsMobile();
  const offline = useApp((s) => s.offline);
  const canUndo = useApp((s) => s.canUndo), canRedo = useApp((s) => s.canRedo);
  const si = p ? p.scenes.findIndex((s) => s.id === sceneId) : -1;
  const sc = si >= 0 ? p!.scenes[si] : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stored = useMemo(() => (sceneId ? planOf(sceneId) : []), [sceneId, dv]);
  const [over, setOverState] = useState<Record<string, Partial<PlanItem>>>({});
  // the drop reads the latest drag position even before React has drawn it
  const overRef = useRef<Record<string, Partial<PlanItem>>>({});
  const setOver = (o: Record<string, Partial<PlanItem>>) => {
    overRef.current = o;
    setOverState(o);
  };
  const items = useMemo(() => stored.map((it) => (over[it.id] ? { ...it, ...over[it.id], props: { ...it.props, ...(over[it.id].props ?? {}) } } : it)), [stored, over]);
  const [view, setView] = useState<View>({ s: mobile ? 30 : 58, ox: -1, oy: -1 });
  const [sel, setSel] = useState<string[]>([]);
  const [snap, setSnap] = useState(true);
  const [ptab, setPtab] = useState<PTab>('كاميرات');
  const [sheet, setSheet] = useState<null | 'palette' | 'props' | 'more'>(null);
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const [copyOpen, setCopyOpen] = useState(false);
  const [marq, setMarq] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const ptrs = useRef(new Map<number, [number, number]>());
  const pointer = useRef<[number, number] | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const selRef = useRef(sel);
  selRef.current = sel;

  // a scene that disappears (deleted elsewhere) closes its plan
  useEffect(() => {
    if (p && !sc) closePlan();
  }, [p, sc]);

  const size = () => ({ W: wrap.current?.clientWidth ?? 800, H: wrap.current?.clientHeight ?? 600 });
  // on the phone the bottom bar (and the sheet under it) cover the plan: fit into what stays visible
  const visible = () => {
    const { W, H } = size();
    const root = wrap.current?.closest('.pl-root') as HTMLElement | null;
    const bar = root?.querySelector('.pl-mbar') as HTMLElement | null;
    if (!mobile || !root || !bar || !wrap.current) return { W, H };
    // where the bar ends up (it slides with the sheet), not where it is mid-slide
    const rr = root.getBoundingClientRect(), top = wrap.current.getBoundingClientRect().top;
    const barTop = rr.bottom - (sheetRef.current ? rr.height * 0.55 + 10 : 16) - bar.offsetHeight;
    return { W, H: Math.max(120, Math.min(H, barTop - top - 8)) };
  };
  const toM = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - r.left) / v.s + v.ox, y: (cy - r.top) / v.s + v.oy };
  };
  const center = () => {
    const { W, H } = size(), v = viewRef.current;
    return { x: v.ox + W / 2 / v.s, y: v.oy + H / 2 / v.s };
  };
  const addPoint = () => {
    const r = svgRef.current?.getBoundingClientRect();
    if (pointer.current && r && pointer.current[0] > r.left && pointer.current[0] < r.right && pointer.current[1] > r.top && pointer.current[1] < r.bottom) return toM(pointer.current[0], pointer.current[1]);
    return center();
  };

  // ---------- fit (300 ms, §6.2) ----------
  const fit = (animate = true) => {
    const list = itemsRef.current;
    const { W, H } = visible();
    let a = 0, b = 0, c = 6, d = 4;
    if (list.length) {
      a = b = Infinity;
      c = d = -Infinity;
      for (const it of list) {
        const f = footprint(it);
        const reach = it.kind === 'camera' || it.kind === 'light' ? (Number(it.props.range) || 3) * 0.7 : 0;
        a = Math.min(a, f.x - reach); b = Math.min(b, f.y - reach); c = Math.max(c, f.x + f.w + reach); d = Math.max(d, f.y + f.h + reach);
      }
    }
    a -= 0.6; b -= 0.6; c += 0.6; d += 0.6;
    const s1 = Math.max(10, Math.min(160, Math.min(W / (c - a), H / (d - b)) * 0.94));
    glide({ s: s1, ox: (a + c) / 2 - W / 2 / s1, oy: (b + d) / 2 - H / 2 / s1 }, animate);
  };
  const glide = (to: View, animate = true) => {
    if (!animate || reducedMotion()) return setView(to);
    const from = viewRef.current, t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 300), e = 1 - (1 - k) ** 3;
      setView({ s: from.s + (to.s - from.s) * e, ox: from.ox + (to.ox - from.ox) * e, oy: from.oy + (to.oy - from.oy) * e });
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  // the props sheet opens over the plan: bring the selected item up into the visible part (§6.6)
  useEffect(() => {
    if (!mobile || !sheet || selRef.current.length !== 1) return;
    const id = selRef.current[0];
    const raf = requestAnimationFrame(() => {
      const it = itemsRef.current.find((i) => i.id === id);
      if (!it) return;
      // the whole item (an arrow: all its points) in view, else centred
      const v = viewRef.current, { W, H } = visible(), f = footprint(it);
      const x1 = (f.x - v.ox) * v.s, x2 = (f.x + f.w - v.ox) * v.s, y1 = (f.y - v.oy) * v.s, y2 = (f.y + f.h - v.oy) * v.s;
      if (y1 > 40 && y2 < H - 40 && x1 > 20 && x2 < W - 20) return;
      glide({ s: v.s, ox: f.x + f.w / 2 - W / 2 / v.s, oy: f.y + f.h / 2 - H / 2 / v.s });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, sel[0], mobile]);
  useLayoutEffect(() => {
    fit(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId, mobile]);

  // ---------- adding ----------
  const add = (make: NewItem, at = center()) => {
    if (!sc) return;
    // a spot that's taken: the new item steps 50 cm aside (never on top of another)
    const id = addItem(sc.id, make, freeSpot(itemsRef.current, { x: snapM(at.x, snap), y: snapM(at.y, snap) }));
    if (!id) return;
    setSel([id]);
    if (mobile) setSheet('props');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      // the inner drawing scales around the item's centre (its local origin)
      const g = svgRef.current?.querySelector(`[data-pid="${id}"] > g`);
      play(g, [{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: EASE_IN });
    }));
  };
  const cams = planCameras(), lights = planLights();
  const chars = sc ? sceneCharacters(sc.id) : [];
  const PAL: Record<PTab, PalEntry[]> = {
    'كاميرات': cams.map((c) => ({ name: eqShort(c.id), sub: c.icon === 'drone' ? 'درون' : c.icon === 'phone' ? 'جوال' : 'كاميرا', make: (l) => newCamera(c.id, l), thumb: newCamera(c.id, []) })),
    'إضاءة': lights.map((l) => ({ name: eqShort(l.id).replace(/^Neewer |^Light Stick /, ''), sub: lightSpec(l.id).bounce ? 'ارتداد' : 'ضوء', make: () => newLight(l.id), thumb: newLight(l.id) })),
    'أشخاص': [
      ...chars.map((c) => ({ name: c.name as string, sub: 'من شخصيات المشهد', make: () => newPerson(c.name as string, avatar(c as never).bg, c.id), thumb: newPerson(c.name as string, avatar(c as never).bg) })),
      { name: 'شخص', sub: 'اسم حر', make: () => newPerson('شخص', PERSON_COLORS[5]), thumb: newPerson('شخص', PERSON_COLORS[5]) },
    ],
    'ديكور': FURNITURE.map(([t, name, w, h]) => ({ name, sub: `${w}×${h} م`, make: () => newFurniture(t), thumb: newFurniture(t) })),
    'رسم': [
      { name: 'منطقة', sub: 'مثل الجمهور', make: newZone, thumb: newZone() },
      { name: 'سهم حركة', sub: 'للكاميرا (متقطع)', make: () => newArrow(true), thumb: newArrow(true) },
      { name: 'سهم حركة', sub: 'للشخص (متصل)', make: () => newArrow(false), thumb: newArrow(false) },
      { name: 'نص', sub: 'ملاحظة على المخطط', make: newText, thumb: newText() },
    ],
  };
  api.add = (k) => {
    if (offline) return;
    const at = addPoint();
    if (k === 'camera') add(newCamera(cams.find((c) => c.id === 'cam-zve10')?.id ?? cams[0]?.id ?? null, itemsRef.current), at);
    if (k === 'light') add(newLight(lights.find((l) => l.id === 'lt-hs60b')?.id ?? lights[0]?.id ?? null), at);
    if (k === 'person') {
      const onPlan = new Set(itemsRef.current.filter((i) => i.kind === 'person').map((i) => i.refId));
      const c = chars.find((x) => !onPlan.has(x.id));
      add(c ? newPerson(c.name as string, avatar(c as never).bg, c.id) : newPerson('شخص', PERSON_COLORS[5]), at);
    }
  };
  api.rotate = (dlt) => {
    const ch = selRef.current.map((id) => itemsRef.current.find((i) => i.id === id)).filter((i): i is PlanItem => !!i && i.kind !== 'arrow');
    updateItems(ch.map((i) => ({ id: i.id, fields: { rot: (((i.rot + dlt) % 360) + 360) % 360 } })), 'تدوير', `plan-rot:${ch.map((i) => i.id).join(',')}`);
  };
  api.fit = () => fit();
  useEffect(() => () => {
    api.add = api.rotate = api.fit = undefined;
  }, []);

  // ---------- keys: Delete, Ctrl D, arrows (5 cm, Shift = next stop, Alt = jump), Esc ----------
  const [hud, setHud] = useState<{ t: string; n: number } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName ?? '') || (e.target as HTMLElement)?.isContentEditable;
      if (typing) return;
      const cur = selRef.current;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape') {
        if (getState().popMenu) return; // the menu closes first (app keys)
        if (copyOpen) return (e.stopImmediatePropagation(), setCopyOpen(false));
        if (sheet) return (e.stopImmediatePropagation(), setSheet(null));
        if (cur.length) return (e.stopImmediatePropagation(), setSel([]));
        e.stopImmediatePropagation();
        return closePlan();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && cur.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        deleteItems(cur);
        return setSel([]);
      }
      if (mod && e.code === 'KeyD' && cur.length && sc) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return setSel(duplicateItems(sc.id, cur));
      }
      if (mod && e.code === 'KeyA') {
        e.preventDefault();
        e.stopImmediatePropagation();
        return setSel(itemsRef.current.map((i) => i.id));
      }
      const dirs: Record<string, NudgeDir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      if (dirs[e.key] && cur.length && !mod) {
        e.preventDefault();
        e.stopImmediatePropagation();
        nudge(dirs[e.key], e.altKey ? 'jump' : e.shiftKey ? 'next' : 'step');
        return;
      }
      // the plan owns the board's fixed keys while it is open
      if (mod && ['KeyC', 'KeyX', 'KeyV'].includes(e.code)) e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  const nudge = (dir: NudgeDir, mode: NudgeMode) => {
    const list = itemsRef.current, cur = selRef.current;
    const mv = list.filter((i) => cur.includes(i.id));
    if (!mv.length) return;
    const fps = mv.map(footprint);
    const x1 = Math.min(...fps.map((f) => f.x)), y1 = Math.min(...fps.map((f) => f.y));
    const group = { id: 'g', x: x1, y: y1, w: Math.max(...fps.map((f) => f.x + f.w)) - x1, h: Math.max(...fps.map((f) => f.y + f.h)) - y1 };
    const others = list.filter((i) => !cur.includes(i.id)).map((i) => ({ id: i.id, ...footprint(i) }));
    const r = nudgeStep({ group, others, dir, mode, snap, step: 0.05, grid: 0.25, eps: 0.004, gridRef: 'center' });
    const keys = mode === 'next' ? [isMac() ? '⇧' : 'Shift'] : mode === 'jump' ? [isMac() ? '⌥' : 'Alt'] : [];
    const arrow = { left: '←', right: '→', up: '↑', down: '↓' }[dir];
    const say = (t: string) => setHud({ t: [...keys, arrow].join(' + ') + ' · ' + t, n: Date.now() });
    if (r.stop === 'off') return say('المغناطيس طافي');
    if (r.stop === 'none') return say('ما فيه شي تتحاذى معه بهالاتجاه');
    updateItems(mv.map((i) => ({ id: i.id, fields: { x: round2(i.x + r.dx), y: round2(i.y + r.dy) } })), 'تحريك', `plan-nudge:${cur.join(',')}`);
    const name = r.box ? list.find((i) => i.id === r.box!.id)?.label : '';
    if (r.stop === 'grid') say('وقف عند خط الشبكة');
    else if (mode !== 'step' || r.guides.length) say(name ? `${mode === 'jump' ? 'قفز لخط المحاذاة' : mode === 'next' ? 'وقف عند خط المحاذاة' : 'تحاذى'} مع «${name}»` : 'تحاذى');
  };
  useEffect(() => {
    if (!hud) return;
    const t = setTimeout(() => setHud(null), 1600);
    return () => clearTimeout(t);
  }, [hud]);

  // ---------- pointer ----------
  const endPress = () => {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  };
  const onDown = (e: React.PointerEvent) => {
    if (offline && e.pointerType !== 'mouse') return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    // the first finger of a new touch starts a fresh gesture (a lost pointerup never leaves a ghost finger)
    if (e.isPrimary) ptrs.current.clear();
    ptrs.current.set(e.pointerId, [e.clientX, e.clientY]);
    const v = viewRef.current;
    if (ptrs.current.size === 2) {
      endPress();
      const [a, b] = [...ptrs.current.values()];
      const one = selRef.current.length === 1 ? itemsRef.current.find((i) => i.id === selRef.current[0]) : null;
      // two fingers on the selected item turn it; on the empty plan they zoom and pan (§6.6)
      const onItem = drag.current?.mode === 'move' && one && drag.current.ids.includes(one.id);
      if (drag.current?.mode === 'move' && drag.current.moved) commitMove();
      setOver({});
      drag.current = { mode: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]), a0: Math.atan2(b[1] - a[1], b[0] - a[0]), c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], o: { ...v }, rotId: onItem && one ? one.id : null, rot0: one?.rot ?? 0 };
      return;
    }
    const t = e.target as Element;
    const h = t.closest('[data-h]') as HTMLElement | null;
    const g = t.closest('[data-pid]') as HTMLElement | null;
    const w = toM(e.clientX, e.clientY);
    if (h && selRef.current.length === 1 && (h.dataset.h === 'pt' || h.dataset.h === 'mid')) {
      e.stopPropagation();
      const it = itemsRef.current.find((x) => x.id === selRef.current[0]);
      if (!it || it.kind !== 'arrow') return;
      const k = Number(h.dataset.i);
      let abs = arrowPoints(it), i = k;
      if (h.dataset.h === 'mid') {
        abs = insertPoint(abs, k, arrowMids(abs, !!it.props.curve)[k]);
        i = k + 1;
      }
      drag.current = { mode: 'pt', id: it.id, i, abs, moved: false, px: e.clientX, py: e.clientY, pointer: e.pointerType, added: h.dataset.h === 'mid' };
      if (e.pointerType === 'touch' && h.dataset.h === 'pt') {
        // a long press on a point: «احذف النقطة»
        press.current = setTimeout(() => {
          press.current = null;
          if (drag.current?.mode === 'pt' && !drag.current.moved) {
            drag.current = null;
            pointMenu(it.id, k, e.clientX, e.clientY);
          }
        }, 550);
      }
      return;
    }
    if (h && selRef.current.length === 1) {
      e.stopPropagation();
      drag.current = { mode: h.dataset.h as 'rot' | 'range' | 'size', id: selRef.current[0] };
      return;
    }
    if (g) {
      const id = g.dataset.pid!;
      let next = selRef.current;
      if (e.shiftKey) next = next.includes(id) ? next.filter((x) => x !== id) : [...next, id];
      else if (!next.includes(id)) next = [id];
      setSel(next);
      const start: Record<string, { x: number; y: number }> = {};
      for (const it of itemsRef.current) if (next.includes(it.id)) start[it.id] = { x: it.x, y: it.y };
      drag.current = { mode: 'move', ids: next, start, wx: w.x, wy: w.y, moved: false, px: e.clientX, py: e.clientY, pointer: e.pointerType };
      if (e.pointerType === 'touch') {
        press.current = setTimeout(() => {
          press.current = null;
          if (drag.current?.mode === 'move' && !drag.current.moved) {
            drag.current = null;
            itemMenu(id, e.clientX, e.clientY);
          }
        }, 550);
      }
      return;
    }
    if (e.shiftKey && e.pointerType === 'mouse') {
      drag.current = { mode: 'marquee', wx: w.x, wy: w.y, base: selRef.current };
      return;
    }
    drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, o: { ...v } };
  };
  const onMove = (e: React.PointerEvent) => {
    pointer.current = [e.clientX, e.clientY];
    if (ptrs.current.has(e.pointerId)) ptrs.current.set(e.pointerId, [e.clientX, e.clientY]);
    const D = drag.current;
    if (!D) return;
    const v = viewRef.current;
    if (D.mode === 'pinch') {
      if (ptrs.current.size < 2) return;
      const [a, b] = [...ptrs.current.values()];
      if (D.rotId) {
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const rot = (((D.rot0 + ((ang - D.a0) * 180) / Math.PI) % 360) + 360) % 360;
        setOver({ [D.rotId]: { rot: e.altKey ? rot : Math.round(rot / 15) * 15 } });
        return;
      }
      const r = svgRef.current!.getBoundingClientRect();
      const s = Math.max(10, Math.min(160, D.o.s * (Math.hypot(a[0] - b[0], a[1] - b[1]) / D.d0)));
      const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
      const wx = (D.c[0] - r.left) / D.o.s + D.o.ox, wy = (D.c[1] - r.top) / D.o.s + D.o.oy;
      setView({ s, ox: wx - (cx - r.left) / s, oy: wy - (cy - r.top) / s });
      return;
    }
    if (D.mode === 'pan') {
      setView({ s: v.s, ox: D.o.ox - (e.clientX - D.sx) / v.s, oy: D.o.oy - (e.clientY - D.sy) / v.s });
      return;
    }
    const w = toM(e.clientX, e.clientY);
    if (D.mode === 'marquee') {
      const r = { x: Math.min(D.wx, w.x), y: Math.min(D.wy, w.y), w: Math.abs(w.x - D.wx), h: Math.abs(w.y - D.wy) };
      setMarq(r);
      const inside = itemsRef.current.filter((i) => { const f = footprint(i); return f.x < r.x + r.w && f.x + f.w > r.x && f.y < r.y + r.h && f.y + f.h > r.y; }).map((i) => i.id);
      setSel([...new Set([...D.base, ...inside])]);
      return;
    }
    if (D.mode === 'pt') {
      if (!D.moved && Math.hypot(e.clientX - D.px, e.clientY - D.py) < (D.pointer === 'touch' ? 8 : 3)) return;
      endPress();
      D.moved = true;
      // the grid and the lines of the arrow's other points and of the other items (Alt = free)
      const others = [...D.abs.filter((_, k) => k !== D.i), ...itemsRef.current.filter((x) => x.id !== D.id && x.kind !== 'arrow' && x.kind !== 'zone').map((x) => [x.x, x.y] as [number, number])];
      const abs = D.abs.map((q, k) => (k === D.i ? snapPoint([w.x, w.y], others, snap && !e.altKey) : q));
      const f = arrowFrom(abs);
      setOver({ [D.id]: { x: f.x, y: f.y, props: { points: f.points } } });
      return;
    }
    if (D.mode === 'move') {
      if (!D.moved && Math.hypot(e.clientX - D.px, e.clientY - D.py) < (D.pointer === 'touch' ? 8 : 3)) return;
      endPress();
      D.moved = true;
      const dx = w.x - D.wx, dy = w.y - D.wy;
      const o: Record<string, Partial<PlanItem>> = {};
      for (const id of D.ids) {
        const s0 = D.start[id];
        if (!s0) continue;
        o[id] = { x: snapM(s0.x + dx, snap && !e.altKey), y: snapM(s0.y + dy, snap && !e.altKey) };
      }
      setOver(o);
      return;
    }
    const it = itemsRef.current.find((i) => i.id === D.id);
    if (!it) return;
    if (D.mode === 'rot') setOver({ [it.id]: { rot: rotFromPoint(it.x, it.y, w.x, w.y, e.altKey) } });
    if (D.mode === 'range') setOver({ [it.id]: { props: { ...it.props, range: Math.max(it.kind === 'camera' ? 1 : 0.5, Math.min(15, Math.round(Math.hypot(w.x - it.x, w.y - it.y) * 10) / 10)) } } });
    if (D.mode === 'size') {
      const a = (-it.rot * Math.PI) / 180;
      const lx = (w.x - it.x) * Math.cos(a) - (w.y - it.y) * Math.sin(a), ly = (w.x - it.x) * Math.sin(a) + (w.y - it.y) * Math.cos(a);
      // the handle sits outside the corner (§3.2): take the gap off
      const gap = 10 / v.s;
      setOver({ [it.id]: { w: Math.max(0.2, snapM(Math.max(0, Math.abs(lx) - gap) * 2, snap && !e.altKey)), h: Math.max(0.1, snapM(Math.max(0, Math.abs(ly) - gap) * 2, snap && !e.altKey)) } });
    }
  };
  const commitMove = (D = drag.current) => {
    if (!D || D.mode !== 'move' || !D.moved) return;
    const o = overRef.current;
    const ch = D.ids.map((id) => ({ id, fields: { x: round2(o[id]?.x ?? D.start[id].x), y: round2(o[id]?.y ?? D.start[id].y) } })).filter((c) => c.fields.x !== D.start[c.id]?.x || c.fields.y !== D.start[c.id]?.y);
    updateItems(ch, 'تحريك');
  };
  const onUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    endPress();
    const D = drag.current;
    if (!D) return;
    if (D.mode === 'pinch') {
      if (ptrs.current.size === 0) {
        const o = overRef.current;
        if (D.rotId && o[D.rotId]?.rot !== undefined) updateItems([{ id: D.rotId, fields: { rot: o[D.rotId].rot! } }], 'تدوير');
        setOver({});
        drag.current = null;
      }
      return;
    }
    drag.current = null;
    if (D.mode === 'pan') {
      if (Math.hypot(e.clientX - D.sx, e.clientY - D.sy) < 4) {
        setSel([]);
        if (mobile) setSheet(null);
      }
      return;
    }
    if (D.mode === 'marquee') return setMarq(null);
    if (D.mode === 'pt') {
      const o = overRef.current[D.id];
      const it = stored.find((x) => x.id === D.id);
      if (D.moved && o && it) updateItems([{ id: D.id, fields: { x: o.x, y: o.y, props: { ...it.props, points: o.props!.points } } }], D.added ? 'انحناءة جديدة' : 'تحريك نقطة');
      setOver({});
      return;
    }
    if (D.mode === 'move') {
      if (D.moved) commitMove(D);
      else if (mobile && D.ids.length) setSheet('props');
      setOver({});
      return;
    }
    const o = overRef.current[D.id];
    if (o) {
      const it = stored.find((i) => i.id === D.id);
      if (D.mode === 'rot' && o.rot !== undefined) updateItems([{ id: D.id, fields: { rot: o.rot } }], 'تدوير');
      if (D.mode === 'range' && o.props && it) updateItems([{ id: D.id, fields: { props: { ...it.props, range: o.props.range } } }], 'المدى');
      if (D.mode === 'size' && o.w !== undefined) updateItems([{ id: D.id, fields: { w: o.w, h: o.h } }], 'المقاس');
    }
    setOver({});
  };
  const onWheel = (e: React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect(), v = viewRef.current;
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const wx = mx / v.s + v.ox, wy = my / v.s + v.oy;
    const s = Math.max(10, Math.min(160, v.s * Math.exp(-e.deltaY * 0.0022)));
    setView({ s, ox: wx - mx / s, oy: wy - my / s });
  };
  useEffect(() => {
    // the browser must not scroll or zoom the page while the plan is edited (§6.6)
    const el = wrap.current;
    if (!el) return;
    const stop = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, []);

  /** Double click / «احذف النقطة»: an arrow keeps at least two points. */
  const removeArrowPoint = (id: string, i: number) => {
    const it = itemsRef.current.find((x) => x.id === id);
    if (!it || it.kind !== 'arrow') return;
    const abs = arrowPoints(it);
    if (abs.length <= 2) return setHud({ t: 'السهم يحتاج نقطتين على الأقل', n: Date.now() });
    const f = arrowFrom(removePoint(abs, i));
    updateItems([{ id, fields: { x: f.x, y: f.y, props: { ...it.props, points: f.points } } }], 'حذف نقطة');
  };
  const pointMenu = (id: string, i: number, x: number, y: number) => {
    const it = itemsRef.current.find((q) => q.id === id);
    openMenu(x, y, [{ label: 'احذف النقطة', icon: 'trash', danger: true, disabled: (it?.props.points?.length ?? 0) <= 2, run: () => removeArrowPoint(id, i), testid: 'pm-delete-point' }], 'plan-point-menu');
  };
  const itemMenu = (id: string, x: number, y: number) => {
    if (!sc) return;
    setSel([id]);
    openMenu(x, y, [
      { label: 'تكرار', icon: 'repeat', run: () => setSel(duplicateItems(sc.id, [id])), testid: 'pm-dup' },
      { label: 'للأمام', icon: 'layers', run: () => restack(sc.id, id, true) },
      { label: 'للخلف', icon: 'layers', run: () => restack(sc.id, id, false) },
      'sep',
      { label: 'حذف', icon: 'trash', danger: true, run: () => (deleteItems([id]), setSel([])), testid: 'pm-delete' },
    ], 'plan-item-menu');
  };

  // panning changes only the world transform: the drawings themselves are kept as they are
  const k = view.s / U;
  // and while one item is dragged the other 199 keep their very same elements (React skips them)
  const els = useRef(new Map<string, { it: PlanItem; on: boolean; k: number; m: boolean; el: React.ReactElement }>());
  const world = useMemo(() => {
    const cache = els.current, seen = new Set<string>();
    const el = (beam: boolean, it: PlanItem) => {
      const key = (beam ? 'b:' : 'i:') + it.id, on = sel.includes(it.id);
      seen.add(key);
      const c = cache.get(key);
      if (c && c.it === it && c.on === on && c.k === k && c.m === mobile) return c.el;
      const e = beam ? <Beam key={key} it={it} on={on} k={k} mobile={mobile} /> : <Item key={key} it={it} on={on} k={k} />;
      cache.set(key, { it, on, k, m: mobile, el: e });
      return e;
    };
    const out = [
      ...items.filter((i) => i.kind === 'camera' || i.kind === 'light').map((it) => el(true, it)),
      ...items.filter((i) => i.kind === 'zone').map((it) => el(false, it)),
      ...items.filter((i) => i.kind !== 'zone').map((it) => el(false, it)),
    ];
    for (const key of cache.keys()) if (!seen.has(key)) cache.delete(key);
    return out;
  }, [items, sel, k, mobile]);

  if (!p || !sc) return null;
  const one = sel.length === 1 ? items.find((i) => i.id === sel[0]) ?? null : null;
  const worldT = `translate(${-view.ox * view.s} ${-view.oy * view.s}) scale(${k})`;
  const scaleM = view.s < 30 ? 2 : 1;
  const nCam = items.filter((i) => i.kind === 'camera').length, nLight = items.filter((i) => i.kind === 'light').length, nPerson = items.filter((i) => i.kind === 'person').length;
  const title = `مخطط المشهد ${pad2(si + 1)} · ${sc.name}`;

  const palette = (
    <div data-testid="plan-palette" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="pl-tabs">{PTABS.map((t) => <button key={t} className={t === ptab ? 'on' : ''} data-testid={`plan-tab-${t}`} onClick={() => setPtab(t)}>{t}</button>)}</div>
      <div className="pl-grid" style={mobile ? { gridTemplateColumns: 'repeat(3, 1fr)' } : undefined}>
        {PAL[ptab].map((e, i) => (
          <button key={i} className="pl-item" data-testid="plan-add" disabled={offline} draggable={!mobile}
            onDragStart={(ev) => { ev.dataTransfer.setData('text/plan-add', `${ptab}|${i}`); ev.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => { add(e.make(itemsRef.current)); if (mobile) setSheet('props'); }}>
            <Thumb it={e.thumb} />
            <span>{e.name}</span>
            <small>{e.sub}</small>
          </button>
        ))}
        {!PAL[ptab].length && <span style={{ gridColumn: '1 / -1', fontSize: 13, color: 'var(--color-text-muted)', padding: 8 }}>ما فيه شي من معداتك هنا.</span>}
      </div>
    </div>
  );
  const props = <Props key={one?.id ?? 'none'} it={one} n={sel.length} counts={[nCam, nLight, nPerson]} sceneId={sc.id} onDup={() => setSel(duplicateItems(sc.id, sel))} onDel={() => (deleteItems(sel), setSel([]))} offline={offline} onCopy={() => setCopyOpen(true)} />;

  return (
    <div data-component="PlanScreen" data-testid="plan" className="pl-root" dir="rtl">
      <div className="pl-top">
        <button className="pl-ib" title="رجوع للمشهد" data-testid="plan-back" onClick={closePlan}><Icon name="arrow-right" size={18} /></button>
        <div className="pl-crumb">{!mobile && <span>{`${p.name} ‹`}</span>}<b data-testid="plan-title">{title}</b></div>
        <span style={{ flex: 1 }} />
        {!mobile ? (
          <>
            <Button variant="outline" size="sm" icon="file" disabled={offline} data-testid="plan-copy" onClick={() => setCopyOpen(true)}>انسخ من مشهد</Button>
            <div className="pl-seg" data-testid="plan-snap"><button className={snap ? 'on' : ''} onClick={() => setSnap(true)}>مغناطيس الشبكة</button><button className={!snap ? 'on' : ''} onClick={() => setSnap(false)}>حر</button></div>
            <button className="pl-ib" title="تراجع" data-testid="plan-undo" disabled={!canUndo || offline} onClick={() => void undo()}><Icon name="arrow-right" size={17} /></button>
            <button className="pl-ib" title="إعادة" data-testid="plan-redo" disabled={!canRedo || offline} onClick={() => void redo()}><Icon name="arrow-left" size={17} /></button>
            <Button variant="primary" size="sm" icon="download" data-testid="plan-export" onClick={() => void exportPlanPng(sc.id)}>صورة للفريق</Button>
          </>
        ) : (
          <button className="pl-ib" aria-label="المزيد" data-testid="plan-more" onClick={() => setSheet(sheet === 'more' ? null : 'more')}><Icon name="more" size={18} /></button>
        )}
      </div>
      <div className="pl-body">
        {!mobile && <aside className="pl-palette">{palette}<div className="pl-hint">اسحب العنصر للمخطط أو اضغطه. الكاميرات والإضاءة من معداتك.</div></aside>}
        <div ref={wrap} className="pl-canvas" data-testid="plan-canvas"
          onDragOver={(e) => { if (e.dataTransfer.types.includes('text/plan-add')) e.preventDefault(); }}
          onDrop={(e) => {
            const v = e.dataTransfer.getData('text/plan-add');
            if (!v) return;
            e.preventDefault();
            const [tab, i] = v.split('|');
            const entry = PAL[tab as PTab]?.[Number(i)];
            if (entry) add(entry.make(itemsRef.current), toM(e.clientX, e.clientY));
          }}>
          <svg ref={svgRef} className="pl-svg" data-testid="plan-svg"
            onDoubleClick={(e) => {
              // the svg holds the pointer during a press, so the point is found from where the click is
              if (!one || one.kind !== 'arrow') return;
              const r = svgRef.current!.getBoundingClientRect(), v = viewRef.current;
              const i = arrowPoints(one).findIndex(([x, y]) => Math.hypot((x - v.ox) * v.s + r.left - e.clientX, (y - v.oy) * v.s + r.top - e.clientY) <= (mobile ? 22 : 12));
              if (i >= 0) removeArrowPoint(one.id, i);
            }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}
            onContextMenu={(e) => { e.preventDefault(); const g = (e.target as Element).closest('[data-pid]') as HTMLElement | null; if (g) itemMenu(g.dataset.pid!, e.clientX, e.clientY); }}>
            <defs>
              <pattern id="pl-grid" width={U} height={U} patternUnits="userSpaceOnUse" patternTransform={worldT}>
                <path d={`M${U / 2} 0V${U}M0 ${U / 2}H${U}`} stroke="var(--plan-grid)" vectorEffect="non-scaling-stroke" fill="none" />
                <path d={`M0 0V${U}M0 0H${U}`} stroke="var(--plan-grid-strong)" vectorEffect="non-scaling-stroke" fill="none" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#pl-grid)" />
            <g transform={worldT} data-testid="plan-world">
              {world}
              {marq && <rect x={marq.x * U} y={marq.y * U} width={marq.w * U} height={marq.h * U} fill="var(--color-accent-soft)" stroke="var(--color-accent)" vectorEffect="non-scaling-stroke" opacity={0.7} />}
            </g>
            {one && one.kind !== 'arrow' && <Handles it={one} view={view} mobile={mobile} />}
            {one && one.kind === 'arrow' && !offline && <ArrowHandles it={one} view={view} mobile={mobile} />}
          </svg>
          <div className="pl-scale" data-testid="plan-scale"><i style={{ width: scaleM * view.s }} />{`${scaleM} م`}</div>
          {!mobile && (
            <div className="pl-zoomer">
              <button className="pl-ib sm" title="تصغير" onClick={() => setView((v) => zoomAround(v, 1 / 1.2, size()))}>−</button>
              <span data-testid="plan-zoom">{Math.round((view.s / 58) * 100) + '%'}</span>
              <button className="pl-ib sm" title="تكبير" onClick={() => setView((v) => zoomAround(v, 1.2, size()))}>+</button>
              <Button variant="outline" size="sm" data-testid="plan-fit" onClick={() => fit()}>ملاءمة الكل</Button>
            </div>
          )}
          {!mobile && (nCam + nLight > 0) && <Legend items={items} />}
          {hud && <div className="pl-hud anim-rise" key={hud.n} data-testid="plan-hud">{hud.t}</div>}
          {!items.length && <div className="pl-empty" data-testid="plan-empty"><b>المخطط فاضي</b><span>{mobile ? 'اضغط «+ عنصر» وأضف كاميرا.' : 'اسحب كاميرا من اليمين، أو اضغط C.'}</span></div>}
        </div>
        {!mobile && <aside className="pl-props" data-testid="plan-props">{props}</aside>}
      </div>
      {mobile && (
        <>
          <div className="pl-mbar" style={{ bottom: sheet ? 'calc(55% + 10px)' : 16 }}>
            <button className="pl-ib add" data-testid="plan-m-add" disabled={offline} onClick={() => { setSel([]); setSheet(sheet === 'palette' ? null : 'palette'); }}><Icon name="plus" size={18} />عنصر</button>
            <button className="pl-ib" aria-label="تراجع" data-testid="plan-undo" disabled={!canUndo || offline} onClick={() => void undo()}><Icon name="arrow-right" size={18} /></button>
            <button className="pl-ib" aria-label="إعادة" data-testid="plan-redo" disabled={!canRedo || offline} onClick={() => void redo()}><Icon name="arrow-left" size={18} /></button>
            <button className="pl-ib" aria-label="ملاءمة" data-testid="plan-fit" onClick={() => fit()}><Icon name="maximize" size={18} /></button>
            <button className="pl-ib" aria-label="صورة" data-testid="plan-export" onClick={() => void exportPlanPng(sc.id)}><Icon name="download" size={18} /></button>
          </div>
          {sheet && (
            <Sheet onClose={() => setSheet(null)}>
              {sheet === 'palette' && palette}
              {sheet === 'props' && props}
              {sheet === 'more' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Button variant="outline" icon="file" disabled={offline} onClick={() => { setSheet(null); setCopyOpen(true); }}>انسخ من مشهد</Button>
                  <div className="pl-seg" style={{ alignSelf: 'flex-start' }}><button className={snap ? 'on' : ''} onClick={() => setSnap(true)}>مغناطيس الشبكة</button><button className={!snap ? 'on' : ''} onClick={() => setSnap(false)}>حر</button></div>
                </div>
              )}
            </Sheet>
          )}
        </>
      )}
      {copyOpen && <CopyFrom sceneId={sc.id} onClose={() => setCopyOpen(false)} />}
    </div>
  );
}

const round2 = (v: number) => Math.round(v * 100) / 100;
function zoomAround(v: View, f: number, { W, H }: { W: number; H: number }): View {
  const s = Math.max(10, Math.min(160, v.s * f));
  const cx = v.ox + W / 2 / v.s, cy = v.oy + H / 2 / v.s;
  return { s, ox: cx - W / 2 / s, oy: cy - H / 2 / s };
}

/** A camera's cone (with the 260 ms angle change, §6.4) or a light's beam. */
const Beam = memo(function Beam({ it, on, k, mobile }: { it: PlanItem; on: boolean; k: number; mobile: boolean }) {
  const X = it.x * U, Y = it.y * U, r = (Number(it.props.range) || 3) * U;
  const target = it.kind === 'camera' ? hfov(it.refId, focalOf(it), !!it.props.vertical) : beamOf(it);
  const [fov, setFov] = useState(target);
  const last = useRef(target);
  useEffect(() => {
    const from = last.current;
    last.current = target;
    if (Math.abs(from - target) < 0.3 || reducedMotion()) return setFov(target);
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const q = Math.min(1, (t - t0) / 260), e = 1 - (1 - q) ** 3;
      setFov(from + (target - from) * e);
      if (q < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  if (it.kind === 'camera') {
    const hex = camSpec(it.refId).hex, m = ((it.rot - 90) * Math.PI) / 180, lr = r + 16 / k;
    return (
      <g data-testid="plan-cone" data-fov={Math.round(target)}>
        <path d={wedge(X, Y, it.rot, fov, r)} fill={hex} fillOpacity={on ? 0.16 : 0.1} stroke={hex} strokeOpacity={0.55} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {(!mobile || on) && <text x={X + lr * Math.cos(m)} y={Y + lr * Math.sin(m)} textAnchor="middle" dominantBaseline="middle" fontSize={12 / k} fontWeight={700} fill={hex} direction="ltr" data-testid="plan-cone-label">{`${it.label} · ${Math.round(focalOf(it))}mm · ${Math.round(target)}°`}</text>}
      </g>
    );
  }
  const col = lightColor(it), gid = `pg-${it.id.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <g>
      <defs><radialGradient id={gid} cx={X} cy={Y} r={r} gradientUnits="userSpaceOnUse"><stop offset="0" stopColor={col} stopOpacity={0.55} /><stop offset="1" stopColor={col} stopOpacity={0} /></radialGradient></defs>
      <path d={wedge(X, Y, it.rot, fov, r)} fill={`url(#${gid})`} stroke="#e0a64a" strokeOpacity={0.45} strokeDasharray="4 5" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    </g>
  );
});

/** One item: drawn once in world units; only its own changes redraw it. */
const Item = memo(function Item({ it, on, k }: { it: PlanItem; on: boolean; k: number }) {
  const X = it.x * U, Y = it.y * U;
  if (it.kind === 'arrow') {
    const col = it.color || '#3b6fd8';
    const line = arrowPath(arrowPoints(it).map(([a, b]) => [a * U, b * U] as [number, number]), !!it.props.curve);
    return (
      <g data-pid={it.id} data-kind="arrow" style={{ cursor: 'move' }}>
        <g dangerouslySetInnerHTML={{ __html: arrowSvg(it, (x) => x * U, (y) => y * U, col) }} />
        {/* a wide invisible stroke so the thin arrow is easy to grab */}
        <path d={line} stroke="transparent" strokeWidth={22 / k} fill="none" />
        {on && <path d={line} stroke="var(--color-accent)" strokeOpacity={0.5} strokeWidth={8 / k} fill="none" />}
      </g>
    );
  }
  if (it.kind === 'zone' || it.kind === 'text') {
    const w = it.w * U, h = it.h * U;
    return (
      <g data-pid={it.id} data-kind={it.kind} transform={`translate(${X} ${Y}) rotate(${it.rot})`} style={{ cursor: 'move' }}>
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={10 / k} fill={it.kind === 'zone' ? 'var(--color-accent)' : 'transparent'} fillOpacity={0.08} stroke={it.kind === 'zone' || on ? 'var(--color-accent)' : 'transparent'} strokeDasharray="6 5" strokeWidth={on ? 2 : 1.4} vectorEffect="non-scaling-stroke" />
        <text x={it.kind === 'zone' ? w / 2 - 12 / k : 0} y={it.kind === 'zone' ? -h / 2 + 22 / k : 5 / k} textAnchor={it.kind === 'zone' ? 'start' : 'middle'} fontSize={15 / k} fontWeight={700} fill="var(--color-text-muted)">{it.label}</text>
      </g>
    );
  }
  const body = itemBody(it, U);
  const fw = it.kind === 'furniture' ? it.w : it.kind === 'person' ? 0.62 : 0.9, fh = it.kind === 'furniture' ? it.h : it.kind === 'person' ? 0.62 : 0.9;
  return (
    <>
      <g data-pid={it.id} data-kind={it.kind} transform={`translate(${X} ${Y}) rotate(${it.rot})`} style={{ cursor: 'move' }}>
        <g dangerouslySetInnerHTML={{ __html: body }} />
        {/* the whole footprint takes the pointer */}
        <rect x={(-fw / 2) * U} y={(-fh / 2) * U} width={fw * U} height={fh * U} fill="transparent" />
        {on && <rect x={(-fw / 2) * U - 6 / k} y={(-fh / 2) * U - 6 / k} width={fw * U + 12 / k} height={fh * U + 12 / k} rx={8 / k} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
      </g>
      {it.kind === 'camera' && (
        <g transform={`translate(${X + 0.42 * U} ${Y - 0.42 * U}) scale(${1 / k})`} pointerEvents="none">
          <circle r={10} fill={camSpec(it.refId).hex} />
          <text textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill="#fff">{it.label}</text>
        </g>
      )}
      {it.kind === 'camera' && it.props.height ? <text x={X} y={Y + 0.62 * U + 12 / k} textAnchor="middle" fontSize={11 / k} fill="var(--color-text-muted)" direction="ltr" pointerEvents="none">{`↑ ${it.props.height} م`}</text> : null}
      {(it.kind === 'person' || (it.kind === 'furniture' && it.label)) && k * U > 30 && (
        <text x={X} y={Y + (it.kind === 'person' ? 0.48 * U + 6 / k : (it.h / 2) * U + 16 / k)} textAnchor="middle" fontSize={12 / k} fontWeight={700} fill={it.kind === 'person' ? 'var(--color-text)' : 'var(--color-text-muted)'} pointerEvents="none">{it.label}</text>
      )}
    </>
  );
});

/** Rotation, range and size handles in screen pixels (44px touch areas on the phone). */
function Handles({ it, view, mobile }: { it: PlanItem; view: View; mobile: boolean }) {
  const px = (it.x - view.ox) * view.s, py = (it.y - view.oy) * view.s;
  const point = it.kind === 'camera' || it.kind === 'light' || it.kind === 'person';
  const rr = (point ? 0.6 : it.h / 2 + 0.35) * view.s + 10;
  const ra = ((it.rot - 90) * Math.PI) / 180;
  const hx = px - rr * Math.cos(ra), hy = py - rr * Math.sin(ra);
  const vis = mobile ? 14 : 9, hit = mobile ? 22 : 12;
  const out: React.ReactNode[] = [
    <line key="l" x1={px} y1={py} x2={hx} y2={hy} stroke="var(--color-accent)" strokeWidth={1.5} strokeDasharray="3 3" />,
    <g key="rot" data-h="rot" data-testid="plan-h-rot" style={{ cursor: 'grab' }}>
      <circle cx={hx} cy={hy} r={hit} fill="transparent" />
      <circle cx={hx} cy={hy} r={vis} fill="var(--color-bg)" stroke="var(--color-accent)" strokeWidth={2.5} />
      <path d={`M${hx - 4} ${hy + 1}a4 4 0 1 1 4 4`} fill="none" stroke="var(--color-accent)" strokeWidth={1.6} pointerEvents="none" />
    </g>,
  ];
  if (it.kind === 'camera' || it.kind === 'light') {
    const r = (Number(it.props.range) || 3) * view.s, ex = px + r * Math.cos(ra), ey = py + r * Math.sin(ra);
    out.push(
      <g key="range" data-h="range" data-testid="plan-h-range" style={{ cursor: 'ew-resize' }}>
        <circle cx={ex} cy={ey} r={hit} fill="transparent" />
        <circle cx={ex} cy={ey} r={vis - 1} fill="var(--color-accent)" stroke="var(--color-bg)" strokeWidth={2.5} />
      </g>,
    );
  }
  if (it.kind === 'furniture' || it.kind === 'zone' || it.kind === 'text') {
    // outside the corner, 6px from the edge (UPDATE-3 §3.2)
    const a = (it.rot * Math.PI) / 180, gx = (it.w / 2) * view.s + 10, gy = (it.h / 2) * view.s + 10;
    const cx = px + gx * Math.cos(a) - gy * Math.sin(a), cy = py + gx * Math.sin(a) + gy * Math.cos(a);
    out.push(
      <g key="size" data-h="size" data-testid="plan-h-size" style={{ cursor: 'nwse-resize' }}>
        <rect x={cx - hit} y={cy - hit} width={hit * 2} height={hit * 2} fill="transparent" />
        <rect x={cx - vis + 2} y={cy - vis + 2} width={2 * vis - 4} height={2 * vis - 4} rx={3} fill="var(--color-bg)" stroke="var(--color-accent)" strokeWidth={2.5} />
      </g>,
    );
  }
  return <g data-testid="plan-handles">{out}</g>;
}

/** An arrow's points (circles) and the faint middles of its parts (pull one = a new bend). */
function ArrowHandles({ it, view, mobile }: { it: PlanItem; view: View; mobile: boolean }) {
  const abs = arrowPoints(it);
  const sx = (p: [number, number]) => [(p[0] - view.ox) * view.s, (p[1] - view.oy) * view.s];
  const hit = mobile ? 22 : 11, vis = mobile ? 9 : 6;
  return (
    <g data-testid="plan-arrow-handles">
      {arrowMids(abs, !!it.props.curve).map((m, i) => {
        const [x, y] = sx(m);
        return (
          <g key={`m${i}`} data-h="mid" data-i={i} data-testid="plan-mid" style={{ cursor: 'copy' }}>
            <circle cx={x} cy={y} r={hit} fill="transparent" />
            <circle cx={x} cy={y} r={vis - 2} fill="var(--color-bg)" stroke="var(--color-accent)" strokeWidth={1.5} opacity={0.55} />
          </g>
        );
      })}
      {abs.map((p, i) => {
        const [x, y] = sx(p);
        return (
          <g key={`p${i}`} data-h="pt" data-i={i} data-testid="plan-pt" style={{ cursor: 'move' }}>
            <circle cx={x} cy={y} r={hit} fill="transparent" />
            <circle cx={x} cy={y} r={vis} fill={i === abs.length - 1 ? 'var(--color-accent)' : 'var(--color-bg)'} stroke="var(--color-accent)" strokeWidth={2.5} />
          </g>
        );
      })}
    </g>
  );
}

function Thumb({ it }: { it: NewItem }) {
  const full: PlanItem = { ...it, id: 't', sceneId: '', x: 0, y: 0, z: 0 };
  let body: string;
  if (it.kind === 'zone') body = `<rect x="-18" y="-11" width="36" height="22" rx="5" fill="var(--color-accent)" fill-opacity=".12" stroke="var(--color-accent)" stroke-dasharray="4 3"/>`;
  else if (it.kind === 'text') body = `<text x="0" y="5" text-anchor="middle" font-size="14" font-weight="700" fill="var(--color-text-muted)">نص</text>`;
  else if (it.kind === 'arrow') body = `<path d="M-16 8Q0 -14 16 -6" fill="none" stroke="${it.color}" stroke-width="2.4" ${it.props.dashed ? 'stroke-dasharray="5 4"' : ''}/>`;
  else {
    const s = it.kind === 'furniture' ? 36 / Math.max(it.w, it.h * 1.4, 1) : 52;
    body = itemBody(full, s);
    if (it.kind === 'camera') body = `<path d="M0 0L-14 -24A28 28 0 0 1 14 -24Z" fill="${camSpec(it.refId).hex}" fill-opacity=".18"/>` + body;
  }
  return <svg viewBox="-24 -24 48 48" width={46} height={46} aria-hidden="true" dangerouslySetInnerHTML={{ __html: body }} />;
}

function Legend({ items }: { items: PlanItem[] }) {
  return (
    <div className="pl-legend" data-testid="plan-legend">
      {items.filter((i) => i.kind === 'camera').map((c) => <div key={c.id}><i style={{ background: camSpec(c.refId).hex }} /><b>{c.label}</b>{` ${eqShort(c.refId) || 'كاميرا'} · ${Math.round(focalOf(c))}mm`}</div>)}
      {items.filter((i) => i.kind === 'light').map((l) => <div key={l.id}><i style={{ background: lightColor(l), border: '1px solid #c9b98f' }} />{`${l.label || 'ضوء'} · ${eqShort(l.refId)}`}</div>)}
    </div>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const [tall, setTall] = useState(false);
  const y0 = useRef<number | null>(null);
  return (
    <div className="pl-sheet anim-sheet" data-testid="plan-sheet" style={{ height: tall ? '92%' : '55%' }}>
      <div className="pl-grab" onPointerDown={(e) => (y0.current = e.clientY)} onPointerUp={(e) => {
        if (y0.current === null) return;
        const dy = e.clientY - y0.current;
        y0.current = null;
        if (dy < -30) setTall(true);
        else if (dy > 30) (tall ? setTall(false) : onClose());
        else setTall(!tall);
      }}><i /></div>
      <div className="pl-sheet-inner">{children}</div>
    </div>
  );
}

function CopyFrom({ sceneId, onClose }: { sceneId: string; onClose: () => void }) {
  const list = scenesWithPlan(sceneId);
  return (
    <div className="pl-dim" onClick={onClose}>
      <div className="pl-dialog anim-rise" data-testid="plan-copy-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>انسخ من مشهد</h3>
        {!list.length && <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>ما فيه مشهد ثاني له مخطط.</span>}
        {list.map(({ s, i, n }) => (
          <div key={s.id} className="pl-copy-row">
            <span style={{ flex: 1 }}><b>{`${pad2(i + 1)} ${s.name}`}</b><small>{`${n} عناصر`}</small></span>
            <Button variant="outline" size="sm" data-testid="plan-copy-replace" onClick={() => (copyPlanFrom(s.id, sceneId, 'replace'), onClose())}>استبدل</Button>
            <Button variant="primary" size="sm" data-testid="plan-copy-add" onClick={() => (copyPlanFrom(s.id, sceneId, 'add'), onClose())}>أضف</Button>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}><Button variant="ghost" size="sm" onClick={onClose}>إلغاء</Button></div>
      </div>
    </div>
  );
}

// ---------- properties (§6.3) ----------

function Props({ it, n, counts, sceneId, onDup, onDel, offline, onCopy }: { it: PlanItem | null; n: number; counts: [number, number, number]; sceneId: string; onDup: () => void; onDel: () => void; offline: boolean; onCopy: () => void }) {
  const set = (fields: Partial<Omit<PlanItem, 'props'>> & { props?: PlanProps }, key?: string) => it && updateItems([{ id: it.id, fields }], 'تعديل المخطط', key ? `plan:${it.id}:${key}` : undefined);
  const setP = (patch: PlanProps, key?: string) => it && set({ props: { ...it.props, ...patch } }, key);
  const mobile = useIsMobile();
  const actions = (
    <div className="pl-row2">
      <Button variant="outline" size="sm" icon="repeat" disabled={offline} data-testid="plan-dup" onClick={onDup}>تكرار</Button>
      <Button variant="outline" size="sm" icon="trash" disabled={offline} data-testid="plan-delete" onClick={onDel}>حذف</Button>
    </div>
  );
  if (!it) {
    if (n > 1) return <div><h3>{`${n} عناصر`}</h3><div className="pl-sub">تتحرك مع بعض بالسحب والأسهم.</div>{actions}</div>;
    return (
      <div>
        <h3>المخطط</h3>
        <div className="pl-readout"><b>{`${counts[0]} كاميرات · ${counts[1]} إضاءات`}</b><span>{`${counts[2]} أشخاص على المخطط`}</span></div>
        <div className="pl-help">اضغط أي عنصر لتعدّله.<br />اسحب المساحة الفاضية لتحريك المخطط، والعجلة للتقريب.<br />{`${isMac() ? '⌘' : 'Ctrl'} D تكرار · Delete حذف · R تدوير 15°`}</div>
        <div style={{ marginTop: 14 }}><Button variant="outline" size="sm" icon="file" disabled={offline} onClick={onCopy}>انسخ من مشهد</Button></div>
      </div>
    );
  }
  const name = (label: string, ph?: string) => <label className="pl-field"><span>{label}</span><input type="text" data-testid="plan-label" defaultValue={it.label} placeholder={ph} disabled={offline} onChange={(e) => set({ label: e.target.value }, 'label')} /></label>;
  if (it.kind === 'camera') {
    const c = camSpec(it.refId), f = focalOf(it), fov = hfov(it.refId, f, !!it.props.vertical);
    const cams = planCameras();
    const lensEq = it.props.lens ? engine.store.equipment.get(it.props.lens) : null;
    let lens: React.ReactNode;
    if (c.lenses) {
      const rng = c.lenses[it.props.lens ?? ''] ?? Object.values(c.lenses)[0];
      lens = (
        <>
          <label className="pl-field"><span>العدسة</span>
            <select data-testid="plan-lens" value={it.props.lens ?? ''} disabled={offline} onChange={(e) => { const r = c.lenses![e.target.value]; setP({ lens: e.target.value, focalMm: Math.min(r[1], Math.max(r[0], f)) }); }}>
              {Object.keys(c.lenses).map((l) => <option key={l} value={l}>{eqShort(l) || l}</option>)}
            </select>
          </label>
          <label className="pl-field"><span>{`البعد البؤري: ${f}mm`}</span><input type="range" data-testid="plan-focal" min={rng[0]} max={rng[1]} value={f} disabled={offline} onChange={(e) => setP({ focalMm: Number(e.target.value) }, 'focal')} /></label>
        </>
      );
    } else if (c.builtin) {
      lens = <div className="pl-field"><span>العدسة</span><div className="pl-chips">{Object.entries(c.builtin).map(([k2, v]) => <button key={k2} data-testid={`plan-builtin-${k2}`} className={`fd-chip${it.props.lens === k2 ? ' on' : ''}`} disabled={offline} onClick={() => setP({ lens: k2, focalMm: v })}>{`${k2} · ${v}mm`}</button>)}</div></div>;
    } else if (c.fixed) {
      lens = <div className="pl-field"><span>العدسة</span><span style={{ fontSize: 14 }}>{`ثابتة ${c.fixed}mm`}</span></div>;
    } else {
      lens = <label className="pl-field"><span>{`الزوم: ${f}mm (مكافئ)`}</span><input type="range" data-testid="plan-focal" min={c.zoom![0]} max={Math.min(300, c.zoom![1])} value={f} disabled={offline} onChange={(e) => setP({ focalMm: Number(e.target.value) }, 'focal')} /></label>;
    }
    return (
      <div data-testid="plan-props-camera">
        <h3><span className="pl-letter" style={{ background: c.hex }}>{it.label}</span>{eqShort(it.refId) || 'كاميرا'}</h3>
        <div className="pl-sub">{lensEq ? `${eqShort(lensEq.id)} · كاميرا من معداتك` : 'كاميرا من معداتك'}</div>
        <div className="pl-readout"><b data-testid="plan-fov">{`${Math.round(fov)}°`}</b><span data-testid="plan-frame">{`زاوية الرؤية · عرض الكادر على 3 م: ${frameWidth(fov, 3).toFixed(1)} م`}</span></div>
        <label className="pl-field"><span>الكاميرا</span>
          <select data-testid="plan-camera" value={it.refId ?? ''} disabled={offline} onChange={(e) => { const nc = newCamera(e.target.value, []); set({ refId: e.target.value, props: { ...it.props, lens: nc.props.lens, focalMm: nc.props.focalMm } }); }}>
            {cams.map((x) => <option key={x.id} value={x.id}>{eqShort(x.id)}</option>)}
          </select>
        </label>
        {lens}
        <div className="pl-field"><span>اتجاه الكادر</span><div className="pl-chips">
          <button className={`fd-chip${!it.props.vertical ? ' on' : ''}`} data-testid="plan-horizontal" disabled={offline} onClick={() => setP({ vertical: false })}>أفقي</button>
          <button className={`fd-chip${it.props.vertical ? ' on' : ''}`} data-testid="plan-vertical" disabled={offline} onClick={() => setP({ vertical: true })}>عمودي</button>
        </div></div>
        <label className="pl-field"><span>{`طول الخطوط: ${(Number(it.props.range) || 4).toFixed(1)} م`}</span><input type="range" min={1} max={15} step={0.1} value={Number(it.props.range) || 4} disabled={offline} onChange={(e) => setP({ range: Number(e.target.value) }, 'range')} /></label>
        <div className="pl-row2">
          {name('الحرف')}
          <label className="pl-field"><span>الارتفاع (م)</span><input type="number" step={0.5} min={0} data-testid="plan-height" defaultValue={it.props.height ?? ''} placeholder="اختياري" disabled={offline} onChange={(e) => setP({ height: e.target.value === '' ? null : Number(e.target.value) }, 'height')} /></label>
        </div>
        {actions}
      </div>
    );
  }
  if (it.kind === 'light') {
    const L = lightSpec(it.refId);
    return (
      <div data-testid="plan-props-light">
        <h3>{it.label || eqShort(it.refId)}</h3>
        <div className="pl-sub">{`${eqShort(it.refId)} · من معداتك`}</div>
        <label className="pl-field"><span>الإضاءة</span>
          <select value={it.refId ?? ''} disabled={offline} onChange={(e) => set({ refId: e.target.value, props: { ...it.props, modifier: e.target.value === 'lt-hs60b' ? 'none' : undefined } })}>
            {planLights().map((x) => <option key={x.id} value={x.id}>{eqShort(x.id)}</option>)}
          </select>
        </label>
        {L.mods && <div className="pl-field"><span>المُعدِّل</span><div className="pl-chips">{Object.keys(L.mods).map((m) => <button key={m} data-testid={`plan-mod-${m}`} className={`fd-chip${(it.props.modifier || 'none') === m ? ' on' : ''}`} disabled={offline} onClick={() => setP({ modifier: m })}>{m === 'none' ? 'بدون' : eqShort(m)}</button>)}</div></div>}
        {L.cct && <label className="pl-field"><span>{`حرارة اللون: ${Number(it.props.cct) || 5600}K`}</span><input type="range" min={2700} max={6500} step={100} value={Number(it.props.cct) || 5600} disabled={offline} onChange={(e) => setP({ cct: Number(e.target.value) }, 'cct')} style={{ accentColor: cctColor(Number(it.props.cct) || 5600) }} /></label>}
        {L.rgb && <div className="pl-field"><span>لون RGB</span><div className="pl-chips">{['#e21e88', '#1326fc', '#ff4e22', '#2fbf71', ''].map((c) => <button key={c || 'w'} className={`fd-chip${(it.props.rgb ?? '') === c ? ' on' : ''}`} disabled={offline} onClick={() => setP({ rgb: c || undefined })}>{c ? <i style={{ width: 14, height: 14, borderRadius: '50%', background: c, display: 'inline-block' }} /> : 'أبيض'}</button>)}</div></div>}
        <label className="pl-field"><span>{`المدى: ${(Number(it.props.range) || 2.5).toFixed(1)} م`}</span><input type="range" min={0.5} max={8} step={0.1} value={Number(it.props.range) || 2.5} disabled={offline} onChange={(e) => setP({ range: Number(e.target.value) }, 'range')} /></label>
        {name('الاسم')}
        {actions}
      </div>
    );
  }
  if (it.kind === 'person') {
    const chars = sceneCharacters(sceneId);
    return (
      <div data-testid="plan-props-person">
        <h3>{it.label}</h3>
        <div className="pl-sub">شخص · من شخصيات المشهد أو اسم حر</div>
        {chars.length > 0 && (
          <label className="pl-field"><span>الشخصية</span>
            <select value={it.refId ?? ''} disabled={offline} onChange={(e) => { const c = chars.find((x) => x.id === e.target.value); set(c ? { refId: c.id, label: c.name as string, color: avatar(c as never).bg } : { refId: null }); }}>
              <option value="">اسم حر</option>
              {chars.map((c) => <option key={c.id} value={c.id}>{c.name as string}</option>)}
            </select>
          </label>
        )}
        {name('الاسم')}
        <div className="pl-field"><span>اللون</span><div className="pl-chips">{PERSON_COLORS.map((c) => <button key={c} className={`fd-chip${it.color === c ? ' on' : ''}`} disabled={offline} onClick={() => set({ color: c })}><i style={{ width: 14, height: 14, borderRadius: '50%', background: c, display: 'inline-block' }} /></button>)}</div></div>
        <div className="pl-help">اتجاه النظر: اسحب مقبض الدوران.</div>
        {actions}
      </div>
    );
  }
  if (it.kind === 'arrow') {
    return (
      <div data-testid="plan-props-arrow">
        <h3>{it.label || 'سهم حركة'}</h3>
        <div className="pl-sub">سهم حركة</div>
        <div className="pl-field"><span>الخط</span><div className="pl-chips">
          <button className={`fd-chip${it.props.dashed ? ' on' : ''}`} disabled={offline} onClick={() => setP({ dashed: true })}>متقطع (كاميرا)</button>
          <button className={`fd-chip${!it.props.dashed ? ' on' : ''}`} disabled={offline} onClick={() => setP({ dashed: false })}>متصل (شخص)</button>
        </div></div>
        <div className="pl-field"><span>الشكل</span><div className="pl-chips">
          <button className={`fd-chip${!it.props.curve ? ' on' : ''}`} data-testid="plan-straight" disabled={offline} onClick={() => setP({ curve: false })}>مستقيم</button>
          <button className={`fd-chip${it.props.curve ? ' on' : ''}`} data-testid="plan-curve" disabled={offline} onClick={() => setP({ curve: true })}>منحني</button>
        </div></div>
        <Button variant="outline" size="sm" icon="repeat" data-testid="plan-reverse" disabled={offline} onClick={() => {
          const f = arrowFrom(arrowPoints(it).reverse());
          updateItems([{ id: it.id, fields: { x: f.x, y: f.y, props: { ...it.props, points: f.points } } }], 'قلب الاتجاه');
        }}>اقلب الاتجاه</Button>
        <div className="pl-help">{mobile ? 'اسحب أي نقطة لتغيّر الشكل، واسحب النقطة الباهتة لانحناءة جديدة. ضغطة مطوّلة على نقطة تحذفها.' : 'اسحب أي نقطة لتغيّر الشكل، واسحب النقطة الباهتة لانحناءة جديدة. ضغطتين على نقطة تحذفها.'}</div>
        {name('الاسم')}
        {actions}
      </div>
    );
  }
  return (
    <div data-testid="plan-props-shape">
      <h3>{it.label || 'عنصر'}</h3>
      <div className="pl-sub">{`${it.kind === 'zone' ? 'منطقة' : it.kind === 'text' ? 'نص' : 'ديكور'} · ${it.w.toFixed(1)} × ${it.h.toFixed(1)} م`}</div>
      {name(it.kind === 'text' ? 'النص' : 'الاسم')}
      <div className="pl-row2">
        <label className="pl-field"><span>العرض (م)</span><input type="number" step={0.05} min={0.1} data-testid="plan-w" defaultValue={it.w} disabled={offline} onChange={(e) => Number(e.target.value) > 0 && set({ w: Number(e.target.value) }, 'w')} /></label>
        <label className="pl-field"><span>العمق (م)</span><input type="number" step={0.05} min={0.05} data-testid="plan-h" defaultValue={it.h} disabled={offline} onChange={(e) => Number(e.target.value) > 0 && set({ h: Number(e.target.value) }, 'h')} /></label>
      </div>
      {actions}
    </div>
  );
}
