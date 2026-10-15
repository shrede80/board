import { isTyping } from '../lib/util';
import { closeEditor, deleteSelection, deleteShot, redo, undo } from './actions';
import { addFiles, type OwnerKind } from './images';
import { closePresent, presGo, presToggle } from './present';
import { getState, setState, toast } from './state';

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
  if (!target) {
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
