import { convertIdeaOps, type ConvertCtx, type ConvertKind } from '../../../shared/ideas';
import { positionAt } from '../../../shared/model';
import { MAX_IDEA_IMAGES, type Row } from '../../../shared/schema';
import { api } from '../data/api';
import { findShot, moodHex, type PProject } from '../data/project';
import { frameBg, pad2, uid, type Img } from '../lib/util';
import { centerWorldRef, commit, nextZ, newShotFields, openEditor, openProject, setMode } from './actions';
import { uploadFile } from './images';
import { engine, getState, project, setState, toast } from './state';

/**
 * Ideas box (UPDATE-1 ب2): global ideas with optional project/scene, edited from Home, the
 * library tab and the phone. Converting an idea opens its project, makes the shot / scene /
 * references / note / moodboard and discards the idea in the same write (one undo step).
 */

export const liveIdeas = (): Row[] => [...engine.store.ideas.values()].filter((r) => !r.deletedAt).sort((a, b) => (b.createdAt as number) - (a.createdAt as number));

/** Project of an idea, if it still exists (deleted projects count as «بدون مشروع»). */
export function ideaProject(idea: Row): string | null {
  const pid = idea.projectId as string | null;
  if (!pid) return null;
  const p = engine.store.projects.get(pid);
  if (p && p.deletedAt) return null;
  return pid;
}

export async function addIdea(o: { text: string; files?: File[]; imageIds?: string[]; projectId?: string | null; sceneId?: string | null; source?: 'laptop' | 'phone' }): Promise<string | null> {
  const text = o.text.trim();
  const files = (o.files ?? []).slice(0, MAX_IDEA_IMAGES);
  if (!text && !files.length && !o.imageIds?.length) return null;
  if (getState().offline) {
    toast('لا يوجد اتصال، الفكرة لم تُحفظ', { tone: 'danger' });
    return null;
  }
  let imageIds = o.imageIds ?? [];
  if (files.length) {
    try {
      imageIds = [...imageIds, ...(await Promise.all(files.map((f) => uploadFile(f))))].slice(0, MAX_IDEA_IMAGES);
    } catch {
      toast('فشل رفع صورة — أعد المحاولة', { tone: 'danger' });
      return null;
    }
  }
  const id = uid('idea');
  const ok = commit([{ op: 'create', entity: 'ideas', id, fields: { text, imageIds, projectId: o.projectId ?? null, sceneId: o.sceneId ?? null, source: o.source ?? 'laptop', isNew: true } }], { history: 'فكرة جديدة' });
  return ok ? id : null;
}

export function updateIdea(id: string, fields: Record<string, unknown>, key?: string) {
  commit([{ op: 'update', entity: 'ideas', id, fields }], { history: 'تعديل الفكرة', key: key ? `idea:${id}:${key}` : undefined });
}

export function deleteIdea(id: string) {
  const r = engine.store.ideas.get(id);
  if (!r) return;
  if (commit([{ op: 'delete', entity: 'ideas', id, label: `فكرة: ${((r.text as string) || 'صور').slice(0, 60)}` }], { history: 'حذف فكرة' })) toast('حُذفت الفكرة', { undo: true });
}

export function moveIdea(id: string, projectId: string | null) {
  updateIdea(id, { projectId, sceneId: null });
  toast(projectId ? 'نُقلت الفكرة للمشروع' : 'صارت الفكرة بدون مشروع', { undo: true });
}

/** «جديدة» goes away once the idea has been seen on the laptop. */
export function markRead(id: string) {
  const r = engine.store.ideas.get(id);
  if (!r || !r.isNew || getState().offline) return;
  commit([{ op: 'update', entity: 'ideas', id, fields: { isNew: false } }], { history: false });
}

// ---------- choosing (project / scene / shot) ----------

interface Summary { id: string; name: string; archived?: boolean; coverImageId: string | null; coverPlaceholder: Img['placeholder']; coverMood: string | null }

async function chooseProject(title: string): Promise<string | null> {
  const list = await api<Summary[]>('/api/projects').catch(() => [] as Summary[]);
  return new Promise((resolve) => {
    setState({
      choice: {
        title,
        empty: 'لا مشاريع بعد — أنشئ مشروعاً أولاً.',
        groups: [{
          options: list.filter((p) => !p.archived).map((p) => ({
            label: p.name, testid: 'choose-project',
            bg: frameBg(p.coverImageId ? { imageId: p.coverImageId, placeholder: p.coverPlaceholder } : null, moodHex(p.coverMood)),
            run: () => resolve(p.id),
          })),
        }],
      },
    });
    pendingCancel = () => resolve(null);
  });
}

let pendingCancel: (() => void) | null = null;
/** Called when the choice dialog closes without a pick. */
export function cancelChoice() {
  setState({ choice: null });
  pendingCancel?.();
  pendingCancel = null;
}

function chooseScene(p: PProject, title: string): Promise<string | null> {
  return new Promise((resolve) => {
    setState({
      choice: {
        title, empty: 'لا مشاهد في المشروع بعد — أضف مشهداً أولاً.',
        groups: [{ options: p.scenes.map((sc, i) => ({ label: `${pad2(i + 1)} · ${sc.name}`, sub: `${sc.shots.length} لقطات`, bg: moodHex(sc.mood), run: () => resolve(sc.id), testid: 'choose-scene' })) }],
      },
    });
    pendingCancel = () => resolve(null);
  });
}

function chooseShot(p: PProject, title: string): Promise<string | null> {
  return new Promise((resolve) => {
    setState({
      choice: {
        title, empty: 'لا لقطات في المشروع بعد.',
        groups: p.scenes.filter((sc) => sc.shots.length).map((sc) => ({
          label: `${pad2(p.scenes.indexOf(sc) + 1)} · ${sc.name}`,
          options: sc.shots.map((sh, hi) => ({ label: `${p.scenes.indexOf(sc) + 1}.${hi + 1}`, sub: sh.description || 'بدون وصف', bg: frameBg(sh.images[0] ?? null, moodHex(sc.mood)), run: () => resolve(sh.id), testid: 'choose-shot' })),
        })),
      },
    });
    pendingCancel = () => resolve(null);
  });
}

// ---------- the five conversions ----------

export const CONVERT_LABEL: Record<ConvertKind, string> = {
  shot: 'لقطة جديدة', scene: 'مشهد جديد', refs: 'صور مرجعية للقطة موجودة', note: 'ملاحظة على اللوحة', moodboard: 'لوحة مزاج',
};

/**
 * «حوّلها إلى…». The idea's project (or one chosen now) is opened first; target = a scene for a
 * new shot, a shot for references, a board spot for the note — asked for when not given.
 */
export async function convertIdea(id: string, kind: ConvertKind, target: { sceneId?: string; shotId?: string; pos?: { x: number; y: number } } = {}): Promise<boolean> {
  const idea0 = engine.store.ideas.get(id);
  if (!idea0 || idea0.deletedAt) return false;
  if (getState().offline) return (toast('لا يوجد اتصال، التغييرات لن تُحفظ', { tone: 'danger' }), false);
  // a drop onto this project's board/storyboard converts here; otherwise the idea's own project
  const dropped = !!(target.sceneId || target.shotId || target.pos);
  let pid = dropped ? getState().projectId : ideaProject(idea0);
  if (!pid) pid = await chooseProject('حوّلها في أي مشروع؟');
  if (!pid) return false;
  if (getState().projectId !== pid) await openProject(pid);
  const p = project();
  const idea = engine.store.ideas.get(id);
  if (!p || !idea || idea.deletedAt) return false;

  const ctx: ConvertCtx = { projectId: p.id, newId: uid };
  if (kind === 'shot') {
    const sceneId = target.sceneId ?? (idea.sceneId && p.scenes.some((s) => s.id === idea.sceneId) ? (idea.sceneId as string) : await chooseScene(p, 'في أي مشهد؟'));
    const sc = p.scenes.find((s) => s.id === sceneId);
    if (!sc) return false;
    const last = sc.shots[sc.shots.length - 1];
    ctx.shot = { sceneId: sc.id, position: positionAt(sc.shots, sc.shots.length), fields: newShotFields(last as never) };
  } else if (kind === 'scene') {
    const lastSc = p.scenes[p.scenes.length - 1];
    const pos = lastSc ? { x: lastSc.boardX - 320, y: lastSc.boardY } : centerWorldRef();
    ctx.scene = { position: positionAt(p.scenes, p.scenes.length), boardX: Math.round(pos.x), boardY: Math.round(pos.y), boardZ: nextZ() };
  } else if (kind === 'refs') {
    const shotId = target.shotId ?? (await chooseShot(p, 'أي لقطة؟'));
    const f = shotId ? findShot(p, shotId) : null;
    if (!f) return false;
    const linked = f.sh.images.filter((i) => i.linkId).map((i) => engine.store.itemImages.get(i.linkId!)).filter((r): r is Row => !!r);
    ctx.refs = { shotId: f.sh.id, sceneId: f.sc.id, nextImagePosition: positionAt(linked, linked.length), hasCover: !!f.sh.coverImageId };
  } else if (kind === 'note') {
    const pos = target.pos ?? centerWorldRef();
    ctx.note = { x: Math.round(pos.x), y: Math.round(pos.y), z: nextZ() };
  } else {
    ctx.moodboard = { position: positionAt(p.library.moodboards, p.library.moodboards.length) };
  }
  const { ops, made } = convertIdeaOps(idea, kind, ctx);
  if (!commit(ops, { history: `تحويل الفكرة إلى ${CONVERT_LABEL[kind]}`, flip: kind === 'shot' })) return false;

  const q = project()!;
  if (kind === 'shot' || kind === 'refs') {
    const f = findShot(q, made.id);
    toast(kind === 'shot' ? `صارت اللقطة ${f?.num ?? ''}` : `أُضيفت الصور للّقطة ${f?.num ?? ''}`, { undo: true, ms: 8000, actions: [{ label: 'فتح', testid: 'toast-open', run: () => openEditor('shot', made.id) }] });
  } else if (kind === 'scene') {
    const i = q.scenes.findIndex((s) => s.id === made.id);
    toast(`صار المشهد ${pad2(i + 1)}`, { undo: true, ms: 8000, actions: [{ label: 'فتح', testid: 'toast-open', run: () => openEditor('scene', made.id) }] });
  } else if (kind === 'note') {
    setMode('board');
    toast('صارت ملاحظة على اللوحة', { undo: true, ms: 8000 });
  } else {
    toast('صارت لوحة مزاج', { undo: true, ms: 8000, actions: [{ label: 'فتح', testid: 'toast-open', run: () => openEditor('moodboard', made.id) }] });
  }
  return true;
}

/** Dragging an idea from the library (like the inbox before): shot → references, row → new shot, board → note. */
export const dropIdeaOnShot = (id: string, shotId: string) => void convertIdea(id, 'refs', { shotId });
export const dropIdeaOnRow = (id: string, sceneId: string) => void convertIdea(id, 'shot', { sceneId });
export const dropIdeaOnBoard = (id: string, pos: { x: number; y: number }) => void convertIdea(id, 'note', { pos });
