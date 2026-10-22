import { isTyping } from '../lib/util';
import { closeEditor, deleteSelection, deleteShot } from './actions';
import { isMac, runKey } from './commands';
import { addFiles, type OwnerKind } from './images';
import { closePresent, presGo, presToggle } from './present';
import { closeMenu, getState, setState, toast } from './state';
import { nudge } from './board';
import { cancelChoice } from './ideas';
import { addImageCards, copySelection, hasClipboard, paste } from './boardActions';

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
    if (st.choice) return cancelChoice();
    if (st.ideaEdit) return setState({ ideaEdit: null });
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
  const typing = isTyping(e.target);
  const blocked = st.screen !== 'app' ? false : !!(st.modal || st.confirm || st.popMenu);
  if (typing) {
    runKey(e, true, blocked);
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    if (!st.space) setState({ space: true });
  }
  // fixed keys (UPDATE-3 §3.3 🔒): Delete, copy/cut/paste, the arrows
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (st.screen !== 'app' || blocked) return;
    if (st.mode === 'board' && st.selection.length) deleteSelection();
    else if (st.hoverShot) deleteShot(st.hoverShot);
    return;
  }
  if (st.screen === 'app' && !blocked && st.mode === 'board' && !st.plan && boardFixed(e)) return;
  if (runKey(e, false, blocked)) return;
}

let pendingPaste: ReturnType<typeof setTimeout> | null = null;

/** The board's fixed keys: copy/cut/paste by physical key (the Arabic layout works too) and the arrows. */
function boardFixed(e: KeyboardEvent): boolean {
  const st = getState();
  const mod = e.ctrlKey || e.metaKey;
  const sel = st.selection;
  if (mod && !e.altKey && !e.shiftKey && e.code === 'KeyC') return sel.length ? (e.preventDefault(), copySelection(), true) : false;
  if (mod && !e.altKey && !e.shiftKey && e.code === 'KeyX') return sel.length ? (e.preventDefault(), copySelection(true), true) : false;
  if (mod && !e.altKey && !e.shiftKey && e.code === 'KeyV') {
    // the paste event decides first (photos from the system clipboard win); else our own clipboard
    if (pendingPaste) clearTimeout(pendingPaste);
    pendingPaste = setTimeout(() => {
      pendingPaste = null;
      if (hasClipboard()) paste();
    }, 80);
    return true;
  }
  // arrows align like the mouse (UPDATE-3 §3.1): 1px · Shift = next stop · Alt = jump to the guide
  const arrows: Record<string, 'left' | 'right' | 'up' | 'down'> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  if (arrows[e.key] && sel.length && !mod) {
    e.preventDefault();
    nudge(arrows[e.key], e.altKey ? 'jump' : e.shiftKey ? 'next' : 'step', isMac() ? { shift: '⇧', alt: '⌥' } : { shift: 'Shift', alt: 'Alt' });
    return true;
  }
  return false;
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
    toast('حدّد لقطة أولاً');
    return;
  }
  e.preventDefault();
  addFiles(target, files);
  toast('انلصقت الصورة');
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
