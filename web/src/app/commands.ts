import { assignKey, commandFor, comboOf, COMMAND_BY_ID, resetKey, type AssignResult } from '../../../shared/keys';
import { keyOverrides } from './keyLabels';
import { findShot } from '../data/project';
import { addScene, addShot, duplicateShot, editorNav, redo, setBoardSnap, setMode, setTheme, undo, upd, createFromTemplate } from './actions';
import { addPos, autoArrange, fitAll, openItem, zoom100, zoomBy, zoomToSelection } from './board';
import { addCard, alignSel, distributeSel, duplicateSelection, frameSelection, pickImages, reorderSel, selectAll, setLocked, startRename, uniformWidth } from './boardActions';
import { setPref } from './prefs';
import { getState, project, setState, toast } from './state';
import { itemOf } from './board';

/**
 * «اختصاراتك» in the app (UPDATE-3 §3.3): command id → what it does. The keys come from
 * shared/keys.ts (defaults) merged with the user's changes (prefs 'keys'); tooltips and menus
 * read the same table, so they follow every change.
 */

export { isMac, kb, keyOverrides, tip } from './keyLabels';

export function saveKeys(r: AssignResult): boolean {
  if (!r.ok) return false;
  return setPref('keys', r.over);
}
export const setKey = (id: string, combo: string | null, swap = false) => assignKey(keyOverrides(), id, combo, swap);
export const resetKeys = (id?: string) => setPref('keys', resetKey(keyOverrides(), id));

/** Storyboard: the scene a new shot goes into — the open editor's, else the shot under the pointer. */
function sbScene(): string | null {
  const st = getState(), p = project();
  if (!p) return null;
  if (st.editor?.type === 'scene') return st.editor.id;
  const shotId = st.editor?.type === 'shot' ? st.editor.id : st.hoverShot;
  if (shotId) return findShot(p, shotId)?.sc.id ?? null;
  return null;
}
function sbShot(): string | null {
  const st = getState();
  return st.editor?.type === 'shot' ? st.editor.id : st.hoverShot;
}

const one = () => (getState().selection.length === 1 ? getState().selection[0] : null);
const needSel = (n: number, f: () => void) => () => {
  if (getState().selection.length >= n) f();
};

const RUN: Record<string, () => void> = {
  search: () => setState((s) => ({ modal: s.modal === 'search' ? null : 'search', menu: false })),
  undo: () => void undo(),
  redo: () => void redo(),
  modeBoard: () => getState().projectId && setMode('board'),
  modeStoryboard: () => getState().projectId && setMode('storyboard'),
  library: () => setState((s) => ({ libOpen: !s.libOpen })),
  theme: () => void setTheme(getState().theme === 'dark' ? 'light' : 'dark'),
  sheet: () => setState({ modal: 'shortcuts' }),

  alignRight: needSel(2, () => alignSel('right')),
  alignLeft: needSel(2, () => alignSel('left')),
  alignTop: needSel(2, () => alignSel('top')),
  alignBottom: needSel(2, () => alignSel('bottom')),
  centerH: needSel(2, () => alignSel('hcenter')),
  centerV: needSel(2, () => alignSel('vmiddle')),
  distributeH: needSel(3, () => distributeSel('h')),
  distributeV: needSel(3, () => distributeSel('v')),
  sameWidth: needSel(2, uniformWidth),
  magnet: () => {
    const on = !(getState().settings?.boardSnap ?? true);
    void setBoardSnap(on);
    toast(on ? 'المغناطيس شغّال' : 'المغناطيس طافي', { ms: 1600 });
  },

  addScene: () => addScene({ pos: addPos() }),
  addNote: () => createFromTemplate('note', { where: 'board', pos: addPos() }),
  addHeading: () => addCard('heading', addPos()),
  addFrame: () => addCard('frame', addPos()),
  frameSel: needSel(1, frameSelection),
  addImage: () => pickImages(addPos()),
  addCharacter: () => createFromTemplate('character', { where: 'board', pos: addPos() }),
  addLocation: () => createFromTemplate('location', { where: 'board', pos: addPos() }),
  addMoodboard: () => createFromTemplate('moodboard', { where: 'board', pos: addPos() }),

  duplicate: needSel(1, () => duplicateSelection()),
  selectAll,
  forward: needSel(1, () => reorderSel('forward')),
  backward: needSel(1, () => reorderSel('backward')),
  front: needSel(1, () => reorderSel('front')),
  back: needSel(1, () => reorderSel('back')),
  lock: () => {
    const ids = getState().selection;
    if (!ids.length) return;
    const allLocked = ids.every((id) => itemOf(id)?.locked);
    setLocked(ids, !allLocked);
  },
  open: () => {
    const id = one();
    if (!id) return;
    const k = itemOf(id)?.kind;
    if (k === 'heading' || k === 'frame' || k === 'image') startRename(id);
    else openItem(id);
  },
  rename: () => {
    const id = one();
    if (id) startRename(id);
    else if (getState().projectId) setState({ renaming: { kind: 'project', id: getState().projectId! } });
  },

  fit: fitAll,
  zoomSel: zoomToSelection,
  zoom100,
  zoomIn: () => zoomBy(1.2),
  zoomOut: () => zoomBy(1 / 1.2),
  arrange: autoArrange,

  sbShot: () => {
    const sc = sbScene() ?? project()?.scenes.at(-1)?.id;
    if (sc) addShot(sc);
    else toast('أضف مشهداً أولاً');
  },
  sbScene: () => addScene({ index: project()?.scenes.length ?? 0 }),
  sbDuplicate: () => {
    const id = sbShot();
    if (id) duplicateShot(id);
  },
  sbNext: () => getState().editor && editorNav(1),
  sbPrev: () => getState().editor && editorNav(-1),
  sbShotDone: () => {
    const id = sbShot();
    if (id) upd('shot', id, { status: 'shot' });
  },
};

/** Commands of other phases register here (the shot plan, UPDATE-3 §6). */
export function registerCommand(id: string, run: () => void) {
  RUN[id] = run;
}

/** The screen whose commands are active now. */
function screen(): 'board' | 'storyboard' | 'plan' | null {
  const st = getState();
  if (st.plan) return 'plan';
  if (st.screen !== 'app' || !st.projectId) return null;
  return st.mode === 'board' ? 'board' : 'storyboard';
}

/**
 * Runs the command bound to this key, if any. Single keys never fire while typing in a field
 * (only commands marked whileTyping do). Returns true when it handled the event.
 */
export function runKey(e: KeyboardEvent, typing: boolean, blocked: boolean): boolean {
  const combo = comboOf(e);
  if (!combo) return false;
  const id = commandFor(combo, screen(), keyOverrides());
  if (!id) return false;
  const cmd = COMMAND_BY_ID[id];
  if (typing && !cmd.whileTyping) return false;
  if (blocked && !['search', 'undo', 'redo'].includes(id)) return false;
  const run = RUN[id];
  if (!run) return false;
  e.preventDefault();
  run();
  return true;
}

