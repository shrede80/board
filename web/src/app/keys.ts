import { isTyping } from '../lib/util';
import { closeEditor, deleteSelection, deleteShot, redo, undo } from './actions';
import { addFiles, type OwnerKind } from './images';
import { closePresent, presGo, presToggle } from './present';
import { closeMenu, getState, setState, toast } from './state';
import { openItem } from './board';
import { addImageCards, copySelection, duplicateSelection, frameSelection, hasClipboard, nudge, paste, reorderSel, selectAll, startRename } from './boardActions';

export function onKey(e: KeyboardEvent) {
  const st = getState();
  if (st.auth !== 'app') return;
  if (st.present.open) {
    if (e.key === 'Escape') closePresent();
    else if (e.key === 'ArrowLeft') presGo(st.present.i + 1);
    else if (e.key === 'ArrowRight') presGo(st.present.i - 1);
    else if (e.code === 'Space') {
      e.preventDefault();
      presToggle();
    }
    return;
  }
  if (e.key === 'Escape') {
    if (st.popMenu) return closeMenu();
    if (st.renaming) return setState({ renaming: null });
    if (st.projMenu) return setState({ projMenu: false });
    if (st.pick || st.custom) setState({ pick: null, custom: null });
    else if (st.confirm) setState({ confirm: null });
    else if (st.modal) setState({ modal: null });
    else if (st.menu) setState({ menu: false });
    else if (st.editor) closeEditor();
    else if (st.selection.length) setState({ selection: [] });
    return;
  }
  if (isTyping(e.target)) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!st.space) setState({ space: true });
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) void redo();
    else void undo();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    void redo();
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (st.screen !== 'app') return;
    if (st.mode === 'board' && st.selection.length) deleteSelection();
    else if (st.hoverShot) deleteShot(st.hoverShot);
  }
  if (st.screen === 'app' && !st.modal && !st.confirm && !st.popMenu) boardKeys(e);
}

let pendingPaste: ReturnType<typeof setTimeout> | null = null;

/** Board shortcuts (UPDATE-1 أ6, أ7). Brackets and letters by physical key, so the Arabic layout works too. */
function boardKeys(e: KeyboardEvent) {
  const st = getState();
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) return setState({ modal: 'shortcuts' });
  if (e.key === 'F2') {
    e.preventDefault();
    if (st.mode === 'board' && st.selection.length === 1) startRename(st.selection[0]);
    else if (st.projectId) setState({ renaming: { kind: 'project', id: st.projectId } });
    return;
  }
  if (st.mode !== 'board') return;
  const sel = st.selection;
  if (mod && e.code === 'KeyC' && sel.length) return (e.preventDefault(), copySelection());
  if (mod && e.code === 'KeyX' && sel.length) return (e.preventDefault(), copySelection(true));
  if (mod && e.code === 'KeyV') {
    // the paste event decides first (photos from the system clipboard win); else our own clipboard
    if (pendingPaste) clearTimeout(pendingPaste);
    pendingPaste = setTimeout(() => {
      pendingPaste = null;
      if (hasClipboard()) paste();
    }, 80);
    return;
  }
  if (mod && e.code === 'KeyD') return (e.preventDefault(), sel.length && duplicateSelection());
  if (mod && e.code === 'KeyA') return (e.preventDefault(), selectAll());
  if (mod && e.code === 'KeyG') return (e.preventDefault(), sel.length && frameSelection());
  if (e.code === 'BracketRight' && sel.length) return (e.preventDefault(), reorderSel(mod ? 'front' : 'forward'));
  if (e.code === 'BracketLeft' && sel.length) return (e.preventDefault(), reorderSel(mod ? 'back' : 'backward'));
  if (e.key === 'Enter' && sel.length === 1) return (e.preventDefault(), ['heading', 'frame', 'image'].includes(st.renaming ? '' : kindOf(sel[0])) ? startRename(sel[0]) : openItem(sel[0]));
  const step = e.shiftKey ? 24 : 1;
  const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (arrows[e.key] && sel.length && !mod) {
    e.preventDefault();
    nudge(...arrows[e.key]);
  }
}

function kindOf(id: string): string {
  const el = document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`);
  return el?.dataset.kind ?? '';
}

export function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space' && getState().space) setState({ space: false });
}

export function onPaste(e: ClipboardEvent) {
  const st = getState();
  if (st.auth !== 'app') return;
  const items = e.clipboardData ? [...e.clipboardData.items] : [];
  const files = items.filter((i) => i.kind === 'file' && /^image\//.test(i.type)).map((i) => i.getAsFile()).filter(Boolean) as File[];
  if (!files.length) return;
  const ed = st.editor;
  const target = ed && ['shot', 'location', 'moodboard', 'character'].includes(ed.type) ? { type: ed.type as OwnerKind, id: ed.id } : st.hoverShot ? { type: 'shot' as const, id: st.hoverShot } : null;
  if (pendingPaste) {
    clearTimeout(pendingPaste);
    pendingPaste = null;
  }
  if (!target) {
    // nothing chosen on the board: the photo becomes an image card in the middle (UPDATE-1 أ5)
    if (st.screen === 'app' && st.mode === 'board') {
      e.preventDefault();
      void addImageCards(files);
      return;
    }
    toast('حدّد لقطة أولاً ثم الصق الصورة');
    return;
  }
  e.preventDefault();
  addFiles(target, files);
  toast('أُلصقت الصورة');
}

export function onWinDown(e: PointerEvent) {
  const st = getState();
  const t = e.target as HTMLElement;
  if (st.pick && !t.closest('[data-picker]')) setState({ pick: null, custom: null });
  if (st.menu && !t.closest('[data-menu]')) setState({ menu: false });
  if (st.projMenu && !t.closest('[data-menu]')) setState({ projMenu: false });
}

let wired = false;
export function wireKeys() {
  if (wired) return;
  wired = true;
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('paste', onPaste);
  window.addEventListener('pointerdown', onWinDown);
}
