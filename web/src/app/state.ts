import { useSyncExternalStore } from 'react';
import type { Settings } from '../../../shared/schema';
import { Engine, type SaveState } from '../data/engine';
import { deriveProject, type PProject, type Uploads } from '../data/project';
import type { TplType } from '../lib/constants';

export type Mode = 'board' | 'storyboard';
export type Screen = 'app' | 'equipment' | 'trash' | 'settings';
export type EditorType = 'shot' | 'scene' | 'character' | 'location' | 'moodboard' | 'note';
export type Drag =
  | { kind: 'tpl'; type: TplType }
  | { kind: 'lib'; type: 'character' | 'location' | 'moodboard'; id: string }
  | { kind: 'inbox'; id: string }
  | { kind: 'shot'; id: string }
  | { kind: 'scene'; id: string }
  | { kind: 'eshot'; id: string }
  | { kind: 'gimg'; id: string; from: number };

export interface Toast {
  id: string;
  msg: string;
  undo?: boolean;
  tone: 'info' | 'danger';
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
  libTab: 'characters' | 'locations' | 'moodboards' | 'inbox';
  editor: { type: EditorType; id: string } | null;
  sections: Record<string, boolean>;
  selection: string[];
  view: { x: number; y: number; z: number };
  filter: { kind: 'character' | 'location'; id: string; label?: string } | null;
  toasts: Toast[];
  save: SaveState;
  offline: boolean;
  modal: null | 'projects' | 'newProject' | 'export';
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
}

const initialTheme = (() => {
  try {
    return localStorage.getItem('sb-theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
})();

let state: UIState = {
  auth: 'loading', loaded: false, noProjects: false, dataVersion: 0, projectId: null, mode: 'board', screen: 'app', theme: initialTheme,
  settings: null, libOpen: true, libTab: 'characters', editor: null,
  sections: { refs: true, basics: true, comp: true, cam: true, move: true, light: false, audio: false },
  selection: [], view: { x: 0, y: 0, z: 0.8 }, filter: null, toasts: [], save: 'saved', offline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  modal: null, exportTab: 'pdf', exportScope: 'all', exportSel: [], confirm: null, dragOver: null,
  present: { open: false, i: 0, playing: false, tech: false, fill: 0 }, hoverShot: null, marquee: null, space: false, menu: false,
  pick: null, custom: null, customVal: '', flipping: false, guides: [], dragPos: null, uploads: {}, canUndo: false, canRedo: false,
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

function subscribe(l: () => void) {
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
export function toast(msg: string, o: { undo?: boolean; tone?: 'info' | 'danger'; ms?: number } = {}) {
  const id = `t${++toastSeq}`;
  setState((s) => ({ toasts: [...s.toasts, { id, msg, undo: !!o.undo, tone: o.tone ?? 'info' }] }));
  setTimeout(() => dismissToast(id), o.ms ?? 5000);
}
export function dismissToast(id: string) {
  setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}
export function askConfirm(c: Confirm) {
  setState({ confirm: c });
}
