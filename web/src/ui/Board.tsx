import { memo } from 'react';
import { openEditor, setBoardSnap } from '../app/actions';
import { autoArrange, fitAll, onBoardDown, onItemDown, setBoardEl, zoomBy } from '../app/board';
import { currentDrag, dropOnBoard, dropOnShot, hasFiles } from '../app/dnd';
import { useApp, useProject } from '../app/state';
import { coverOf, moodHex, sceneCover, sceneDur, type PProject } from '../data/project';
import { Badge, EmptyState, Icon } from '../ds/ds';
import { AR, GRID } from '../lib/constants';
import { frameBg, mmss, pad2 } from '../lib/util';
import { avatar } from './Library';

const sel = (on: boolean) => (on ? '0 0 0 2px var(--color-accent), var(--shadow-lift)' : 'var(--shadow-card)');

function useMatches() {
  const f = useApp((s) => s.filter);
  return (sc: PProject['scenes'][number]) => !f || (f.kind === 'character' ? sc.characterIds.includes(f.id) : sc.locationId === f.id);
}

export function BoardCanvas() {
  const p = useProject();
  const mode = useApp((s) => s.mode);
  const view = useApp((s) => s.view);
  const space = useApp((s) => s.space);
  const marquee = useApp((s) => s.marquee);
  const guides = useApp((s) => s.guides);
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
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden', backgroundColor: 'var(--color-bg)',
        backgroundImage: 'radial-gradient(circle, var(--board-dot) 1.2px, transparent 1.7px)', backgroundSize: `${gs}px ${gs}px`,
        backgroundPosition: `${view.x % gs}px ${view.y % gs}px`, cursor: space ? 'grab' : 'default', pointerEvents: isBoard ? 'auto' : 'none', touchAction: 'none', userSelect: 'none',
      }}
    >
      <div data-testid="world" style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
        <div style={{ opacity: isBoard ? 1 : 0, transition: `opacity 300ms var(--ease-standard) ${isBoard ? '200ms' : '0ms'}` }}>
          <Cards p={p} />
        </div>
        <div style={{ opacity: isBoard ? 1 : 0 }}>
          <SceneCards p={p} />
        </div>
        {marquee && <div style={{ position: 'absolute', left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h, border: '1px solid var(--color-accent)', background: 'var(--color-accent-soft)', opacity: 0.7, pointerEvents: 'none' }} />}
        {guides.map((g, i) => (
          <div key={i} data-testid="guide" data-dir={g.dir}
            style={g.dir === 'v'
              ? { position: 'absolute', left: g.at, top: g.from, width: 1 / view.z, height: g.to - g.from, background: 'var(--tan-600)', pointerEvents: 'none', zIndex: 50 }
              : { position: 'absolute', top: g.at, left: g.from, height: 1 / view.z, width: g.to - g.from, background: 'var(--tan-600)', pointerEvents: 'none', zIndex: 50 }} />
        ))}
      </div>
      {isBoard && !p.scenes.length && !p.cards.length && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'none' }}>
          <EmptyState icon="film" title="مشروع فارغ" description="اسحب قالب مشهد من الشريط لتبدأ." />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, marginTop: 40, color: 'var(--color-accent)' }}>
            <span style={{ width: 2, height: 120, background: 'linear-gradient(var(--color-accent),var(--color-accent)) center/2px 100% no-repeat', opacity: 0.8 }} />
            <span style={{ width: 12, height: 12, borderInlineEnd: '2px solid var(--color-accent)', borderBottom: '2px solid var(--color-accent)', transform: 'rotate(45deg)', marginTop: -10 }} />
          </div>
        </div>
      )}
    </div>
  );
}

const Cards = memo(function Cards({ p }: { p: PProject }) {
  const selection = useApp((s) => s.selection);
  const filter = useApp((s) => s.filter);
  const dragPos = useApp((s) => s.dragPos);
  return (
    <>
      {p.cards.map((c) => {
        const pos = dragPos?.[c.id] ?? { x: c.x, y: c.y };
        if (!cardTarget(p, c)) return null;
        return (
          <div key={c.id} data-item="1" data-item-id={c.id} data-flip={`card-${c.id}`} data-testid={`card-${c.kind}`} onPointerDown={(e) => onItemDown(e, c.id)}
            style={{ position: 'absolute', left: pos.x, top: pos.y, opacity: filter ? 0.3 : 1, transition: 'opacity 200ms' }}>
            <CardBody p={p} c={c} on={selection.includes(c.id)} />
          </div>
        );
      })}
    </>
  );
});


/** Does the card's item still exist? */
function cardTarget(p: PProject, c: PProject['cards'][number]) {
  const L = p.library;
  if (c.kind === 'note') return p.notes.some((x) => x.id === c.refId);
  if (c.kind === 'character') return L.characters.some((x) => x.id === c.refId);
  if (c.kind === 'location') return L.locations.some((x) => x.id === c.refId);
  return L.moodboards.some((x) => x.id === c.refId);
}

/** Card content; memoised so dragging one card doesn't redraw the others. */
const CardBody = memo(function CardBody({ p, c, on }: { p: PProject; c: PProject['cards'][number]; on: boolean }) {
  const L = p.library;
  const scenesOf = (test: (s: PProject['scenes'][number]) => boolean) => p.scenes.filter(test).length;
  const shadow = sel(on);
        let body: React.ReactNode = null;
  if (c.kind === 'note') {
    const n = p.notes.find((x) => x.id === c.refId);
    if (!n) return null;
    const si = p.scenes.findIndex((s) => s.noteIds.includes(n.id));
    body = (
      <div data-component="NoteCard" style={{ width: 210, minHeight: 110, background: 'var(--color-surface-strong)', borderRadius: 4, boxShadow: shadow, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, cursor: 'grab' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)' }}><Icon name="file" size={13} />ملاحظة</span>
        <span style={{ fontFamily: 'var(--font-serif-text)', fontSize: 16, lineHeight: 1.6, color: n.text ? 'var(--color-text)' : 'var(--color-text-muted)', whiteSpace: 'pre-wrap' }}>{(n.text as string) || 'ملاحظة فارغة'}</span>
        {si > -1 && <span style={{ fontSize: 12, color: 'var(--tan-600)' }}>{`مرتبطة بالمشهد ${pad2(si + 1)}`}</span>}
      </div>
    );
  } else if (c.kind === 'character') {
    const ch = L.characters.find((x) => x.id === c.refId);
    if (!ch) return null;
    const av = avatar(ch);
    body = (
      <div data-component="CharacterCard" style={{ width: 210, background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: 14, boxShadow: shadow, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', cursor: 'grab' }}>
        <span style={{ width: 64, height: 64, borderRadius: '50%', background: av.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26, color: '#141210' }}>{av.init}</span>
        <span style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 18 }}>{ch.name as string}</span>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{ch.role as string}</span>
        <span style={{ fontSize: 13, lineHeight: 1.6 }}>{ch.description as string}</span>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{`${scenesOf((s) => s.characterIds.includes(ch.id))} مشاهد`}</span>
      </div>
    );
  } else if (c.kind === 'location') {
    const l = L.locations.find((x) => x.id === c.refId);
    if (!l) return null;
    body = (
      <div data-component="LocationCard" style={{ width: 230, background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: 14, boxShadow: shadow, overflow: 'hidden', cursor: 'grab' }}>
        <div style={{ height: 118, background: frameBg(coverOf(l), '#d2a06a') }} />
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 17 }}><Icon name="map-pin" size={15} />{l.name as string}</span>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{(l.address as string) || 'بلا عنوان'}</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{`${scenesOf((s) => s.locationId === l.id)} مشاهد`}</span>
        </div>
      </div>
    );
  } else {
    const m = L.moodboards.find((x) => x.id === c.refId);
    if (!m) return null;
    const sw = (m.swatches as string[]) ?? [];
    const imgs = [...m.images.slice(0, 4)];
    while (imgs.length < 4) imgs.push(null as never);
    body = (
      <div data-component="MoodboardCard" style={{ width: 250, background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: 14, boxShadow: shadow, padding: 10, display: 'flex', flexDirection: 'column', gap: 10, cursor: 'grab' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {imgs.map((im, i) => <div key={i} style={{ height: 82, borderRadius: 4, background: im ? frameBg(im, sw[i % Math.max(1, sw.length)] || '#d2a06a') : 'var(--color-surface-strong)' }} />)}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {sw.map((s, i) => <span key={i} style={{ flex: 1, height: 16, borderRadius: 3, background: s, border: '1px solid var(--color-border-subtle)' }} />)}
        </div>
        <span style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 16, padding: '0 4px 4px' }}>{m.title as string}</span>
      </div>
    );
  }
  return <>{body}</>;
});

const SceneCards = memo(function SceneCards({ p }: { p: PProject }) {
  const selection = useApp((s) => s.selection);
  const editor = useApp((s) => s.editor);
  const dragPos = useApp((s) => s.dragPos);
  const matches = useMatches();
  const ar = AR[p.aspect] || 16 / 9;
  return (
    <>
      {p.scenes.map((sc, si) => {
        const pos = dragPos?.[sc.id] ?? { x: sc.boardX, y: sc.boardY };
        const on = selection.includes(sc.id) || (editor?.type === 'scene' && editor.id === sc.id);
        return (
          <div key={sc.id} data-item="1" data-item-id={sc.id} data-testid="scene-card" onPointerDown={(e) => onItemDown(e, sc.id)} style={{ position: 'absolute', left: pos.x, top: pos.y, width: 280, opacity: matches(sc) ? 1 : 0.22, transition: 'opacity 200ms' }}>
            <SceneBody p={p} sc={sc} si={si} on={on} ar={ar} />
          </div>
        );
      })}
    </>
  );
});

/** Scene card content; memoised so dragging one card doesn't redraw the others. */
const SceneBody = memo(function SceneBody({ p, sc, si, on, ar }: { p: PProject; sc: PProject['scenes'][number]; si: number; on: boolean; ar: number }) {
  const hex = moodHex(sc.mood);
  const loc = p.library.locations.find((l) => l.id === sc.locationId);
  const n = sc.shots.length;
  return (
    <>
            <div data-flip={`scene-${sc.id}`} data-component="SceneCard" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderInlineStart: `4px solid ${hex}`, borderRadius: 14, overflow: 'hidden', boxShadow: sel(on), cursor: 'grab' }}>
        <div style={{ position: 'relative', height: 150, background: frameBg(sceneCover(sc), hex) }}>
          <span style={{ position: 'absolute', top: 10, insetInlineEnd: 14, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 46, lineHeight: 1, color: '#fdfcfa', textShadow: '0 2px 10px rgba(0,0,0,.55)' }}>{pad2(si + 1)}</span>
        </div>
        <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
          <span style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 19, lineHeight: 1.3 }}>{sc.name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Badge tone="outline">{`${sc.intExt === 'int' ? 'داخلي' : 'خارجي'} · ${sc.dayNight === 'night' ? 'ليل' : 'نهار'}`}</Badge>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: loc ? 'var(--color-text)' : 'var(--color-text-muted)' }}><Icon name="map-pin" size={14} />{loc ? (loc.name as string) : 'بلا موقع'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', paddingInlineEnd: 6 }}>
              {sc.characterIds.map((id) => p.library.characters.find((c) => c.id === id)).filter(Boolean).map((c) => {
                const a = avatar(c!);
                return <span key={c!.id} style={{ width: 26, height: 26, borderRadius: '50%', background: a.bg, border: '2px solid var(--color-bg)', marginInlineEnd: -7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#141210' }}>{a.init}</span>;
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
            onDragOver={(e) => { if (currentDrag()?.kind === 'inbox') { e.preventDefault(); e.stopPropagation(); } }}
            onDrop={(e) => dropOnShot(e, sh.id)}
            style={{ width: ar >= 1 ? 46 : 22, height: ar >= 1 ? Math.round(46 / ar) : 38, borderRadius: 3, background: frameBg(coverOf(sh), hex), cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
        ))}
      </div>
    </>
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
