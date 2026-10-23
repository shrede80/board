import { positionAt } from '../../../shared/model';
import type { Row } from '../../../shared/schema';
import { sceneTemplateOps, type TemplateRows } from '../../../shared/templates';
import { api } from '../data/api';
import type { ImageMeta } from '../data/engine';
import { uid } from '../lib/util';
import { centerWorldRef, commit, nextZ, openEditor, openProject, pollNow } from './actions';
import { updateProject } from './projects';
import { engine, getState, openMenu, project, setState, toast, type MenuEntry } from './state';

/**
 * Saved templates (UPDATE-3 §7): «احفظ كقالب» for a project or a scene (a copy on the server),
 * «مشروع جديد من القالب», and «+ مشهد» from a scene template (ordinary ops, one undo step).
 */

export interface TemplateSummary { id: string; name: string; templateKind: 'project' | 'scene' | null; scenes: number; shots: number; plans: number; coverImageId: string | null; coverPlaceholder?: ImageMeta['placeholder'] | null; coverMood: string | null }

export const listTemplates = async (kind: 'project' | 'scene') =>
  (await api<TemplateSummary[]>('/api/projects').catch(() => [] as TemplateSummary[])).filter((t) => t.templateKind === kind);

/** Counts on a template card: «8 مشاهد · 34 لقطة · مخططات 3». */
export const templateCounts = (t: { scenes: number; shots: number; plans: number }) =>
  [`${t.scenes} ${t.scenes === 1 ? 'مشهد' : 'مشاهد'}`, `${t.shots} لقطة`, t.plans ? (t.plans === 1 ? 'مخطط' : `مخططات ${t.plans}`) : ''].filter(Boolean).join(' · ');

export function askSaveTemplate(projectId: string, sceneId: string | null, name: string) {
  setState({ tplSave: { projectId, sceneId, name }, modal: 'saveTemplate', popMenu: null, menu: false });
}

export async function saveTemplate(name: string) {
  const t = getState().tplSave;
  const n = name.trim();
  if (!t || !n) return;
  setState({ modal: null, tplSave: null });
  await engine.idle();
  try {
    await api('/api/projects/' + encodeURIComponent(t.projectId) + '/template', { method: 'POST', json: { name: n, ...(t.sceneId ? { sceneId: t.sceneId } : {}) } });
    if (!getState().projectId) void pollNow(); // Home: it shows up in «قوالبي»
    if (t.sceneId) void refreshSceneTemplates();
    toast(t.sceneId ? `انحفظ قالب المشهد «${n}»` : `انحفظ القالب «${n}»`);
  } catch {
    toast('ما قدرنا نحفظ القالب', { tone: 'danger' });
  }
}

/** «مشروع جديد» from one of «قوالبي»: an ordinary copy with the name given, then the dialog's other fields. */
export async function newFromTemplate(id: string, name: string, fields: Record<string, unknown>) {
  setState({ modal: null });
  await engine.idle();
  try {
    const res = await api<{ projectId: string }>('/api/projects/' + encodeURIComponent(id) + '/from-template', { method: 'POST', json: { name: name.trim() || 'مشروع جديد' } });
    await openProject(res.projectId);
    if (Object.keys(fields).length) updateProject(fields, 'إعداد المشروع', undefined, res.projectId);
  } catch {
    toast('ما قدرنا ننشئ المشروع من القالب', { tone: 'danger' });
  }
}

/** Adds a scene template at the end of the open project (§7.2). */
export async function addSceneFromTemplate(tplId: string, o: { pos?: { x: number; y: number }; open?: boolean } = {}): Promise<string | null> {
  const p = project();
  if (!p) return null;
  let snap: { rows: TemplateRows; images: ImageMeta[] };
  try {
    snap = await api('/api/projects/' + encodeURIComponent(tplId));
  } catch {
    toast('ما قدرنا نجيب القالب', { tone: 'danger' });
    return null;
  }
  const cur = project();
  if (!cur || cur.id !== p.id) return null;
  const last = cur.scenes[cur.scenes.length - 1];
  const pos = o.pos ?? (last ? { x: last.boardX - 320, y: last.boardY } : centerWorldRef());
  const live = (m: Map<string, Row>) => [...m.values()].filter((r) => !r.deletedAt && r.projectId === cur.id);
  const res = sceneTemplateOps(snap.rows, {
    projectId: cur.id, position: positionAt(cur.scenes, cur.scenes.length), boardX: pos.x, boardY: pos.y, z: nextZ(),
    characters: live(engine.store.characters), locations: live(engine.store.locations), newId: uid,
  });
  if (!res) return null;
  engine.addImages(snap.images ?? []); // the photos are shared by reference: their sizes and placeholders
  if (!commit(res.ops, { history: 'إضافة مشهد من قالب', flip: true })) return null;
  if (o.open !== false) openEditor('scene', res.sceneId);
  toast('انضاف المشهد من القالب', { undo: true });
  return res.sceneId;
}

/** «احفظ المشهد كقالب» in a scene's menus (not inside a scene template: that one already is). */
export function saveSceneEntry(sceneId: string): MenuEntry[] {
  const p = project();
  const sc = p?.scenes.find((s) => s.id === sceneId);
  if (!p || !sc || p.templateKind === 'scene') return [];
  return [{ label: 'احفظ المشهد كقالب', icon: 'bookmark', run: () => askSaveTemplate(p.id, sc.id, sc.name), testid: 'm-save-scene-tpl' }];
}

/** «احفظ كقالب» in a project's menus (a template isn't saved again). */
export function saveProjectEntry(id: string, name: string, kind: 'project' | 'scene' | null, testid = 'pm-save-tpl'): MenuEntry[] {
  return kind ? [] : [{ label: 'احفظ كقالب', icon: 'bookmark', run: () => askSaveTemplate(id, null, `قالب: ${name}`), testid }];
}

/** «+ مشهد» with scene templates: a menu («مشهد فاضي» + the templates); without any, a blank scene right away. */
/**
 * The scene templates, kept ready so «+ مشهد» answers at once (no wait for the network): loaded
 * when a project opens and after saving a template, refreshed quietly on every use.
 */
let sceneTpls: TemplateSummary[] | null = null;
export async function refreshSceneTemplates() {
  sceneTpls = await listTemplates('scene');
  return sceneTpls;
}

export async function sceneAddMenu(x: number, y: number, blank: () => void, o: { pos?: { x: number; y: number }; open?: boolean } = {}) {
  const ready = sceneTpls;
  const fresh = refreshSceneTemplates();
  const list = ready ?? (await fresh);
  if (!list.length) return blank();
  const entries: MenuEntry[] = [
    { label: 'مشهد فاضي', icon: 'plus', run: blank, testid: 'add-scene-blank' },
    'sep',
    { label: 'من قوالب المشاهد', note: true },
    ...list.map((t) => ({ label: t.name, icon: 'film', run: () => void addSceneFromTemplate(t.id, o), testid: 'add-scene-tpl' })),
    'sep',
    { label: 'احفظ مشهداً كقالب: من ⋯ على المشهد', icon: 'bookmark', note: true },
  ];
  openMenu(x, y, entries, 'scene-add-menu');
}
