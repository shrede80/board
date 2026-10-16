import { createFromTemplate } from '../app/actions';
import { addCard, pickImages } from '../app/boardActions';
import { dragEnd, dragStart } from '../app/dnd';
import { setState, useApp, useProject } from '../app/state';
import { EmptyState, Icon } from '../ds/ds';
import { BOARD_ONLY, TPL, type TplType } from '../lib/constants';
import { BoardCanvas, ZoomControls } from './Board';
import { EditorPanel } from './Editor';
import { LibraryPanel } from './Library';
import { StoryboardView } from './Storyboard';

export function Workspace() {
  const mode = useApp((s) => s.mode);
  const editor = useApp((s) => s.editor);
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

function TemplateDock() {
  const p = useProject();
  const mode = useApp((s) => s.mode);
  const offline = useApp((s) => s.offline);
  return (
    <div data-component="TemplateDock" data-testid="dock" style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 14, display: 'flex', gap: 2, padding: 6, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 14, boxShadow: 'var(--shadow-lift)' }}>
      {TPL.map((t) => {
        const boardOnly = BOARD_ONLY.includes(t.type as TplType);
        const off = offline || (boardOnly && mode !== 'board');
        return (
        <button key={t.type} draggable={!off} title={off && !offline ? 'للوحة الأفكار فقط' : 'اسحب أو اضغط'} data-testid={`dock-${t.type}`} className="h-strong" disabled={off}
          onDragStart={(e) => dragStart(e, { kind: 'tpl', type: t.type })} onDragEnd={dragEnd}
          onClick={() => {
            if (t.type === 'heading' || t.type === 'frame') addCard(t.type);
            else if (t.type === 'image') pickImages();
            else createFromTemplate(t.type, { where: mode === 'board' ? 'center' : t.type === 'scene' ? 'gap' : 'library', index: p?.scenes.length ?? 0 });
          }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 10px 6px', border: 'none', background: 'transparent', borderRadius: 8, cursor: 'grab', color: 'var(--color-text)', fontSize: 12, fontWeight: 600, minWidth: 64, opacity: off && !offline ? 0.35 : 1 }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--color-surface-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-700)' }}><Icon name={t.icon} size={17} /></span>
          {t.label}
        </button>
        );
      })}
    </div>
  );
}
