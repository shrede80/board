import { findShot } from '../data/project';
import { uid } from '../lib/util';
import { addScene, commit, createFromTemplate, inboxTo, linkLib, moveScene, moveShot } from './actions';
import { toWorld } from './board';
import { addFiles, filesToMoodboard } from './images';
import { getState, project, setState, toast, type Drag } from './state';

/** HTML5 drag & drop between the dock, library, inbox, board and storyboard (ported from the prototype). */
let drag: Drag | null = null;

export function currentDrag() {
  return drag;
}

export function dragStart(e: React.DragEvent, payload: Drag) {
  drag = payload;
  try {
    e.dataTransfer.setData('text/plain', 'id' in payload ? payload.id : payload.kind);
    e.dataTransfer.effectAllowed = 'copyMove';
  } catch {
    /* some browsers refuse setData on certain targets */
  }
}

export function dragEnd() {
  drag = null;
  if (getState().dragOver) setState({ dragOver: null });
}

export function setOver(o: { kind: string; id: string | number } | null) {
  const c = getState().dragOver;
  if (!c || !o || c.kind !== o.kind || c.id !== o.id) setState({ dragOver: o });
}

export const hasFiles = (e: React.DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
const isSceneDrag = (d: Drag | null) => !!d && (d.kind === 'scene' || (d.kind === 'tpl' && d.type === 'scene'));
export { isSceneDrag };

function take(e: React.DragEvent): Drag | null {
  e.preventDefault();
  const d = drag;
  drag = null;
  setState({ dragOver: null });
  return d;
}

export function dropOnBoard(e: React.DragEvent) {
  const d = take(e);
  const w = toWorld(e.clientX, e.clientY);
  const pos = { x: Math.round(w.x - 100), y: Math.round(w.y - 50) };
  if (!d) {
    if (e.dataTransfer?.files?.length) filesToMoodboard(e.dataTransfer.files, pos);
    return;
  }
  if (d.kind === 'tpl') createFromTemplate(d.type, { where: 'board', pos });
  if (d.kind === 'lib') {
    const p = project();
    if (p) commit([{ op: 'create', entity: 'boardCards', id: uid('bc'), fields: { projectId: p.id, kind: d.type, refId: d.id, x: pos.x, y: pos.y } }], { history: 'إضافة إلى اللوحة' });
  }
  if (d.kind === 'inbox') inboxTo({ board: pos }, d.id);
}

export function dropOnSbEmpty(e: React.DragEvent) {
  const d = take(e);
  if (!d) return;
  if (d.kind === 'tpl') {
    if (d.type === 'scene') addScene({});
    else createFromTemplate(d.type, { where: 'library' });
  }
  if (d.kind === 'lib') toast('العنصر موجود في المكتبة — أفلته فوق صف مشهد لربطه');
}

export function dropOnRow(e: React.DragEvent, sceneId: string, d0?: Drag | null) {
  e.stopPropagation();
  const d = d0 !== undefined ? d0 : take(e);
  if (!d) return;
  const p = project();
  if (!p) return;
  if (d.kind === 'tpl') {
    if (d.type === 'scene') addScene({ index: p.scenes.findIndex((s) => s.id === sceneId) + 1 });
    else createFromTemplate(d.type, { where: 'row', sceneId });
  }
  if (d.kind === 'lib') linkLib(sceneId, d.type, d.id);
  if (d.kind === 'shot') moveShot(d.id, sceneId, null);
  if (d.kind === 'inbox') {
    const it = p.library.inbox.find((x) => x.id === d.id);
    if (it && it.kind === 'note') inboxTo({ sceneId }, d.id);
    else toast('أفلت الصورة فوق لقطة لتصبح صورة مرجعية');
  }
  if (d.kind === 'scene') moveScene(d.id, p.scenes.findIndex((s) => s.id === sceneId));
}

export function dropOnGap(e: React.DragEvent, index: number) {
  e.stopPropagation();
  const d = take(e);
  if (!d) return;
  if (d.kind === 'tpl' && d.type === 'scene') addScene({ index });
  else if (d.kind === 'scene') moveScene(d.id, index);
}

export function dropOnShot(e: React.DragEvent, shotId: string) {
  e.stopPropagation();
  const d = take(e);
  if (!d) {
    if (e.dataTransfer?.files?.length) addFiles({ type: 'shot', id: shotId }, e.dataTransfer.files);
    return;
  }
  const p = project();
  const f = p && findShot(p, shotId);
  if (!f) return;
  if (d.kind === 'shot' && d.id !== shotId) moveShot(d.id, f.sc.id, f.hi);
  if (d.kind === 'inbox') inboxTo({ shotId }, d.id);
  if (d.kind === 'tpl' || d.kind === 'lib') dropOnRow(e, f.sc.id, d);
}
