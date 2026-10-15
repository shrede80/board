import { memo, useEffect, useRef } from 'react';
import { addShot, deleteShot, duplicateShot, openEditor } from '../app/actions';
import { currentDrag, dragEnd, dragStart, dropOnGap, dropOnRow, dropOnSbEmpty, dropOnShot, hasFiles, isSceneDrag, setOver } from '../app/dnd';
import { addFiles } from '../app/images';
import { getState, openMenu, setState, useApp, useEquipment, useProject } from '../app/state';
import { sceneRowMenu, shotMenu } from '../app/boardActions';
import { commit } from '../app/actions';
import { camLine, coverOf, moodHex, moveLine, sceneDur, type PProject, type PScene, type PShot } from '../data/project';
import { Badge, EmptyState, Icon } from '../ds/ds';
import { AR, STATUS } from '../lib/constants';
import { frameBg, mmss, pad2, textOn } from '../lib/util';
import type { Row } from '../../../shared/schema';

/** Space kept free under the last row so the floating template dock never covers it (SPEC §7.4). */
export const DOCK_SPACE = 150;

let sbEl: HTMLDivElement | null = null;
export function scrollToRow(id: string) {
  const row = sbEl?.querySelector<HTMLElement>(`[data-row="${id}"]`);
  if (row && sbEl) sbEl.scrollTo({ top: row.offsetTop - 90, behavior: 'smooth' });
}

export function StoryboardView() {
  const p = useProject();
  const mode = useApp((s) => s.mode);
  const flipping = useApp((s) => s.flipping);
  const filter = useApp((s) => s.filter);
  const dragOver = useApp((s) => s.dragOver);
  const ref = useRef<HTMLDivElement | null>(null);
  if (!p) return null;
  const isBoard = mode === 'board';
  const chromeOp = isBoard || flipping ? 0 : 1;
  const total = p.scenes.reduce((a, s) => a + sceneDur(s), 0);
  const nShots = p.scenes.reduce((a, s) => a + s.shots.length, 0);
  const matches = (sc: PScene) => !filter || (filter.kind === 'character' ? sc.characterIds.includes(filter.id) : sc.locationId === filter.id);
  const fCount = filter ? p.scenes.filter(matches).length : 0;
  const endOver = dragOver?.kind === 'gap' && dragOver.id === p.scenes.length;
  return (
    <div
      data-layer="storyboard"
      data-component="StoryboardView"
      data-testid="storyboard"
      ref={(el) => {
        ref.current = el;
        sbEl = el;
      }}
      onDragOver={(e) => { if (currentDrag()) e.preventDefault(); }}
      onDrop={dropOnSbEmpty}
      data-flipping={flipping ? '1' : undefined}
      style={{ ['--sb-chrome-op' as string]: chromeOp, position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden', opacity: isBoard ? 0 : 1, pointerEvents: isBoard ? 'none' : 'auto', backgroundColor: isBoard ? 'rgba(0,0,0,0)' : 'var(--color-bg)', transition: 'background-color 400ms var(--ease-standard)' }}
    >
      <div data-component="RhythmBar" style={{ position: 'sticky', top: 0, zIndex: 8, background: 'var(--color-bg)', padding: '12px 24px', borderBottom: '1px solid var(--color-border-subtle)', opacity: chromeOp, transition: 'opacity 400ms var(--ease-standard)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
          <span style={{ fontWeight: 700 }}>إيقاع الفيلم</span>
          <span>{`${p.scenes.length} مشاهد · ${nShots} لقطة · ${mmss(total)}`}</span>
        </div>
        <div style={{ display: 'flex', gap: 3, height: 30 }}>
          {p.scenes.map((sc, si) => {
            const hex = moodHex(sc.mood);
            const d = sceneDur(sc);
            return (
              <button key={sc.id} title={`${sc.name} · ${mmss(d)}`} className="h-bright" onClick={() => scrollToRow(sc.id)}
                style={{ flexGrow: Math.max(1, d), flexBasis: 0, minWidth: 24, background: hex, color: textOn(hex), border: 'none', borderRadius: 4, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 13, cursor: 'pointer', opacity: matches(sc) ? 1 : 0.3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                <span>{pad2(si + 1)}</span>
                <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 11 }}>{mmss(d)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ padding: `6px 24px ${DOCK_SPACE}px`, display: 'flex', flexDirection: 'column' }}>
        {p.scenes.map((sc, si) => (
          <SceneRow key={sc.id} p={p} sc={sc} si={si} match={matches(sc)} />
        ))}
        <div
          onDragOver={(e) => { if (!isSceneDrag(currentDrag())) return; e.preventDefault(); e.stopPropagation(); setOver({ kind: 'gap', id: p.scenes.length }); }}
          onDrop={(e) => dropOnGap(e, p.scenes.length)}
          style={{ height: 28, display: 'flex', alignItems: 'center' }}>
          <div style={{ height: endOver ? 6 : 0, width: '100%', background: 'var(--color-accent)', borderRadius: 3, opacity: endOver ? 1 : 0 }} />
        </div>
        {!p.scenes.length && <EmptyState icon="film" title="لا مشاهد بعد" description="اسحب قالب «مشهد» من الشريط وأفلته هنا." />}
        {filter && fCount === 0 && !isBoard && <EmptyState icon="search" title="لا توجد مشاهد مطابقة" description="هذا العنصر غير مرتبط بأي مشهد بعد. اسحبه من المكتبة إلى صف مشهد لربطه." />}
      </div>
    </div>
  );
}

const SceneRow = memo(function SceneRow({ p, sc, si, match }: { p: PProject; sc: PScene; si: number; match: boolean }) {
  const dragOver = useApp((s) => s.dragOver);
  const editor = useApp((s) => s.editor);
  const offline = useApp((s) => s.offline);
  const hex = moodHex(sc.mood);
  const loc = p.library.locations.find((l) => l.id === sc.locationId);
  const rowOver = dragOver?.kind === 'row' && dragOver.id === sc.id;
  const gapOver = dragOver?.kind === 'gap' && dragOver.id === si;
  const edSel = editor?.type === 'scene' && editor.id === sc.id;
  const renaming = useApp((s) => s.renaming?.kind === 'scene' && s.renaming.id === sc.id && s.renaming.where === 'row');
  const ar = AR[p.aspect] || 16 / 9;
  const cw = ar >= 1 ? 236 : 168;
  const addH = Math.round(Math.min(300, cw / ar)) + 74;
  return (
    <>
      <div
        onDragOver={(e) => { if (!isSceneDrag(currentDrag())) return; e.preventDefault(); e.stopPropagation(); setOver({ kind: 'gap', id: si }); }}
        onDrop={(e) => dropOnGap(e, si)}
        style={{ height: 16, display: 'flex', alignItems: 'center' }}>
        <div style={{ height: gapOver ? 6 : 0, width: '100%', background: 'var(--color-accent)', borderRadius: 3, opacity: gapOver ? 1 : 0, transition: 'opacity 120ms' }} />
      </div>
      <section
        data-row={sc.id}
        data-component="StoryboardRow"
        data-testid="sb-row"
        onDragOver={(e) => {
          const d = currentDrag();
          if (!d) return;
          e.preventDefault();
          e.stopPropagation();
          if (isSceneDrag(d)) setOver({ kind: 'gap', id: si });
          else setOver({ kind: 'row', id: sc.id });
        }}
        onDrop={(e) => (isSceneDrag(currentDrag()) ? dropOnGap(e, si) : dropOnRow(e, sc.id))}
        style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 280px', display: 'flex', alignItems: 'stretch', border: `1px solid ${rowOver || edSel ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`, backgroundColor: rowOver ? 'var(--color-accent-soft)' : 'var(--color-surface)', borderRadius: 14, transition: 'background-color 300ms,border-color 300ms,opacity 200ms', opacity: match ? 1 : 0.22 }}
      >
        <div data-flip={`scene-${sc.id}`} draggable title="اسحب لإعادة ترتيب المشهد" data-testid="sb-row-head"
          onDragStart={(e) => dragStart(e, { kind: 'scene', id: sc.id })} onDragEnd={dragEnd} onClick={() => openEditor('scene', sc.id)}
          style={{ width: 250, flexShrink: 0, padding: '0 18px 16px', display: 'flex', flexDirection: 'column', gap: 8, cursor: 'grab', borderInlineEnd: '1px solid var(--color-border-subtle)', background: 'var(--color-bg)', borderRadius: '0 13px 13px 0', overflow: 'hidden' }}>
          <div style={{ height: 5, background: hex, margin: '0 -18px 6px' }} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span data-testid="scene-num" style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 40, lineHeight: 1 }}>{pad2(si + 1)}</span>
            {renaming ? <RowRename id={sc.id} name={sc.name} /> : <span data-testid="row-name" style={{ flex: 1, fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 18, lineHeight: 1.3 }}>{sc.name}</span>}
            <button title="خيارات المشهد" data-testid="row-dots" disabled={offline} className="h-strong"
              onClick={(e) => {
                e.stopPropagation();
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                openMenu(r.right, r.bottom + 4, sceneRowMenu(sc.id), 'row-menu');
              }}
              style={{ alignSelf: 'center', width: 30, height: 30, flexShrink: 0, border: 'none', borderRadius: 8, background: 'transparent', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginInlineStart: 'auto' }}><Icon name="more" size={17} /></button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Badge tone="outline">{`${sc.intExt === 'int' ? 'داخلي' : 'خارجي'} · ${sc.dayNight === 'night' ? 'ليل' : 'نهار'}`}</Badge>
            <span data-testid="row-location" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: loc ? 'var(--color-text)' : 'var(--color-text-muted)' }}><Icon name="map-pin" size={14} />{loc ? (loc.name as string) : 'بلا موقع'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 13, color: 'var(--color-text-muted)', marginTop: 'auto' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="clock" size={14} />{mmss(sceneDur(sc))}</span>
            {sc.noteIds.length > 0 && <span title="ملاحظات مرتبطة" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="file" size={14} />{sc.noteIds.length}</span>}
            {sc.moodboardIds.length > 0 && <span title="لوحات مزاج مرتبطة" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="image" size={14} />{sc.moodboardIds.length}</span>}
          </div>
        </div>
        <div className="sb-shots" style={{ flex: 1, minWidth: 0, display: 'flex', gap: 14, padding: 16, overflowX: 'auto', alignItems: 'flex-start' }}>
          {sc.shots.map((sh, hi) => (
            <ShotCard key={sh.id} sh={sh} sceneId={sc.id} num={`${si + 1}.${hi + 1}`} hex={hex} ar={ar} />
          ))}
          {!sc.shots.length && (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, height: addH, padding: '0 12px', color: 'var(--color-text-muted)' }}>
              <span style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 16, color: 'var(--color-text)' }}>مشهد بلا لقطات</span>
              <span style={{ fontSize: 13 }}>أضف أول لقطة، أو اسحب لقطة من مشهد آخر.</span>
            </div>
          )}
          {/* «+ لقطة» stays fully visible at the row's end even when the shots scroll (SPEC §7.3). */}
          <div style={{ position: 'sticky', insetInlineEnd: -16, flexShrink: 0, alignSelf: 'stretch', display: 'flex', alignItems: 'flex-start', padding: '16px 16px 16px 8px', margin: '-16px -16px -16px -8px', borderStartEndRadius: 13, borderEndEndRadius: 13, background: 'var(--color-surface)', boxShadow: '10px 0 12px -10px rgba(20,18,16,.25)', zIndex: 1 }}>
            <button data-testid="add-shot" className="h-accent-text" disabled={offline} onClick={() => addShot(sc.id)}
              style={{ width: 120, minWidth: 120, height: addH, flexShrink: 0, border: '1.5px dashed var(--color-border)', borderRadius: 8, background: 'var(--color-surface)', color: 'var(--color-text-muted)', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: 'var(--sb-chrome-op)', transition: 'opacity 400ms', whiteSpace: 'nowrap' }}>
              <Icon name="plus" size={18} />
              لقطة
            </button>
          </div>
        </div>
      </section>
    </>
  );
});

const ShotCard = memo(function ShotCard({ sh, sceneId, num, hex, ar }: { sh: PShot; sceneId: string; num: string; hex: string; ar: number }) {
  const eq = useEquipment();
  const over = useApp((s) => s.dragOver?.kind === 'shot' && s.dragOver.id === sh.id);
  const selected = useApp((s) => s.editor?.type === 'shot' && s.editor.id === sh.id);
  const hov = useApp((s) => s.hoverShot === sh.id);
  const S = STATUS[sh.status] ?? STATUS.planned;
  const cov = coverOf(sh);
  const cardW = ar >= 1 ? 236 : 168, coverH = Math.round(Math.min(300, cardW / ar));
  const stop = (fn: () => void) => (e: React.MouseEvent) => (e.stopPropagation(), fn());
  const round: React.CSSProperties = { width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(20,18,16,.72)', color: '#fdfcfa', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
  const meta: React.CSSProperties = { width: 20, height: 20, borderRadius: '50%', background: 'var(--color-surface-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--ink-700)' };
  const cam = camLine(eq, sh as Row), mov = moveLine(eq, sh as Row);
  return (
    <article
      data-flip={`shot-${sh.id}`}
      data-component="ShotCard"
      data-testid="shot-card"
      data-shot-id={sh.id}
      draggable
      onDragStart={(e) => (e.stopPropagation(), dragStart(e, { kind: 'shot', id: sh.id }))}
      onDragEnd={dragEnd}
      onDragOver={(e) => {
        const d = currentDrag();
        if (!d && !hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (!d || d.kind === 'shot' || d.kind === 'inbox') setOver({ kind: 'shot', id: sh.id });
        else setOver({ kind: 'row', id: sceneId });
      }}
      onDrop={(e) => dropOnShot(e, sh.id)}
      onMouseEnter={() => getState().hoverShot !== sh.id && setState({ hoverShot: sh.id })}
      onMouseLeave={() => getState().hoverShot === sh.id && setState({ hoverShot: null })}
      onClick={() => openEditor('shot', sh.id)}
      style={{ width: cardW, flexShrink: 0, background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: 8, overflow: 'hidden', boxShadow: over || selected ? '0 0 0 2px var(--color-accent)' : 'var(--shadow-card)', cursor: 'pointer', transform: over ? 'translateX(-6px)' : 'none', transition: 'transform 150ms var(--ease-standard),box-shadow 150ms' }}
    >
      <div style={{ position: 'relative', height: coverH, background: frameBg(cov, hex) }}>
        <span data-testid="shot-num" style={{ position: 'absolute', top: 8, insetInlineEnd: 10, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26, lineHeight: 1, color: '#fdfcfa', textShadow: '0 2px 8px rgba(0,0,0,.55)' }}>{num}</span>
        {!cov && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#b9b9c2' }}>
            <Icon name="image" size={22} />
            <label onClick={(e) => e.stopPropagation()} style={{ fontSize: 12, fontWeight: 700, color: '#141210', background: '#d2a06a', padding: '5px 12px', borderRadius: 4, cursor: 'pointer' }}>
              أضف صورة
              <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { if (e.target.files) addFiles({ type: 'shot', id: sh.id }, e.target.files); e.target.value = ''; }} />
            </label>
            <span style={{ fontSize: 11 }}>أو أفلتها / الصقها هنا</span>
          </div>
        )}
        <button title="خيارات" data-testid="shot-dots" onClick={(e) => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); openMenu(r.right, r.bottom + 4, shotMenu(sh.id), 'shot-menu'); }}
          style={{ ...round, position: 'absolute', top: 8, insetInlineStart: 8, opacity: hov ? 1 : 0, transition: 'opacity 120ms' }}><Icon name="more" size={14} /></button>
        <div style={{ position: 'absolute', bottom: 8, insetInlineStart: 8, display: 'flex', gap: 6, opacity: hov ? 1 : 0, transition: 'opacity 120ms' }}>
          <button title="فتح" onClick={stop(() => openEditor('shot', sh.id))} style={round}><Icon name="edit" size={14} /></button>
          <button title="تكرار" onClick={stop(() => duplicateShot(sh.id))} style={round}><Icon name="plus" size={14} /></button>
          <button title="حذف" data-testid="shot-delete" onClick={stop(() => deleteShot(sh.id))} style={round}><Icon name="trash" size={14} /></button>
        </div>
      </div>
      <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span title={S.label} data-testid="shot-status" data-status={sh.status} style={{ width: 9, height: 9, borderRadius: '50%', background: S.dot, border: `1.5px solid ${S.ring}`, flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: sh.description ? 'var(--color-text)' : 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sh.description || 'بدون وصف'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-muted)', minWidth: 0 }}>
          <span style={meta}><Icon name="camera" size={11} /></span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cam || '—'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-muted)', minWidth: 0 }}>
          <span style={meta}><Icon name="repeat" size={11} /></span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{mov || '—'}</span>
          <span style={{ flexShrink: 0 }}>{mmss(sh.durationS)}</span>
        </div>
      </div>
    </article>
  );
});


/** Rename a scene in its row header (UPDATE-1 أ8): Enter saves, Esc cancels. */
function RowRename({ id, name }: { id: string; name: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  // focus after the menu that opened us is gone (autoFocus loses it to the closing menu)
  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.focus();
      ref.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const done = (v: string | null) => {
    if (finished.current) return;
    finished.current = true;
    setState({ renaming: null });
    const n = v?.trim();
    if (n && n !== name) commit([{ op: 'update', entity: 'scenes', id, fields: { name: n } }], { history: 'إعادة التسمية' });
  };
  return (
    <input ref={ref} defaultValue={name} data-testid="row-name-input" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} draggable={false}
      onBlur={(e) => done(e.currentTarget.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        if (e.key === 'Escape') done(null);
      }}
      style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 17, padding: '2px 6px', border: '1px solid var(--color-accent)', borderRadius: 6, background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none' }} />
  );
}
