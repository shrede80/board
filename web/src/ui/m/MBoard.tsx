import { useEffect } from 'react';
import { centerWorldRef, createFromTemplate, deleteSelection, redo, setBoardSnap, undo } from '../../app/actions';
import { autoArrange, fitAll, itemOf, openItem, zoom100, zoomBy, zoomToSelection } from '../../app/board';
import { addCard, alignSel, copySelection, distributeSel, duplicateSelection, hasClipboard, itemsMenu, paste, pickImages, selectAll, setLocked, startRename } from '../../app/boardActions';
import { sceneAddMenu } from '../../app/templates';
import { getState, openMenu, setState, useApp, useProject, type MenuEntry } from '../../app/state';
import { Icon } from '../../ds/ds';
import { BoardCanvas } from '../Board';
import { FilterBar } from './MProject';
import { Sheet, SheetRow } from './kit';

/**
 * «لوحة الأفكار» on the phone (UPDATE-4 ب): the same board as the laptop, by finger. The canvas is
 * the laptop's (items, handles, guides, magnet, long-press menu); this file adds the touch chrome:
 * «+ عنصر», «تحديد» (multi-select), undo / redo, fit, and a bar for what is selected.
 */
export function MBoard() {
  const p = useProject();
  const pid = p?.id;
  useEffect(() => {
    // the board layer is live while this tab is open; the other tabs restore the storyboard layer
    const prev = getState().mode;
    setState({ mode: 'board' });
    const t = setTimeout(fitAll, 80);
    return () => {
      clearTimeout(t);
      setState({ mode: prev, selection: [], boardSelect: false, boardSheet: null, popMenu: null });
    };
  }, [pid]);
  if (!p) return null;
  return (
    <div data-testid="m-board" style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', borderTop: '1px solid var(--color-border-subtle)' }}>
      <BoardCanvas />
      <div style={{ position: 'absolute', top: 6, left: 10, right: 10, zIndex: 13 }}><FilterBar p={p} /></div>
      <BoardBars />
      <BoardSheets />
    </div>
  );
}

const barBtn = (on = false, wide = false): React.CSSProperties => ({
  minWidth: 44, height: 44, padding: wide ? '0 12px' : 0, flexShrink: 0, border: 'none', borderRadius: 12,
  background: on ? 'var(--color-accent)' : 'transparent', color: on ? '#141210' : 'var(--color-text)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
});
const pill: React.CSSProperties = {
  display: 'flex', gap: 4, padding: 5, background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: 16,
  boxShadow: 'var(--shadow-lift)', maxWidth: 'calc(100% - 20px)', overflowX: 'auto', scrollbarWidth: 'none',
};

function BoardBars() {
  const sel = useApp((s) => s.selection);
  const select = useApp((s) => s.boardSelect);
  const offline = useApp((s) => s.offline);
  const canUndo = useApp((s) => s.canUndo), canRedo = useApp((s) => s.canRedo);
  const dragging = useApp((s) => !!s.dragPos);
  useApp((s) => s.dataVersion);
  const n = sel.length;
  const items = sel.map((id) => itemOf(id)).filter((x): x is NonNullable<ReturnType<typeof itemOf>> => !!x);
  const allLocked = !!items.length && items.every((i) => i.locked);
  const one = items.length === 1 ? items[0] : null;
  const pop = (e: React.MouseEvent, entries: MenuEntry[], id: string) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu(r.right, r.top - 8, entries, id);
  };
  const align: MenuEntry[] = [
    { label: 'يمين', run: () => alignSel('right'), testid: 'm-align-right' }, { label: 'وسط أفقي', run: () => alignSel('hcenter'), testid: 'm-align-hcenter' }, { label: 'يسار', run: () => alignSel('left'), testid: 'm-align-left' },
    { label: 'أعلى', run: () => alignSel('top'), testid: 'm-align-top' }, { label: 'منتصف عمودي', run: () => alignSel('vmiddle'), testid: 'm-align-vmiddle' }, { label: 'أسفل', run: () => alignSel('bottom'), testid: 'm-align-bottom' },
  ];
  const dist: MenuEntry[] = [
    { label: 'توزيع أفقي', run: () => distributeSel('h'), testid: 'm-dist-h' },
    { label: 'توزيع عمودي', run: () => distributeSel('v'), testid: 'm-dist-v' },
  ];
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 10, zIndex: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none', opacity: dragging ? 0.35 : 1, transition: 'opacity 150ms' }}>
      {n > 0 && (
        <div data-testid="m-board-selbar" style={{ ...pill, pointerEvents: 'auto' }}>
          {n > 1 && <span data-testid="m-board-count" aria-label={`${n} محددة`} style={{ ...barBtn(true), cursor: 'default', fontSize: 15 }}>{n}</span>}
          {one && <button data-testid="m-board-open" aria-label="فتح" onClick={() => (one.scene || (one.card && ['note', 'character', 'location', 'moodboard'].includes(one.kind)) ? openItem(one.id) : startRename(one.id))} style={barBtn(false, true)}><Icon name="edit" size={18} />فتح</button>}
          {n > 1 && <button data-testid="m-board-align" aria-label="محاذاة" disabled={offline} onClick={(e) => pop(e, align, 'm-board-align-menu')} style={barBtn(false, true)}><Icon name="align-h" size={18} />محاذاة</button>}
          {n > 2 && <button data-testid="m-board-dist" aria-label="توزيع" disabled={offline} onClick={(e) => pop(e, dist, 'm-board-dist-menu')} style={barBtn()}><Icon name="distribute" size={19} /></button>}
          <button data-testid="m-board-dup" aria-label="تكرار" disabled={offline} onClick={() => duplicateSelection()} style={barBtn()}><Icon name="repeat" size={19} /></button>
          <button data-testid="m-board-lock" aria-label={allLocked ? 'فك القفل' : 'قفل'} aria-pressed={allLocked} disabled={offline} onClick={() => setLocked(sel, !allLocked)} style={barBtn(allLocked)}><Icon name={allLocked ? 'unlock' : 'lock'} size={19} /></button>
          <button data-testid="m-board-menu" aria-label="المزيد" onClick={(e) => pop(e, itemsMenu(sel), 'item-menu')} style={barBtn()}><Icon name="more" size={19} /></button>
          <button data-testid="m-board-delete" aria-label="حذف" disabled={offline} onClick={() => deleteSelection()} style={{ ...barBtn(), color: 'var(--color-danger)' }}><Icon name="trash" size={19} /></button>
        </div>
      )}
      <div style={{ ...pill, pointerEvents: 'auto' }}>
        <button data-testid="m-board-add" disabled={offline} onClick={() => setState({ boardSheet: 'add' })} style={{ ...barBtn(true, true), background: 'var(--color-accent)', color: '#141210' }}><Icon name="plus" size={18} />عنصر</button>
        <button data-testid="m-board-select" aria-pressed={select} onClick={() => setState({ boardSelect: !select })} style={barBtn(select, true)}><Icon name="check" size={18} />تحديد</button>
        <button data-testid="m-board-undo" aria-label="تراجع" disabled={!canUndo || offline} onClick={() => void undo()} style={{ ...barBtn(), opacity: canUndo ? 1 : 0.35 }}><Icon name="arrow-right" size={19} /></button>
        <button data-testid="m-board-redo" aria-label="إعادة" disabled={!canRedo || offline} onClick={() => void redo()} style={{ ...barBtn(), opacity: canRedo ? 1 : 0.35 }}><Icon name="arrow-left" size={19} /></button>
        <button data-testid="m-board-fit" aria-label="ملاءمة الكل" onClick={fitAll} style={barBtn()}><Icon name="maximize" size={19} /></button>
        <button data-testid="m-board-more" aria-label="المزيد" onClick={() => setState({ boardSheet: 'more' })} style={barBtn()}><Icon name="more" size={19} /></button>
      </div>
    </div>
  );
}

const ADD: { type: 'scene' | 'note' | 'heading' | 'image' | 'frame' | 'character' | 'location' | 'moodboard'; label: string; icon: string; testid: string }[] = [
  { type: 'scene', label: 'مشهد', icon: 'film', testid: 'm-board-add-scene' },
  { type: 'note', label: 'ملاحظة', icon: 'file', testid: 'm-board-add-note' },
  { type: 'heading', label: 'عنوان', icon: 'heading', testid: 'm-board-add-heading' },
  { type: 'image', label: 'صورة', icon: 'image', testid: 'm-board-add-image' },
  { type: 'frame', label: 'إطار', icon: 'frame', testid: 'm-board-add-frame' },
  { type: 'character', label: 'شخصية', icon: 'user', testid: 'm-board-add-character' },
  { type: 'location', label: 'موقع', icon: 'map-pin', testid: 'm-board-add-location' },
  { type: 'moodboard', label: 'لوحة مزاج', icon: 'image', testid: 'm-board-add-moodboard' },
];

function BoardSheets() {
  const sheet = useApp((s) => s.boardSheet);
  const snap = useApp((s) => s.settings?.boardSnap ?? true);
  const z = useApp((s) => s.view.z);
  const offline = useApp((s) => s.offline);
  const p = useProject();
  const sel = useApp((s) => s.selection);
  const close = () => setState({ boardSheet: null });
  if (!sheet || !p) return null;
  const add = (type: (typeof ADD)[number]['type']) => {
    close();
    // in the middle of what the finger sees
    const pos = centerWorldRef();
    if (type === 'heading' || type === 'frame') addCard(type, pos);
    else if (type === 'image') pickImages(pos);
    else if (type === 'scene') void sceneAddMenu(window.innerWidth / 2 + 120, window.innerHeight / 2, () => createFromTemplate('scene', { where: 'center' }), { pos, open: false });
    else createFromTemplate(type, { where: 'center' });
  };
  if (sheet === 'add') {
    return (
      <Sheet onClose={close} testid="m-board-add-sheet" title="أضف للوحة">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, paddingBottom: 6 }}>
          {ADD.map((a) => (
            <button key={a.type} data-testid={a.testid} disabled={offline} onClick={() => add(a.type)}
              style={{ minHeight: 78, border: '1px solid var(--color-border-subtle)', borderRadius: 14, background: 'var(--color-surface)', color: 'var(--color-text)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
              <Icon name={a.icon} size={22} />{a.label}
            </button>
          ))}
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet onClose={close} testid="m-board-more-sheet" title="اللوحة">
      <SheetRow icon="grid" label="ترتيب تلقائي" disabled={offline} onClick={() => (close(), autoArrange())} testid="m-board-arrange" />
      <SheetRow icon="check" label={snap ? 'المحاذاة والمغناطيس: تعمل' : 'المحاذاة والمغناطيس: متوقفة'} onClick={() => void setBoardSnap(!snap)} testid="m-board-snap" />
      <SheetRow icon="plus" label="تكبير" sub={`${Math.round(z * 100)}%`} onClick={() => zoomBy(1.25)} testid="m-board-zoom-in" />
      <SheetRow icon="minus" label="تصغير" onClick={() => zoomBy(0.8)} testid="m-board-zoom-out" />
      <SheetRow icon="maximize" label="حجم 100%" onClick={() => (close(), zoom100())} testid="m-board-zoom-100" />
      <SheetRow icon="frame" label="تكبير على المحدد" disabled={!sel.length} onClick={() => (close(), zoomToSelection())} testid="m-board-zoom-sel" />
      <SheetRow icon="frame" label="تحديد الكل" onClick={() => (close(), selectAll())} testid="m-board-select-all" />
      <SheetRow icon="copy" label="نسخ" disabled={!sel.length} onClick={() => (close(), copySelection())} testid="m-board-copy" />
      <SheetRow icon="x" label="قص" disabled={!sel.length || offline} onClick={() => (close(), copySelection(true))} testid="m-board-cut" />
      <SheetRow icon="clipboard" label="لصق" disabled={!hasClipboard() || offline} onClick={() => (close(), paste(centerWorldRef()))} testid="m-board-paste" />
    </Sheet>
  );
}
