import { useSyncExternalStore } from 'react';
import type { Settings } from '../../../shared/schema';
import { Engine, type SaveState } from '../data/engine';
import { deriveProject, type PProject, type Uploads } from '../data/project';
import type { TplType } from '../lib/constants';
import type { ChRoute } from './challenge';

export type Mode = 'board' | 'storyboard';
export type Screen = 'home' | 'ideas' | 'app' | 'equipment' | 'trash' | 'settings' | 'more';
export type EditorType = 'shot' | 'scene' | 'character' | 'location' | 'moodboard' | 'note';
export type Drag =
  | { kind: 'tpl'; type: TplType }
  | { kind: 'lib'; type: 'character' | 'location' | 'moodboard'; id: string }
  | { kind: 'idea'; id: string }
  | { kind: 'shot'; id: string }
  | { kind: 'scene'; id: string }
  | { kind: 'eshot'; id: string }
  | { kind: 'gimg'; id: string; from: number };

export interface Toast {
  id: string;
  msg: string;
  undo?: boolean;
  /** extra button(s) next to the message, e.g. «فتح» or a custom undo */
  actions?: { label: string; run: () => void; testid?: string }[];
  tone: 'info' | 'danger';
}

export interface Choice {
  title: string;
  groups: { label?: string; options: { label: string; sub?: string; bg?: string; run: () => void; testid?: string }[] }[];
  empty?: string;
}

/** One entry of a pop-up menu (right-click, ⋯, long-press — UPDATE-1 أ3). */
export interface MenuItem {
  label: string;
  icon?: string;
  /** shortcut shown at the end of the line */
  keys?: string;
  run?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** opens a nested list in place */
  children?: MenuItem[];
  /** a row of colour dots instead of a line */
  swatches?: { key: string | null; hex: string; on: boolean; run: () => void; label: string }[];
  testid?: string;
}
export type MenuEntry = MenuItem | 'sep';
/** Pop-up menu at screen coordinates; it keeps itself inside the window. */
export interface PopMenu {
  x: number;
  y: number;
  items: MenuEntry[];
  testid?: string;
}

/** What is being renamed / edited in place. */
export type Renaming =
  | { kind: 'project'; id: string }
  | { kind: 'scene'; id: string; where: 'board' | 'row' }
  | { kind: 'card'; id: string }
  | null;
export interface PendingIdea {
  id: string;
  text: string;
  projectId: string | null;
  sceneId: string | null;
  createdAt: number;
  /** local previews (object URLs) */
  thumbs: string[];
  /** set when the server refused it (not a connection problem) */
  failed?: string;
}
export interface Confirm {
  title: string;
  msg: string;
  ok: string;
  danger?: boolean;
  onOk: () => void;
}
export interface Guide {
  /** 'v' = vertical line at x, from y1 to y2; 'h' = horizontal at y */
  dir: 'v' | 'h';
  at: number;
  from: number;
  to: number;
}

export interface UIState {
  auth: 'loading' | 'setup' | 'login' | 'app';
  /** project data loaded */
  loaded: boolean;
  noProjects: boolean;
  dataVersion: number;
  projectId: string | null;
  mode: Mode;
  screen: Screen;
  theme: 'light' | 'dark';
  settings: Settings | null;
  libOpen: boolean;
  libTab: 'characters' | 'locations' | 'moodboards' | 'ideas';
  editor: { type: EditorType; id: string } | null;
  sections: Record<string, boolean>;
  selection: string[];
  view: { x: number; y: number; z: number };
  filter: { kind: 'character' | 'location'; id: string; label?: string } | null;
  toasts: Toast[];
  save: SaveState;
  offline: boolean;
  modal: null | 'newProject' | 'export' | 'projectSettings' | 'duplicateProject' | 'shortcuts' | 'search' | 'import';
  /** project for «تكرار المشروع» (Home can duplicate a project that isn't open) */
  dupTarget: { id: string; name: string } | null;
  /** generic «اختر…» list (project, scene, shot for idea conversions) */
  choice: Choice | null;
  /** idea being edited (UPDATE-1 ب2) */
  ideaEdit: string | null;
  /** opened without a connection on a signed-in device: no data loaded yet (UPDATE-1 ج8) */
  bootOffline: boolean;
  /** ideas waiting on this device to be sent (UPDATE-1 ج8) */
  pending: PendingIdea[];
  /** phone: the ＋ sheet (UPDATE-1 ج5) */
  addSheet: null | 'idea' | 'shot' | 'scene';
  /** phone: «حوّل الفكرة إلى» sheet for this idea (UPDATE-1 ج6) */
  ideaSheet: string | null;
  /** phone: project tabs (UPDATE-1 ج3) */
  mTab: 'scenes' | 'shots' | 'library';
  /** «⌂ الرئيسية ‹ project ▾» menu */
  projMenu: boolean;
  popMenu: PopMenu | null;
  /** temporary sizes while resizing on the board (id → world size; heading: h = font) */
  dragSize: Record<string, { w: number; h?: number }> | null;
  renaming: Renaming;
  /** a newer version was deployed while this tab is open (UPDATE-1 أ10) */
  newVersion: boolean;
  /** pick a target for an image card: a shot or a moodboard */
  pickTarget: { kind: 'shot' | 'moodboard'; cardId: string } | null;
  /** board item under the pointer (shows its ⋯ button) */
  hoverItem: string | null;
  exportTab: 'pdf' | 'table' | 'project';
  exportScope: 'all' | 'some';
  exportSel: string[];
  confirm: Confirm | null;
  dragOver: { kind: string; id: string | number } | null;
  present: { open: boolean; i: number; playing: boolean; tech: boolean; fill: number };
  hoverShot: string | null;
  marquee: { x: number; y: number; w: number; h: number } | null;
  space: boolean;
  menu: boolean;
  pick: string | null;
  custom: string | null;
  customVal: string;
  flipping: boolean;
  guides: Guide[];
  /** temporary positions while dragging cards on the board (id → world pos) */
  dragPos: Record<string, { x: number; y: number }> | null;
  uploads: Uploads;
  canUndo: boolean;
  canRedo: boolean;
  /** «تحدي العشرين إطاراً» focus screens, innermost last (UPDATE-2 §4) */
  ch: ChRoute[];
  /** bumps when challenge card text / meta arrive */
  chVersion: number;
}

const initialTheme = (() => {
  try {
    return localStorage.getItem('sb-theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
})();

let state: UIState = {
  auth: 'loading', loaded: false, noProjects: false, dataVersion: 0, projectId: null, mode: 'board', screen: 'home', theme: initialTheme,
  settings: null, libOpen: true, libTab: 'characters', editor: null,
  sections: { refs: true, basics: true, comp: true, cam: true, move: true, light: false, audio: false },
  selection: [], view: { x: 0, y: 0, z: 0.8 }, filter: null, toasts: [], save: 'saved', offline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  modal: null, dupTarget: null, choice: null, ideaEdit: null, bootOffline: false, pending: [], addSheet: null, ideaSheet: null, mTab: 'scenes', projMenu: false, popMenu: null, dragSize: null, renaming: null, newVersion: false, pickTarget: null, hoverItem: null, exportTab: 'pdf', exportScope: 'all', exportSel: [], confirm: null, dragOver: null,
  present: { open: false, i: 0, playing: false, tech: false, fill: 0 }, hoverShot: null, marquee: null, space: false, menu: false,
  pick: null, custom: null, customVal: '', flipping: false, guides: [], dragPos: null, uploads: {}, canUndo: false, canRedo: false, ch: [], chVersion: 0,
};

const listeners = new Set<() => void>();

export function getState() {
  return state;
}

export function setState(patch: Partial<UIState> | ((s: UIState) => Partial<UIState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Subscribe to a slice of state. Selectors must return stable values (primitives or existing objects). */
export function useApp<T>(sel: (s: UIState) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state));
}

export const engine = new Engine({
  change: () => setState((s) => ({ dataVersion: s.dataVersion + 1, canUndo: engine.history.canUndo, canRedo: engine.history.canRedo })),
  save: (save) => setState({ save }),
  rejected: (msg) => toast(msg, { tone: 'danger' }),
  settings: (settings) => {
    setState({ settings });
  },
});

/** Current project as the nested view (memoized on store identity). */
export function useProject(): PProject | null {
  useApp((s) => s.dataVersion);
  const uploads = useApp((s) => s.uploads);
  const pid = useApp((s) => s.projectId);
  return deriveProject(engine.store, engine.images, pid, uploads);
}
export function project(): PProject | null {
  return deriveProject(engine.store, engine.images, state.projectId, state.uploads);
}

export function useEquipment() {
  useApp((s) => s.dataVersion);
  return engine.store.equipment;
}

// ---------- toasts ----------
let toastSeq = 0;
export function toast(msg: string, o: { undo?: boolean; tone?: 'info' | 'danger'; ms?: number; actions?: Toast['actions'] } = {}) {
  const id = `t${++toastSeq}`;
  setState((s) => ({ toasts: [...s.toasts, { id, msg, undo: !!o.undo, actions: o.actions, tone: o.tone ?? 'info' }] }));
  setTimeout(() => dismissToast(id), o.ms ?? 5000);
}
export function dismissToast(id: string) {
  setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}
export function askConfirm(c: Confirm) {
  setState({ confirm: c });
}

export function openMenu(x: number, y: number, items: MenuEntry[], testid?: string) {
  setState({ popMenu: { x, y, items, testid }, menu: false, projMenu: false });
}
export function closeMenu() {
  if (getState().popMenu) setState({ popMenu: null });
}
