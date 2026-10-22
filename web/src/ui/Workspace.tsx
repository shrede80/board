import { createFromTemplate } from '../app/actions';
import { tip } from '../app/keyLabels';
import { addCard, pickImages } from '../app/boardActions';
import { dragEnd, dragStart } from '../app/dnd';
import { useEffect, useRef } from 'react';
import { develop, fillRhythm, firstTime, staggerIn } from '../app/motion';
import { getState, setState, useApp, useProject } from '../app/state';
import { EmptyState, Icon } from '../ds/ds';
import { BOARD_ONLY, TPL, type TplType } from '../lib/constants';
import { BoardCanvas, ZoomControls } from './Board';
import { EditorPanel } from './Editor';
import { LibraryPanel } from './Library';
import { StoryboardView } from './Storyboard';

export function Workspace() {
  const mode = useApp((s) => s.mode);
  const editor = useApp((s) => s.editor);
  const openSeq = useApp((s) => s.openSeq);
  // opening a project (UPDATE-3 §5): the cards rise in, the photos «develop», the rhythm bar fills.
  // Once per opening: polling and other devices' changes never replay it.
  useEffect(() => {
    if (!openSeq) return;
    const t = setTimeout(() => openingMotion(getState().mode, openSeq), 70);
    return () => clearTimeout(t);
  }, [openSeq]);
  useEffect(() => {
    if (openSeq && mode === 'storyboard') openingMotion('storyboard', openSeq, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
      <LibraryPanel />
      <main data-component="Workspace" style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
        <BoardCanvas />
        <StoryboardView />
        <FilterBanner />
        {mode === 'board' && <ZoomControls />}
        <TemplateDock />
      </main>
      {editor && <EditorPanel />}
    </div>
  );
}

function openingMotion(layer: 'board' | 'storyboard', seq: number, switched = false) {
  if (!firstTime(`${layer}:${seq}`)) return;
  const root = document.querySelector(`[data-layer="${layer}"]`);
  if (!root) return;
  if (layer === 'storyboard') {
    fillRhythm([...root.querySelectorAll('[data-rhythm-seg]')]);
    if (!switched) staggerIn([...root.querySelectorAll('[data-testid=shot-card]')].filter(inView));
  } else if (!switched) staggerIn([...root.querySelectorAll('[data-item]')].filter(inView));
  develop([...root.querySelectorAll('[data-photo], [data-testid=shot-card] > div:first-child')].filter(inView));
}
const inView = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
};

function FilterBanner() {
  const p = useProject();
  const f = useApp((s) => s.filter);
  const mode = useApp((s) => s.mode);
  if (!p || !f) return null;
  const e = f.kind === 'character' ? p.library.characters.find((c) => c.id === f.id) : p.library.locations.find((l) => l.id === f.id);
  const count = p.scenes.filter((sc) => (f.kind === 'character' ? sc.characterIds.includes(f.id) : sc.locationId === f.id)).length;
  const isBoard = mode === 'board';
  return (
    <>
      <div data-component="FilterBanner" data-testid="filter-banner" style={{ position: 'absolute', top: isBoard ? 14 : 84, left: '50%', transform: 'translateX(-50%)', zIndex: 12, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--color-inverse-bg)', color: 'var(--color-inverse-text)', padding: '8px 10px 8px 16px', borderRadius: 999, boxShadow: 'var(--shadow-lift)', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>
        <span style={{ paddingInlineStart: 6 }}>{`تعرض: مشاهد ${e ? (e.name as string) : f.label ?? ''} (${count})`}</span>
        <button title="إلغاء الفلتر" onClick={() => setState({ filter: null })} style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(128,128,128,.25)', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="x" size={14} /></button>
      </div>
      {count === 0 && isBoard && (
        <div style={{ position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 12, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 14, boxShadow: 'var(--shadow-card)' }}>
          <EmptyState icon="search" title="ما فيه مشاهد مطابقة" description="غير مرتبط بمشهد بعد." style={{ padding: '24px 32px' }} />
        </div>
      )}
    </>
  );
}

/** The dock's buttons and their «إضافة» shortcuts. */
const DOCK_CMD: Record<string, string> = { scene: 'addScene', note: 'addNote', heading: 'addHeading', image: 'addImage', frame: 'addFrame', character: 'addCharacter', location: 'addLocation', moodboard: 'addMoodboard' };

function TemplateDock() {
  const p = useProject();
  const mode = useApp((s) => s.mode);
  const offline = useApp((s) => s.offline);
  const scrolling = useApp((s) => s.sbScrolling);
  const ref = useRef<HTMLDivElement>(null);
  const mini = mode === 'storyboard' && scrolling;
  // the storyboard keeps this much free space under its last row (UPDATE-3 §2.2)
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const h = el.offsetHeight;
      if (h > 40 && h !== getState().dockH) setState({ dockH: h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mini]);
  const box: React.CSSProperties = { position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 14, background: 'var(--color-bg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lift)' };
  if (mini) {
    return (
      <button data-component="TemplateDock" data-testid="dock-mini" title="إضافة" className="h-strong anim-rise" onClick={() => setState({ sbScrolling: false })}
        style={{ ...box, width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-text)' }}>
        <Icon name="plus" size={22} />
      </button>
    );
  }
  return (
    <div ref={ref} data-component="TemplateDock" data-testid="dock" style={{ ...box, display: 'flex', gap: 2, padding: 6, borderRadius: 14 }}>
      {TPL.map((t) => {
        const boardOnly = BOARD_ONLY.includes(t.type as TplType);
        const off = offline || (boardOnly && mode !== 'board');
        return (
        <button key={t.type} draggable={!off} title={off && !offline ? 'للوحة الأفكار فقط' : tip(t.label, DOCK_CMD[t.type])} data-testid={`dock-${t.type}`} className="h-strong" disabled={off}
          onDragStart={(e) => dragStart(e, { kind: 'tpl', type: t.type })} onDragEnd={dragEnd}
          onClick={() => {
            if (t.type === 'heading' || t.type === 'frame') addCard(t.type);
            else if (t.type === 'image') pickImages();
            else createFromTemplate(t.type, { where: mode === 'board' ? 'center' : t.type === 'scene' ? 'gap' : 'library', index: p?.scenes.length ?? 0 });
          }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 10px 6px', border: 'none', background: 'transparent', borderRadius: 8, cursor: 'grab', color: 'var(--color-text)', fontSize: 12, fontWeight: 600, minWidth: 64, whiteSpace: 'nowrap', opacity: off && !offline ? 0.35 : 1 }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--color-surface-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-700)' }}><Icon name={t.icon} size={17} /></span>
          {t.label}
        </button>
        );
      })}
    </div>
  );
}
