import { positionAt } from '../../../shared/model';
import type { EntityName, Op, Row, Settings } from '../../../shared/schema';
import { api, ApiError, type AuthStatus, setUnauthorizedHandler } from '../data/api';
import { allShots, findShot, type PProject, type PScene } from '../data/project';
import { MOODS, POLL_MS, TEMPLATES } from '../lib/constants';
import { pad2, uid } from '../lib/util';
import { capture, playFlipLater } from './flip';
import { askConfirm, engine, getState, project, setState, toast, type EditorType } from './state';

// ---------- boot / auth ----------

export async function boot() {
  setUnauthorizedHandler(() => setState({ auth: 'login', loaded: false }));
  wireWindow();
  try {
    const st = await api<AuthStatus>('/api/auth/status');
    if (location.pathname === '/setup' && !st.setupDone) return setState({ auth: 'setup' });
    if (!st.authed) return setState({ auth: st.setupDone ? 'login' : 'setup' });
    if (location.pathname === '/setup') history.replaceState(null, '', '/');
    setState({ auth: 'app' });
    await loadInitial();
  } catch {
    setState({ auth: 'login', offline: !navigator.onLine });
  }
}

export async function afterLogin() {
  if (location.pathname === '/setup') history.replaceState(null, '', '/');
  setState({ auth: 'app', loaded: false });
  await loadInitial();
}

async function loadInitial() {
  const settings = await api<Settings>('/api/settings');
  applySettings(settings);
  const projects = await api<{ id: string }[]>('/api/projects');
  let pid = settings.lastProjectId && projects.some((p) => p.id === settings.lastProjectId) ? settings.lastProjectId : projects[0]?.id;
  if (!pid) {
    // First run (SPEC §3.6): no projects yet → open an empty «مشروع جديد».
    pid = uid('pr');
    await api('/api/ops', { method: 'POST', json: { ops: [{ op: 'create', entity: 'projects', id: pid, fields: { name: 'مشروع جديد', template: 'blank', aspect: '16:9' } }] } });
  }
  await openProject(pid);
  startPolling();
}

export function applySettings(s: Settings) {
  setState({ settings: s, theme: s.theme });
  applyTheme(s.theme);
}

export function applyTheme(t: 'light' | 'dark') {
  document.documentElement.setAttribute('data-sb-theme', t);
  try {
    localStorage.setItem('sb-theme', t);
  } catch {
    /* private mode */
  }
}

export async function setTheme(t: 'light' | 'dark') {
  setState({ theme: t });
  applyTheme(t);
  try {
    await api('/api/settings', { method: 'PATCH', json: { theme: t } });
  } catch {
    /* kept locally; server copy is cosmetic */
  }
}

export async function setBoardSnap(on: boolean) {
  const s = getState().settings;
  if (s) setState({ settings: { ...s, boardSnap: on } });
  await api('/api/settings', { method: 'PATCH', json: { boardSnap: on } }).catch(() => {});
}

export async function openProject(id: string) {
  await engine.idle();
  setState({ loaded: false, projectId: id, editor: null, filter: null, selection: [], modal: null, dragPos: null, guides: [] });
  await engine.load(id);
  setState({ loaded: true });
  api('/api/settings', { method: 'PATCH', json: { lastProjectId: id } }).catch(() => {});
  setTimeout(() => fitAllSoon(), 30);
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void pollNow();
  }, POLL_MS);
}
export async function pollNow() {
  try {
    await engine.poll();
    if (getState().offline) setState({ offline: false });
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) setState({ offline: !navigator.onLine });
  }
}

function wireWindow() {
  window.addEventListener('online', () => {
    setState({ offline: false });
    engine.retry();
    void pollNow();
  });
  window.addEventListener('offline', () => setState({ offline: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && getState().auth === 'app') void pollNow();
  });
  window.addEventListener('beforeunload', (e) => {
    if (engine.hasUnsaved) e.preventDefault();
  });
}

// fitAll lives in board.ts; resolved lazily to avoid an import cycle at module init.
let fitAllRef: () => void = () => {};
export function registerFitAll(f: () => void) {
  fitAllRef = f;
}
function fitAllSoon() {
  fitAllRef();
}

// ---------- commit helpers ----------

/** Refuses writes while offline (SPEC §1.4), like the prototype. */
export function commit(ops: Op[], opts: { history?: string | false; key?: string; inverse?: Op[]; flip?: boolean } = {}): boolean {
  if (getState().offline) {
    toast('لا يوجد اتصال، التغييرات لن تُحفظ', { tone: 'danger' });
    return false;
  }
  if (opts.flip && getState().mode === 'storyboard') {
    const rects = capture('storyboard');
    playFlipLater('storyboard', rects);
  }
  engine.commit(ops, opts);
  return true;
}

const ENTITY_OF: Record<EditorType, EntityName> = {
  shot: 'shots', scene: 'scenes', character: 'characters', location: 'locations', moodboard: 'moodboards', note: 'notes',
};
export const entityOf = (t: EditorType) => ENTITY_OF[t];

/** Field edit from an editor. `key` makes fast typing one request and one undo step. */
export function upd(type: EditorType, id: string, fields: Record<string, unknown>, key?: string) {
  commit([{ op: 'update', entity: ENTITY_OF[type], id, fields }], { history: 'تعديل', key: key ? `${type}:${id}:${key}` : undefined });
}

export async function undo() {
  if (!(await engine.undo())) return;
  setState({ canUndo: engine.history.canUndo, canRedo: engine.history.canRedo });
}
export async function redo() {
  if (!(await engine.redo())) return;
  setState({ canUndo: engine.history.canUndo, canRedo: engine.history.canRedo });
}

// ---------- editor ----------

export function openEditor(type: EditorType, id: string) {
  setState({ editor: { type, id }, pick: null, custom: null });
}
export function closeEditor() {
  setState({ editor: null, pick: null });
}
export function editorNav(dir: number) {
  const ed = getState().editor, p = project();
  if (!ed || !p) return;
  if (ed.type === 'shot') {
    const list = allShots(p);
    const i = list.findIndex((x) => x.sh.id === ed.id);
    const n = list[i + dir];
    if (n) openEditor('shot', n.sh.id);
  }
  if (ed.type === 'scene') {
    const i = p.scenes.findIndex((s) => s.id === ed.id);
    const n = p.scenes[i + dir];
    if (n) openEditor('scene', n.id);
  }
}

// ---------- shots / scenes ----------

interface ShotDefaults {
  cameraId: unknown;
  lens: unknown;
  focalMm: unknown;
  rigId: unknown;
  motion: unknown;
}
function newShotFields(prev: ShotDefaults | undefined) {
  const b = prev ?? { cameraId: 'cam-zve10', lens: 'lens-sigma1850', focalMm: 35, rigId: 'sup-benro', motion: 'ثابتة' };
  return {
    description: '', cameraId: b.cameraId ?? null, lens: b.lens ?? null, focalMm: b.focalMm ?? null, size: 'MS', angle: 'مستوى العين',
    motion: b.motion ?? null, rigId: b.rigId ?? null, lightingIds: [], lightingMood: '', audioIds: [], audioNotes: '', dialogue: '',
    durationS: 3, status: 'planned', filter: null, coverImageId: null,
  };
}

export function addShot(sceneId: string) {
  const p = project();
  const sc = p?.scenes.find((s) => s.id === sceneId);
  if (!p || !sc) return;
  const id = uid('sh');
  const last = sc.shots[sc.shots.length - 1];
  const ok = commit(
    [{ op: 'create', entity: 'shots', id, fields: { projectId: p.id, sceneId, position: positionAt(sc.shots, sc.shots.length), ...newShotFields(last as unknown as ShotDefaults) } }],
    { history: 'إضافة لقطة', flip: true },
  );
  if (ok) openEditor('shot', id);
}

export function duplicateShot(id: string) {
  const p = project();
  const f = p && findShot(p, id);
  if (!p || !f) return;
  const nid = uid('sh');
  const { id: _id, updatedAt: _u, deletedAt: _d, images, ...fields } = f.sh;
  const ops: Op[] = [{ op: 'create', entity: 'shots', id: nid, fields: { ...fields, position: positionAt(f.sc.shots, f.hi + 1) } }];
  let cover: string | null = null;
  images.filter((i) => i.linkId).forEach((im, k) => {
    ops.push({ op: 'create', entity: 'itemImages', id: uid('ii'), fields: { projectId: p.id, ownerKind: 'shot', ownerId: nid, imageId: im.imageId, position: k + 1 } });
    if (im.imageId === f.sh.coverImageId) cover = im.imageId;
  });
  (ops[0] as { fields: Record<string, unknown> }).fields.coverImageId = cover;
  commit(ops, { history: 'تكرار لقطة', flip: true });
  toast('تكرّرت اللقطة');
}

export function deleteShot(id: string) {
  const p = project();
  const f = p && findShot(p, id);
  if (!p || !f) return;
  const ok = commit([{ op: 'delete', entity: 'shots', id, label: `لقطة ${f.num}: ${f.sh.description || 'بدون وصف'}` }], { history: 'حذف لقطة', flip: true });
  if (!ok) return;
  if (getState().editor?.id === id) closeEditor();
  setState({ hoverShot: null });
  toast(`حُذفت اللقطة ${f.num}`, { undo: true });
}

export function addScene(o: { index?: number; pos?: { x: number; y: number }; name?: string; open?: boolean } = {}): string | null {
  const p = project();
  if (!p) return null;
  const id = uid('sc');
  const last = p.scenes[p.scenes.length - 1];
  const pos = o.pos ?? (last ? { x: last.boardX - 320, y: last.boardY } : centerWorldRef());
  const index = o.index ?? p.scenes.length;
  const ok = commit(
    [{
      op: 'create', entity: 'scenes', id,
      fields: { projectId: p.id, position: positionAt(p.scenes, index), name: o.name || 'مشهد جديد', intExt: 'ext', dayNight: 'day', locationId: null, summary: '', goal: '', mood: 'sand', coverImageId: null, boardX: Math.round(pos.x), boardY: Math.round(pos.y) },
    }],
    { history: 'إضافة مشهد', flip: true },
  );
  if (!ok) return null;
  if (o.open !== false) openEditor('scene', id);
  return id;
}

let centerWorldFn: () => { x: number; y: number } = () => ({ x: 400, y: 200 });
export function registerCenterWorld(f: () => { x: number; y: number }) {
  centerWorldFn = f;
}
export const centerWorldRef = () => centerWorldFn();

export function deleteScene(id: string) {
  const p = project();
  if (!p) return;
  const i = p.scenes.findIndex((s) => s.id === id);
  if (i < 0) return;
  const num = pad2(i + 1);
  const ok = commit([{ op: 'delete', entity: 'scenes', id, label: `مشهد ${num}: ${p.scenes[i].name}` }], { history: 'حذف مشهد', flip: true });
  if (!ok) return;
  if (getState().editor?.id === id) closeEditor();
  toast(`حُذف المشهد ${num}`, { undo: true });
}

export function isCard(id: string) {
  return engine.store.boardCards.has(id);
}

export function deleteSelection() {
  const sel = getState().selection;
  const p = project();
  if (!sel.length || !p) return;
  const ops: Op[] = [];
  const nums: string[] = [];
  for (const id of sel) {
    if (isCard(id)) {
      const c = p.cards.find((x) => x.id === id);
      if (!c) continue;
      if (c.kind === 'note') {
        const note = p.notes.find((n) => n.id === c.refId);
        // The note itself goes to the trash with its card (prototype behaviour).
        ops.push({ op: 'delete', entity: 'notes', id: c.refId, label: `ملاحظة: «${((note?.text as string) || '').slice(0, 40)}»` });
      } else ops.push({ op: 'delete', entity: 'boardCards', id });
    } else {
      const i = p.scenes.findIndex((s) => s.id === id);
      if (i < 0) continue;
      nums.push(pad2(i + 1));
      ops.push({ op: 'delete', entity: 'scenes', id, label: `مشهد ${pad2(i + 1)}: ${p.scenes[i].name}` });
    }
  }
  if (!commit(ops, { history: 'حذف' })) return;
  setState({ selection: [], editor: null });
  toast(nums.length === 1 && sel.length === 1 ? `حُذف المشهد ${nums[0]}` : `حُذف ${sel.length} عناصر`, { undo: true });
}

export function moveShot(shotId: string, toSceneId: string, toIndex: number | null) {
  const p = project();
  const f = p && findShot(p, shotId);
  const to = p?.scenes.find((s) => s.id === toSceneId);
  if (!p || !f || !to) return;
  const list = to.shots.filter((s) => s.id !== shotId);
  let idx = toIndex == null ? list.length : toIndex;
  if (f.sc.id === to.id && f.hi < idx) idx--;
  const position = positionAt(list, Math.max(0, idx));
  if (f.sc.id === to.id && to.shots[idx]?.id === shotId) return;
  commit([{ op: 'update', entity: 'shots', id: shotId, fields: { sceneId: toSceneId, position } }], { history: 'نقل لقطة', flip: true });
}

export function moveScene(sceneId: string, toIndex: number) {
  const p = project();
  if (!p) return;
  const i = p.scenes.findIndex((s) => s.id === sceneId);
  if (i < 0) return;
  let idx = toIndex;
  if (i < idx) idx--;
  if (idx === i) return;
  const position = positionAt(p.scenes.filter((s) => s.id !== sceneId), idx);
  commit([{ op: 'update', entity: 'scenes', id: sceneId, fields: { position } }], { history: 'نقل مشهد', flip: true });
}

// ---------- library / templates ----------

type LibType = 'note' | 'character' | 'location' | 'moodboard';
function createEntityOps(p: PProject, type: LibType, id: string): Op[] {
  const n = (list: Row[]) => positionAt(list, list.length);
  if (type === 'note') return [{ op: 'create', entity: 'notes', id, fields: { projectId: p.id, text: '' } }];
  if (type === 'character') return [{ op: 'create', entity: 'characters', id, fields: { projectId: p.id, position: n(p.library.characters), name: 'شخصية جديدة' } }];
  if (type === 'location') return [{ op: 'create', entity: 'locations', id, fields: { projectId: p.id, position: n(p.library.locations), name: 'موقع جديد' } }];
  return [{ op: 'create', entity: 'moodboards', id, fields: { projectId: p.id, position: n(p.library.moodboards), title: 'لوحة مزاج جديدة', swatches: ['#d2a06a', '#3a342c', '#eee5d3'] } }];
}
const PREFIX: Record<LibType, string> = { note: 'note', character: 'ch', location: 'loc', moodboard: 'mb' };
const LABEL: Record<LibType, string> = { note: 'الملاحظة', character: 'الشخصية', location: 'الموقع', moodboard: 'لوحة المزاج' };

export function linkOps(p: PProject, sceneId: string, type: LibType, id: string): Op[] {
  const sc = p.scenes.find((s) => s.id === sceneId);
  if (!sc) return [];
  if (type === 'character') return sc.characterIds.includes(id) ? [] : [{ op: 'create', entity: 'sceneCharacters', id: `${sceneId}:${id}`, fields: { projectId: p.id, sceneId, characterId: id } }];
  if (type === 'location') return sc.locationId === id ? [] : [{ op: 'update', entity: 'scenes', id: sceneId, fields: { locationId: id } }];
  const list = type === 'note' ? sc.noteIds : sc.moodboardIds;
  return list.includes(id) ? [] : [{ op: 'create', entity: 'sceneLinks', id: `${sceneId}:${type}:${id}`, fields: { projectId: p.id, sceneId, kind: type, refId: id } }];
}

export function createFromTemplate(type: 'scene' | LibType, ctx: { where: 'board' | 'center' | 'gap' | 'row' | 'library'; pos?: { x: number; y: number }; index?: number; sceneId?: string; force?: boolean }) {
  const p = project();
  if (!p) return;
  if (type === 'scene') {
    if (ctx.where === 'board' || ctx.where === 'center') addScene({ pos: ctx.pos ?? centerWorldRef() });
    else if (ctx.where === 'gap') addScene({ index: ctx.index });
    else addScene({});
    return;
  }
  if (ctx.where === 'row' && type === 'location' && !ctx.force) {
    const sc = p.scenes.find((s) => s.id === ctx.sceneId);
    if (sc?.locationId) {
      askConfirm({ title: 'استبدال الموقع؟', msg: 'للمشهد موقع مسبقاً. هل تريد استبداله بموقع جديد؟', ok: 'استبدال', onOk: () => createFromTemplate(type, { ...ctx, force: true }) });
      return;
    }
  }
  const place = ctx.where === 'board' || ctx.where === 'center' || (ctx.where === 'library' && type === 'note');
  const id = uid(PREFIX[type]);
  const ops = createEntityOps(p, type, id);
  if (place) {
    const pos = ctx.pos ?? centerWorldRef();
    ops.push({ op: 'create', entity: 'boardCards', id: uid('bc'), fields: { projectId: p.id, kind: type, refId: id, x: Math.round(pos.x), y: Math.round(pos.y) } });
  }
  if (ctx.where === 'row' && ctx.sceneId) {
    // link to a scene that the create above hasn't added to `p` yet
    const sc = p.scenes.find((s) => s.id === ctx.sceneId)!;
    if (type === 'character') ops.push({ op: 'create', entity: 'sceneCharacters', id: `${sc.id}:${id}`, fields: { projectId: p.id, sceneId: sc.id, characterId: id } });
    else if (type === 'location') ops.push({ op: 'update', entity: 'scenes', id: sc.id, fields: { locationId: id } });
    else ops.push({ op: 'create', entity: 'sceneLinks', id: `${sc.id}:${type}:${id}`, fields: { projectId: p.id, sceneId: sc.id, kind: type, refId: id } });
  }
  if (!commit(ops, { history: 'إضافة' })) return;
  if (ctx.where === 'row' && ctx.sceneId) toast(`رُبطت ${LABEL[type]} الجديدة بالمشهد ${pad2(p.scenes.findIndex((s) => s.id === ctx.sceneId) + 1)}`);
  if (ctx.where === 'library') toast(type === 'note' ? 'أُضيفت الملاحظة إلى لوحة الأفكار' : `أُضيفت ${LABEL[type]} إلى المكتبة فقط`);
  openEditor(type, id);
}

export function linkLib(sceneId: string, type: LibType, id: string) {
  const p = project();
  const sc = p?.scenes.find((s) => s.id === sceneId);
  if (!p || !sc) return;
  const n = pad2(p.scenes.indexOf(sc) + 1);
  const go = () => {
    const ops = linkOps(project()!, sceneId, type, id);
    if (ops.length && commit(ops, { history: 'ربط' })) toast(`رُبط العنصر بالمشهد ${n}`);
    else if (!ops.length) toast(`العنصر مرتبط بالمشهد ${n} مسبقاً`);
  };
  if (type === 'location' && sc.locationId && sc.locationId !== id) {
    const old = p.library.locations.find((l) => l.id === sc.locationId);
    askConfirm({ title: 'استبدال الموقع؟', msg: `موقع المشهد ${n} حالياً «${old?.name ?? ''}». هل تستبدله؟`, ok: 'استبدال', onOk: go });
  } else go();
}

export function unlink(sceneId: string, type: LibType, id: string) {
  if (type === 'location') commit([{ op: 'update', entity: 'scenes', id: sceneId, fields: { locationId: null } }], { history: 'فك الربط' });
  else if (type === 'character') commit([{ op: 'delete', entity: 'sceneCharacters', id: `${sceneId}:${id}` }], { history: 'فك الربط' });
  else commit([{ op: 'delete', entity: 'sceneLinks', id: `${sceneId}:${type}:${id}` }], { history: 'فك الربط' });
}

export function toggleCharacter(sc: PScene, charId: string) {
  if (sc.characterIds.includes(charId)) unlink(sc.id, 'character', charId);
  else commit(linkOps(project()!, sc.id, 'character', charId), { history: 'ربط' });
}

export function newLocationForScene(sceneId: string) {
  const p = project();
  if (!p) return;
  const id = uid('loc');
  commit([...createEntityOps(p, 'location', id), { op: 'update', entity: 'scenes', id: sceneId, fields: { locationId: id } }], { history: 'موقع جديد' });
}
export function newCharacterForScene(sceneId: string) {
  const p = project();
  if (!p) return;
  const id = uid('ch');
  commit([...createEntityOps(p, 'character', id), { op: 'create', entity: 'sceneCharacters', id: `${sceneId}:${id}`, fields: { projectId: p.id, sceneId, characterId: id } }], { history: 'شخصية جديدة' });
}

// ---------- inbox ----------

export function inboxTo(target: { shotId?: string; sceneId?: string; board?: { x: number; y: number } }, inboxId: string) {
  const p = project();
  const it = p?.library.inbox.find((x) => x.id === inboxId);
  if (!p || !it) return;
  const ops: Op[] = [{ op: 'delete', entity: 'inboxItems', id: inboxId }];
  if (target.shotId) {
    const f = findShot(p, target.shotId);
    if (!f) return;
    if (it.kind === 'image' && it.image) {
      ops.push({ op: 'create', entity: 'itemImages', id: uid('ii'), fields: { projectId: p.id, ownerKind: 'shot', ownerId: f.sh.id, imageId: it.image.imageId, position: positionAt(f.sh.images.filter((i) => i.linkId) as unknown as Row[], f.sh.images.length) } });
      if (!f.sh.coverImageId) ops.push({ op: 'update', entity: 'shots', id: f.sh.id, fields: { coverImageId: it.image.imageId } });
    } else {
      const nid = uid('note');
      ops.push({ op: 'create', entity: 'notes', id: nid, fields: { projectId: p.id, text: it.text } });
      ops.push({ op: 'create', entity: 'sceneLinks', id: `${f.sc.id}:note:${nid}`, fields: { projectId: p.id, sceneId: f.sc.id, kind: 'note', refId: nid } });
    }
  }
  if (target.sceneId) {
    const nid = uid('note');
    ops.push({ op: 'create', entity: 'notes', id: nid, fields: { projectId: p.id, text: it.text } });
    ops.push({ op: 'create', entity: 'sceneLinks', id: `${target.sceneId}:note:${nid}`, fields: { projectId: p.id, sceneId: target.sceneId, kind: 'note', refId: nid } });
  }
  if (target.board) {
    if (it.kind === 'image' && it.image) {
      const mid = uid('mb');
      ops.push({ op: 'create', entity: 'moodboards', id: mid, fields: { projectId: p.id, position: positionAt(p.library.moodboards, p.library.moodboards.length), title: it.text || 'من الجوال', swatches: [] } });
      ops.push({ op: 'create', entity: 'itemImages', id: uid('ii'), fields: { projectId: p.id, ownerKind: 'moodboard', ownerId: mid, imageId: it.image.imageId, position: 1 } });
      ops.push({ op: 'create', entity: 'boardCards', id: uid('bc'), fields: { projectId: p.id, kind: 'moodboard', refId: mid, x: target.board.x, y: target.board.y } });
    } else {
      const nid = uid('note');
      ops.push({ op: 'create', entity: 'notes', id: nid, fields: { projectId: p.id, text: it.text } });
      ops.push({ op: 'create', entity: 'boardCards', id: uid('bc'), fields: { projectId: p.id, kind: 'note', refId: nid, x: target.board.x, y: target.board.y } });
    }
  }
  if (commit(ops, { history: 'نقل من الوارد' })) toast(target.shotId && it.kind === 'image' ? 'أصبحت الصورة مرجعاً للّقطة' : 'نُقل العنصر من الوارد');
}

// ---------- filter / modes ----------

export function toggleFilter(kind: 'character' | 'location', id: string) {
  const f = getState().filter;
  setState({ filter: f && f.id === id ? null : { kind, id } });
}

export function setMode(m: 'board' | 'storyboard') {
  const st = getState();
  if (m === st.mode) return;
  playFlipLater(m, capture(st.mode));
  setState({ mode: m, flipping: true, selection: st.selection.length ? [] : st.selection, pick: null });
  setTimeout(() => setState({ flipping: false }), 650);
}

// ---------- projects ----------

export function createProject(np: { name: string; aspect: string; template: string }) {
  const tpl = TEMPLATES.find((t) => t.id === np.template) ?? TEMPLATES[4];
  const id = uid('pr');
  const ops: Op[] = [{ op: 'create', entity: 'projects', id, fields: { name: np.name.trim() || 'مشروع جديد', template: tpl.id, aspect: np.aspect } }];
  tpl.scenes.forEach((n, i) =>
    ops.push({
      op: 'create', entity: 'scenes', id: uid('sc'),
      fields: { projectId: id, position: i + 1, name: n, intExt: 'ext', dayNight: 'day', mood: MOODS[i % 8], boardX: 1100 - (i % 4) * 320, boardY: 60 + Math.floor(i / 4) * 380 },
    }),
  );
  setState({ modal: null });
  void api('/api/ops', { method: 'POST', json: { ops } })
    .then(() => openProject(id))
    .catch(() => toast('تعذّر إنشاء المشروع', { tone: 'danger' }));
}
