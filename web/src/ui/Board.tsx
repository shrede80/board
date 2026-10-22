import { memo, useEffect, useRef, useState } from 'react';
import { cardColors, DEFAULT_SIZE, drawOrder, handlesFor, headingColor, type Handle } from '../../../shared/board';
import { commit, openEditor, setBoardSnap } from '../app/actions';
import { autoArrange, boardItems, fitAll, onBoardDown, onHandleDown, onItemDown, photoHeight, registerLongPress, resetSize, setBoardEl, toWorld, zoomBy, type Item } from '../app/board';
import { boardMenu, openItemsMenu } from '../app/boardActions';
import { currentDrag, dropOnBoard, dropOnShot, hasFiles } from '../app/dnd';
import { engine, getState, openMenu, setState, useApp, useProject } from '../app/state';
import { coverOf, moodHex, sceneCover, sceneDur, type PCard, type PProject, type PScene } from '../data/project';
import { Badge, EmptyState, Icon } from '../ds/ds';
import { AR, GRID } from '../lib/constants';
import { frameBg, imageUrl, mmss, pad2 } from '../lib/util';
import { avatar } from './Library';

const sel = (on: boolean) => (on ? '0 0 0 2px var(--color-accent), var(--shadow-lift)' : 'var(--shadow-card)');

function useMatches() {
  const f = useApp((s) => s.filter);
  return (sc: PScene) => !f || (f.kind === 'character' ? sc.characterIds.includes(f.id) : sc.locationId === f.id);
}

/** Hover with a short grace period, so the ⋯ button above the item can be reached. */
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
function hoverIn(id: string) {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = null;
  if (getState().hoverItem !== id) setState({ hoverItem: id });
}
function hoverOut(id: string) {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    hoverTimer = null;
    if (getState().hoverItem === id) setState({ hoverItem: null });
  }, 350);
}

registerLongPress((x, y, id) => {
  if (id) openItemsMenu(x, y, id);
  else openMenu(x, y, boardMenu(toWorld(x, y)), 'board-menu');
});

export function BoardCanvas() {
  const p = useProject();
  const mode = useApp((s) => s.mode);
  const view = useApp((s) => s.view);
  const space = useApp((s) => s.space);
  const marquee = useApp((s) => s.marquee);
  const guides = useApp((s) => s.guides);
  const fade = useApp((s) => s.guidesFade);
  if (!p) return null;
  const isBoard = mode === 'board';
  const gs = GRID * view.z;
  return (
    <div
      data-layer="board"
      data-component="BoardCanvas"
      data-testid="board"
      ref={setBoardEl}
      onPointerDown={onBoardDown}
      onDragOver={(e) => {
        if (currentDrag() || hasFiles(e)) e.preventDefault();
      }}
      onDrop={dropOnBoard}
      onContextMenu={(e) => {
        // our own menu replaces the browser's (UPDATE-1 أ3)
        e.preventDefault();
        if ((e.target as HTMLElement).closest('[data-item],[data-handle]')) return;
        setState({ selection: [] });
        openMenu(e.clientX, e.clientY, boardMenu(toWorld(e.clientX, e.clientY)), 'board-menu');
      }}
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden', backgroundColor: 'var(--color-bg)',
        backgroundImage: 'radial-gradient(circle, var(--board-dot) 1.2px, transparent 1.7px)', backgroundSize: `${gs}px ${gs}px`,
        backgroundPosition: `${view.x % gs}px ${view.y % gs}px`, cursor: space ? 'grab' : 'default', pointerEvents: isBoard ? 'auto' : 'none', touchAction: 'none', userSelect: 'none',
      }}
    >
      <div data-testid="world" style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
        <Items p={p} isBoard={isBoard} />
        {marquee && <div style={{ position: 'absolute', left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h, border: '1px solid var(--color-accent)', background: 'var(--color-accent-soft)', opacity: 0.7, pointerEvents: 'none', zIndex: 4000 }} />}
        {guides.map((g, i) => {
          const fx = { opacity: fade ? 0 : 1, transition: fade ? 'opacity 300ms var(--ease-exit)' : 'none' };
          return (
            <div key={i} data-testid="guide" data-dir={g.dir} data-fading={fade ? '1' : undefined}
              style={g.dir === 'v'
                ? { position: 'absolute', left: g.at, top: g.from, width: 1 / view.z, height: g.to - g.from, background: 'var(--tan-600)', pointerEvents: 'none', zIndex: 4001, ...fx }
                : { position: 'absolute', top: g.at, left: g.from, height: 1 / view.z, width: g.to - g.from, background: 'var(--tan-600)', pointerEvents: 'none', zIndex: 4001, ...fx }} />
          );
        })}
      </div>
      {isBoard && <NudgeHud />}
      {isBoard && !p.scenes.length && !p.cards.length && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'none' }}>
          <EmptyState icon="film" title="مشروع فارغ" description="اسحب قالب مشهد لتبدأ." />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, marginTop: 40, color: 'var(--color-accent)' }}>
            <span style={{ width: 2, height: 120, background: 'linear-gradient(var(--color-accent),var(--color-accent)) center/2px 100% no-repeat', opacity: 0.8 }} />
            <span style={{ width: 12, height: 12, borderInlineEnd: '2px solid var(--color-accent)', borderBottom: '2px solid var(--color-accent)', transform: 'rotate(45deg)', marginTop: -10 }} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Every board item, frames underneath, the rest by layer (UPDATE-1 أ5, أ7). */
const Items = memo(function Items({ p, isBoard }: { p: PProject; isBoard: boolean }) {
  const selection = useApp((s) => s.selection);
  const editor = useApp((s) => s.editor);
  const dragPos = useApp((s) => s.dragPos);
  const dragSize = useApp((s) => s.dragSize);
  const filter = useApp((s) => s.filter);
  const hover = useApp((s) => s.hoverItem);
  const renaming = useApp((s) => s.renaming);
  const theme = useApp((s) => s.theme);
  const z = useApp((s) => s.view.z);
  const matches = useMatches();
  const all = boardItems(p);
  const ordered = [...drawOrder(all.filter((i) => i.kind === 'frame')), ...drawOrder(all.filter((i) => i.kind !== 'frame'))];
  const single = selection.length === 1 ? selection[0] : null;
  return (
    <>
      {ordered.map((it, idx) => {
        const pos = dragPos?.[it.id] ?? (it.scene ? { x: it.scene.boardX, y: it.scene.boardY } : { x: it.card!.x, y: it.card!.y });
        const on = selection.includes(it.id) || (!!it.scene && editor?.type === 'scene' && editor.id === it.id);
        const size = dragSize?.[it.id];
        const isFrame = it.kind === 'frame';
        const dim = it.scene ? (matches(it.scene) ? 1 : 0.22) : filter && !isFrame ? 0.3 : 1;
        const showHandles = isBoard && single === it.id && !it.locked;
        const showDots = isBoard && (hover === it.id || single === it.id);
        const rename = renaming && renaming.id === it.id && (renaming.kind === 'card' || (renaming.kind === 'scene' && renaming.where === 'board')) ? renaming : null;
        return (
          <div key={it.id} data-item="1" data-item-id={it.id} data-kind={it.kind} data-locked={it.locked ? '1' : undefined}
            data-flip={it.card ? `card-${it.id}` : undefined}
            data-testid={it.scene ? 'scene-card' : `card-${it.kind}`}
            onPointerDown={isFrame ? undefined : (e) => onItemDown(e, it.id)}
            onDoubleClick={(e) => {
              if (it.kind === 'heading' || it.kind === 'image') (e.stopPropagation(), setState({ renaming: { kind: 'card', id: it.id }, selection: [it.id] }));
            }}
            onContextMenu={(e) => (e.preventDefault(), e.stopPropagation(), openItemsMenu(e.clientX, e.clientY, it.id))}
            onPointerEnter={() => hoverIn(it.id)}
            onPointerLeave={() => hoverOut(it.id)}
            style={{ position: 'absolute', left: pos.x, top: pos.y, zIndex: idx + 1, opacity: dim, transition: 'opacity 200ms', pointerEvents: isFrame ? 'none' : undefined }}>
            {it.scene && <SceneBody p={p} sc={it.scene} si={p.scenes.indexOf(it.scene)} on={on} w={size?.w ?? it.scene.boardW ?? DEFAULT_SIZE.scene[0]} ph={size?.ph} renaming={!!rename} />}
            {it.card && <CardBody p={p} c={it.card} on={on} theme={theme} size={size} renaming={!!rename} z={isFrame ? z : 1} />}
            {it.locked && <span data-testid="lock-badge" title="مقفل" style={{ position: 'absolute', top: isFrame ? 10 : 8, left: 8, width: 24, height: 24, borderRadius: '50%', background: 'rgba(20,18,16,.6)', color: '#fdfcfa', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3, pointerEvents: 'none' }}><Icon name="lock" size={13} /></span>}
            {showDots && <DotsButton id={it.id} z={z} />}
            {showHandles && <Handles it={it} z={z} />}
            {size && <span style={{ position: 'absolute', bottom: -30 / z, left: 0, transform: `scale(${1 / z})`, transformOrigin: '0 0', background: 'var(--color-accent)', color: '#141210', fontSize: 12, fontWeight: 700, borderRadius: 6, padding: '3px 8px', direction: 'ltr', whiteSpace: 'nowrap' }} data-testid="size-tip">{it.kind === 'heading' && size.h ? `${size.h}px` : `${size.w} px`}</span>}
          </div>
        );
      })}
    </>
  );
});

/** What the last arrow key did, under the board for 1.6 s (UPDATE-3 §3.1). */
function NudgeHud() {
  const h = useApp((s) => s.nudgeHud);
  if (!h) return null;
  return (
    <div key={h.n} data-testid="nudge-hud" role="status" className="anim-rise"
      style={{ position: 'absolute', bottom: 118, left: '50%', transform: 'translateX(-50%)', zIndex: 13, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-inverse-bg)', color: 'var(--color-inverse-text)', padding: '8px 16px', borderRadius: 999, boxShadow: 'var(--shadow-lift)', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
      {h.keys.map((k, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && <span style={{ opacity: 0.6 }}>+</span>}
          <kbd style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(253,252,250,.14)', border: '1px solid rgba(253,252,250,.25)', direction: 'ltr' }}>{k}</kbd>
        </span>
      ))}
      <span style={{ paddingInlineStart: 6 }}>{h.msg}</span>
    </div>
  );
}

/** ⋯ on hover / selection: same menu as the right click, for trackpads and touch (UPDATE-1 أ3). */
function DotsButton({ id, z }: { id: string; z: number }) {
  return (
    <button data-handle="1" data-testid="item-dots" title="خيارات"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerEnter={() => hoverIn(id)}
      onPointerLeave={() => hoverOut(id)}
      onClick={(e) => {
        e.stopPropagation();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        openItemsMenu(r.right, r.bottom + 4, id);
      }}
      style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 8 / z, transform: `scale(${1 / z})`, transformOrigin: '0 100%', width: 30, height: 30, borderRadius: 8, border: 'none', background: 'rgba(20,18,16,.62)', color: '#fdfcfa', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 5, pointerEvents: 'auto' }}>
      <Icon name="more" size={16} />
    </button>
  );
}

const CURSOR: Record<Handle, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' };
/** Gap between the item's edge and its handles, in screen px. */
const HANDLE_GAP = 6;

/**
 * Corner and side handles of the selected item, all outside its edge (UPDATE-3 §3.2), so a press
 * anywhere inside the item always moves it. Hit area 18×36 (sides) / 22×22 (corners) on screen.
 * Double-click: default size.
 */
function Handles({ it, z }: { it: Item; z: number }) {
  const s = 1 / z;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
      {handlesFor(it.kind).map((h) => {
        const side = h.length === 1;
        const vertical = h === 'e' || h === 'w';
        const [vw, vh] = side ? (vertical ? [8, 24] : [24, 8]) : [12, 12];
        const [hw, hh] = side ? (vertical ? [18, 36] : [36, 18]) : [22, 22];
        // centre of the visible mark, measured from the item's box (screen px scaled to world)
        const ox = h.includes('e') ? `calc(100% + ${(HANDLE_GAP + vw / 2) * s}px)` : h.includes('w') ? `${-(HANDLE_GAP + vw / 2) * s}px` : '50%';
        const oy = h.includes('s') ? `calc(100% + ${(HANDLE_GAP + vh / 2) * s}px)` : h.includes('n') ? `${-(HANDLE_GAP + vh / 2) * s}px` : '50%';
        return (
          <span key={h} data-handle={h} data-testid={`handle-${h}`} className="board-handle" onPointerDown={(e) => onHandleDown(e, it.id, h)} onDoubleClick={(e) => (e.stopPropagation(), resetSize(it.id))}
            style={{ position: 'absolute', left: ox, top: oy, width: hw * s, height: hh * s, marginLeft: (-hw / 2) * s, marginTop: (-hh / 2) * s, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto', touchAction: 'none', cursor: CURSOR[h] }}>
            <i style={{ width: vw * s, height: vh * s, boxSizing: 'border-box', background: 'var(--color-bg)', border: `${2 * s}px solid var(--color-accent)`, borderRadius: 3 * s, display: 'block' }} />
          </span>
        );
      })}
    </div>
  );
}

/** In-place text editing for scene names, headings, frame titles, image captions. */
function InlineText({ value, onDone, style, multiline, testid }: { value: string; onDone: (v: string | null) => void; style: React.CSSProperties; multiline?: boolean; testid: string }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(save ? v : null);
  };
  const common = {
    ref, value: v, 'data-testid': testid,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: () => finish(true),
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter' && (!multiline || !e.shiftKey)) (e.preventDefault(), finish(true));
      if (e.key === 'Escape') (e.preventDefault(), finish(false));
    },
    style: { ...style, border: '1px solid var(--color-accent)', borderRadius: 6, background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', width: '100%', boxSizing: 'border-box' as const, resize: 'none' as const },
  };
  return multiline ? <textarea rows={Math.max(1, v.split('\n').length)} {...common} /> : <input {...common} />;
}

function endRename(apply: (v: string) => void) {
  return (v: string | null) => {
    setState({ renaming: null });
    if (v !== null) apply(v);
  };
}

/** Card content; memoised so dragging one card doesn't redraw the others. */
const CardBody = memo(function CardBody({ p, c, on, theme, size, renaming, z }: { p: PProject; c: PCard; on: boolean; theme: 'light' | 'dark'; size?: { w: number; h?: number; ph?: number }; renaming: boolean; z: number }) {
  const L = p.library;
  const scenesOf = (test: (s: PScene) => boolean) => p.scenes.filter(test).length;
  const shadow = sel(on);
  const W = size?.w ?? c.w ?? DEFAULT_SIZE[c.kind][0];
  // photo height: dragged now, else stored, else following the width (UPDATE-3 §3.2)
  const PH = () => size?.ph ?? photoHeight({ id: c.id, kind: c.kind, z: 0, locked: false, card: c }, W);
  const setText = (field: 'text', v: string) => v !== c.text && commit([{ op: 'update', entity: 'boardCards', id: c.id, fields: { [field]: v } }], { history: 'تعديل النص' });
  if (c.kind === 'note') {
    const n = p.notes.find((x) => x.id === c.refId);
    if (!n) return null;
    const si = p.scenes.findIndex((s) => s.noteIds.includes(n.id));
    const col = cardColors(c.color, theme);
    const H = size?.h ?? c.h;
    return (
      <div data-component="NoteCard" data-color={c.color ?? undefined} style={{ width: W, minHeight: H ? undefined : 110, height: H ?? undefined, background: col?.bg ?? 'var(--color-surface-strong)', color: col?.fg ?? 'var(--color-text)', borderRadius: 4, boxShadow: shadow, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, cursor: 'grab', overflow: 'hidden', boxSizing: 'border-box' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, opacity: col ? 0.75 : 1, color: col ? undefined : 'var(--color-text-muted)' }}><Icon name="file" size={13} />ملاحظة</span>
        <span style={{ flex: 1, minHeight: 0, fontFamily: 'var(--font-serif-text)', fontSize: 16, lineHeight: 1.6, opacity: n.text ? 1 : 0.6, whiteSpace: 'pre-wrap', overflow: 'hidden', WebkitMaskImage: H ? 'linear-gradient(#000 calc(100% - 28px), transparent)' : undefined, maskImage: H ? 'linear-gradient(#000 calc(100% - 28px), transparent)' : undefined }}>{(n.text as string) || 'ملاحظة فارغة'}</span>
        {si > -1 && <span style={{ fontSize: 12, color: col ? col.accent : 'var(--tan-600)' }}>{`مرتبطة بالمشهد ${pad2(si + 1)}`}</span>}
      </div>
    );
  }
  if (c.kind === 'character') {
    const ch = L.characters.find((x) => x.id === c.refId);
    if (!ch) return null;
    const av = avatar(ch);
    return (
      <div data-component="CharacterCard" style={{ width: W, background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: 14, boxShadow: shadow, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', cursor: 'grab', boxSizing: 'border-box' }}>
        <span data-testid="char-avatar" data-where="card" style={{ width: 64, height: 64, borderRadius: '50%', background: av.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26, color: '#141210' }}>{av.init}</span>
        <span style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 18 }}>{ch.name as string}</span>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{ch.role as string}</span>
        <span style={{ fontSize: 13, lineHeight: 1.6 }}>{ch.description as string}</span>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{`${scenesOf((s) => s.characterIds.includes(ch.id))} مشاهد`}</span>
      </div>
    );
  }
  if (c.kind === 'location') {
    const l = L.locations.find((x) => x.id === c.refId);
    if (!l) return null;
    return (
      <div data-component="LocationCard" style={{ width: W, background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: 14, boxShadow: shadow, overflow: 'hidden', cursor: 'grab', boxSizing: 'border-box' }}>
        <div data-photo="1" style={{ height: PH(), background: frameBg(coverOf(l), '#d2a06a') }} />
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 17 }}><Icon name="map-pin" size={15} />{l.name as string}</span>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{(l.address as string) || 'بلا عنوان'}</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{`${scenesOf((s) => s.locationId === l.id)} مشاهد`}</span>
        </div>
      </div>
    );
  }
  if (c.kind === 'moodboard') {
    const m = L.moodboards.find((x) => x.id === c.refId);
    if (!m) return null;
    const sw = (m.swatches as string[]) ?? [];
    const imgs = [...m.images.slice(0, 4)];
    while (imgs.length < 4) imgs.push(null as never);
    const tile = Math.max(1, (PH() - 4) / 2);
    return (
      <div data-component="MoodboardCard" style={{ width: W, background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: 14, boxShadow: shadow, padding: 10, display: 'flex', flexDirection: 'column', gap: 10, cursor: 'grab', boxSizing: 'border-box' }}>
        <div data-photo="1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {imgs.map((im, i) => <div key={i} style={{ height: tile, borderRadius: 4, background: im ? frameBg(im, sw[i % Math.max(1, sw.length)] || '#d2a06a') : 'var(--color-surface-strong)' }} />)}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {sw.map((s, i) => <span key={i} style={{ flex: 1, height: 16, borderRadius: 3, background: s, border: '1px solid var(--color-border-subtle)' }} />)}
        </div>
        <span style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 16, padding: '0 4px 4px' }}>{m.title as string}</span>
      </div>
    );
  }
  if (c.kind === 'image') {
    const meta = engine.images.get(c.refId);
    const img = { imageId: c.refId, placeholder: meta?.placeholder ?? null };
    return (
      <div data-component="ImageCard" style={{ width: W, background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: 10, boxShadow: shadow, overflow: 'hidden', cursor: 'grab', boxSizing: 'border-box' }}>
        <div data-photo="1" style={{ height: PH(), background: img.placeholder ? frameBg(img, '#c27a32') : `center / cover no-repeat url("${imageUrl(c.refId, W <= 480)}"), #1c1916` }} />
        {renaming ? (
          <div style={{ padding: 6 }}><InlineText value={c.text} testid="caption-input" style={{ fontSize: 13, padding: '4px 6px' }} onDone={endRename((v) => setText('text', v))} /></div>
        ) : c.text ? <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{c.text}</div> : null}
      </div>
    );
  }
  if (c.kind === 'heading') {
    const font = size?.h ?? c.h ?? DEFAULT_SIZE.heading[1];
    const color = headingColor(c.color, theme);
    const width = size?.w ?? c.w ?? undefined;
    return (
      <div data-component="HeadingCard" style={{ width: width ?? 'max-content', maxWidth: width ? undefined : 900, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: font, lineHeight: 1.1, color: color ?? 'var(--color-text)', cursor: 'grab', padding: '4px 6px', borderRadius: 6, boxShadow: on ? '0 0 0 2px var(--color-accent)' : 'none', whiteSpace: 'pre-wrap', boxSizing: 'border-box' }}>
        {renaming ? <InlineText value={c.text} multiline testid="heading-input" style={{ fontFamily: 'inherit', fontWeight: 900, fontSize: font, lineHeight: 1.1, padding: 0 }} onDone={endRename((v) => setText('text', v.trim() || 'عنوان'))} /> : c.text || 'عنوان'}
      </div>
    );
  }
  // frame
  const col = cardColors(c.color, theme);
  const hex = col?.accent ?? 'var(--tan-500)';
  const H = size?.h ?? c.h ?? DEFAULT_SIZE.frame[1];
  const grab = (e: React.PointerEvent) => onItemDown(e, c.id);
  const edge: React.CSSProperties = { position: 'absolute', pointerEvents: 'auto', cursor: 'grab' };
  return (
    <div data-component="FrameCard" style={{ width: W, height: H, position: 'relative', borderRadius: 18, background: col ? `color-mix(in srgb, ${col.accent} 9%, transparent)` : 'rgba(210,160,106,.07)', border: `1.5px solid ${col ? `color-mix(in srgb, ${col.accent} 45%, transparent)` : 'rgba(210,160,106,.35)'}`, boxShadow: on ? '0 0 0 2px var(--color-accent)' : 'none', boxSizing: 'border-box' }}>
      {/* only the title and the rim take the pointer: inside, a drag selects what the frame holds */}
      {/* the rim: 14px on screen at any zoom, inside the frame's edge; the handles sit outside it (UPDATE-3 §3.2) */}
      <span onPointerDown={grab} data-testid="frame-edge" style={{ ...edge, top: 0, left: 0, right: 0, height: 14 / z }} />
      <span onPointerDown={grab} style={{ ...edge, bottom: 0, left: 0, right: 0, height: 14 / z }} />
      <span onPointerDown={grab} style={{ ...edge, top: 0, bottom: 0, left: 0, width: 14 / z }} />
      <span onPointerDown={grab} style={{ ...edge, top: 0, bottom: 0, right: 0, width: 14 / z }} />
      <span data-testid="frame-title" onPointerDown={grab} onDoubleClick={(e) => (e.stopPropagation(), setState({ renaming: { kind: 'card', id: c.id }, selection: [c.id] }))}
        style={{ ...edge, top: -17, right: 18, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-bg)', border: `1.5px solid ${col ? `color-mix(in srgb, ${col.accent} 60%, transparent)` : 'rgba(210,160,106,.55)'}`, borderRadius: 999, padding: '4px 14px', fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', color: 'var(--color-text)' }}>
        <i style={{ width: 9, height: 9, borderRadius: '50%', background: hex, display: 'block' }} />
        {renaming ? <InlineText value={c.text} testid="frame-title-input" style={{ fontFamily: 'inherit', fontWeight: 700, fontSize: 15, padding: '0 4px', minWidth: 160 }} onDone={endRename((v) => setText('text', v.trim() || 'إطار'))} /> : c.text || 'إطار'}
      </span>
    </div>
  );
});

/** Scene card content; memoised so dragging one card doesn't redraw the others. */
const SceneBody = memo(function SceneBody({ p, sc, si, on, w, ph, renaming }: { p: PProject; sc: PScene; si: number; on: boolean; w: number; ph?: number; renaming: boolean }) {
  const hex = moodHex(sc.mood);
  const loc = p.library.locations.find((l) => l.id === sc.locationId);
  const n = sc.shots.length;
  const ar = AR[p.aspect] || 16 / 9;
  return (
    <div style={{ width: w }}>
      <div data-flip={`scene-${sc.id}`} data-component="SceneCard" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderInlineStart: `4px solid ${hex}`, borderRadius: 14, overflow: 'hidden', boxShadow: sel(on), cursor: 'grab' }}>
        <div data-photo="1" style={{ position: 'relative', height: ph ?? photoHeight({ id: sc.id, kind: 'scene', z: 0, locked: false, scene: sc }, w), background: frameBg(sceneCover(sc), hex) }}>
          <span style={{ position: 'absolute', top: 10, insetInlineEnd: 14, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 46, lineHeight: 1, color: '#fdfcfa', textShadow: '0 2px 10px rgba(0,0,0,.55)' }}>{pad2(si + 1)}</span>
        </div>
        <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {renaming
            ? <InlineText value={sc.name} testid="scene-name-input" style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 18, padding: '2px 6px' }} onDone={endRename((v) => v.trim() && v.trim() !== sc.name && commit([{ op: 'update', entity: 'scenes', id: sc.id, fields: { name: v.trim() } }], { history: 'إعادة التسمية' }))} />
            : <span data-testid="board-scene-name" style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 19, lineHeight: 1.3 }}>{sc.name}</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Badge tone="outline">{`${sc.intExt === 'int' ? 'داخلي' : 'خارجي'} · ${sc.dayNight === 'night' ? 'ليل' : 'نهار'}`}</Badge>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: loc ? 'var(--color-text)' : 'var(--color-text-muted)' }}><Icon name="map-pin" size={14} />{loc ? (loc.name as string) : 'بلا موقع'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', paddingInlineEnd: 6 }}>
              {sc.characterIds.map((id) => p.library.characters.find((c) => c.id === id)).filter(Boolean).map((c) => {
                const a = avatar(c!);
                return <span key={c!.id} data-testid="char-avatar" data-where="scene" style={{ width: 26, height: 26, borderRadius: '50%', background: a.bg, border: '2px solid var(--color-bg)', marginInlineEnd: -7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#141210' }}>{a.init}</span>;
              })}
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--color-text-muted)' }}><Icon name="film" size={14} />{`${n} ${n === 1 ? 'لقطة' : 'لقطات'} · ${mmss(sceneDur(sc))}`}</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap', paddingInlineStart: 4 }}>
        {sc.shots.map((sh) => (
          <div key={sh.id} data-flip={`shot-${sh.id}`} title="فتح اللقطة"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => (e.stopPropagation(), openEditor('shot', sh.id))}
            onDragOver={(e) => { if (currentDrag()?.kind === 'idea') { e.preventDefault(); e.stopPropagation(); } }}
            onDrop={(e) => dropOnShot(e, sh.id)}
            style={{ width: ar >= 1 ? 46 : 22, height: ar >= 1 ? Math.round(46 / ar) : 38, borderRadius: 3, background: frameBg(coverOf(sh), hex), cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
        ))}
      </div>
    </div>
  );
});

/** Zoom + alignment controls (SPEC 7ب.3/7ب.4: magnet and auto-arrange next to zoom). */
export function ZoomControls() {
  const z = useApp((s) => s.view.z);
  const snap = useApp((s) => s.settings?.boardSnap ?? true);
  const offline = useApp((s) => s.offline);
  const btn: React.CSSProperties = { width: 30, height: 30, border: 'none', background: 'transparent', borderRadius: 4, cursor: 'pointer', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
  return (
    <div data-component="ZoomControls" style={{ position: 'absolute', bottom: 22, insetInlineEnd: 18, zIndex: 12, display: 'flex', alignItems: 'center', gap: 2, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, boxShadow: 'var(--shadow-card)', padding: 4 }}>
      <button title="ملاءمة الكل" className="h-strong" onClick={fitAll} style={{ ...btn, width: 'auto', padding: '0 10px', fontSize: 13, fontWeight: 600 }}>ملاءمة الكل</button>
      <span style={{ width: 1, height: 18, background: 'var(--color-border)' }} />
      <button title="تكبير" className="h-strong" onClick={() => zoomBy(1.2)} style={btn}><Icon name="plus" size={15} /></button>
      <span style={{ minWidth: 46, textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{Math.round(z * 100) + '%'}</span>
      <button title="تصغير" className="h-strong" onClick={() => zoomBy(1 / 1.2)} style={btn}><Icon name="minus" size={15} /></button>
      <span style={{ width: 1, height: 18, background: 'var(--color-border)' }} />
      <button title={snap ? 'المحاذاة: تعمل' : 'المحاذاة: متوقفة'} aria-pressed={snap} data-testid="snap-toggle" className="h-strong" onClick={() => void setBoardSnap(!snap)}
        style={{ ...btn, color: snap ? 'var(--tan-600)' : 'var(--color-text-muted)', background: snap ? 'var(--color-accent-soft)' : 'transparent' }}>
        <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true">
          <path d="M6 4v7a6 6 0 0 0 12 0V4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M6 4h3.5v7a2.5 2.5 0 0 0 5 0V4H18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M6 8h3.5M14.5 8H18" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </button>
      <button title="ترتيب تلقائي" data-testid="auto-arrange" className="h-strong" disabled={offline} onClick={autoArrange} style={btn}>
        <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true">
          {[[4, 4], [13.5, 4], [4, 13.5], [13.5, 13.5]].map(([x, y]) => <rect key={`${x}${y}`} x={x} y={y} width="6.5" height="6.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.7" />)}
        </svg>
      </button>
    </div>
  );
}
