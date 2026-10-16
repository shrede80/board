import { activateNewShell } from './sw';
import type { Op } from '../../../shared/schema';
import { api } from '../data/api';
import { commit, forgetSession, openProject, pollNow, showHome } from './actions';
import { askConfirm, engine, getState, setState, toast } from './state';

/**
 * Project-level actions (UPDATE-1 أ1, أ9, أ10, ب1): rename, settings, duplicate, archive, delete,
 * sign out, reload for a new version. They work on the open project and, from Home, on any
 * project (Home keeps every project row in the store).
 */

export function goHome() {
  setState({ projMenu: false, popMenu: null });
  void showHome();
}

const openId = () => getState().projectId;

/** Changes fields of a project (undoable like any edit). Default: the open one. */
export function updateProject(fields: Record<string, unknown>, label = 'تعديل المشروع', key?: string, id = openId()) {
  if (!id || !engine.store.projects.get(id)) return;
  commit([{ op: 'update', entity: 'projects', id, fields }], { history: label, key: key ? `project:${id}:${key}` : undefined });
}

export function renameProject(name: string, id = openId()) {
  const row = id ? engine.store.projects.get(id) : null;
  const n = name.trim();
  if (!row || !n || n === row.name) return;
  updateProject({ name: n }, 'إعادة تسمية المشروع', undefined, id);
}

export function archiveProject(on: boolean, id = openId()) {
  if (!id) return;
  updateProject({ archived: on }, on ? 'أرشفة' : 'إلغاء الأرشفة', undefined, id);
  toast(on ? 'أُرشف المشروع' : 'أُلغيت الأرشفة', { undo: true });
}

/** «تكرار المشروع…» for any project. */
export function askDuplicate(id: string, name: string) {
  setState({ dupTarget: { id, name }, modal: 'duplicateProject', popMenu: null });
}

/** Server-side copy (UPDATE-1 أ1). */
export async function duplicateProject(id: string, keepStatus: boolean) {
  setState({ modal: null, dupTarget: null });
  await engine.idle();
  try {
    const res = await api<{ projectId: string }>(`/api/projects/${encodeURIComponent(id)}/duplicate`, { method: 'POST', json: { keepStatus } });
    if (!openId()) void pollNow(); // Home: the copy shows up in «مشاريعي»
    toast('تكرّر المشروع', { actions: [{ label: 'فتح', run: () => void openProject(res.projectId), testid: 'toast-open' }], ms: 8000 });
  } catch {
    toast('تعذّر تكرار المشروع', { tone: 'danger' });
  }
}

/** Opens a project, then one of its dialogs (Home ⋯ → settings / export). */
export async function openWith(id: string, modal: 'projectSettings' | 'export') {
  if (openId() !== id) await openProject(id);
  setState(modal === 'export' ? { modal, exportTab: 'project' } : { modal });
}

/**
 * Delete to the trash (30 days), then Home + a toast whose «تراجع» restores it (and reopens it
 * when it was the open project).
 */
export function deleteProject(id: string, name: string) {
  askConfirm({
    title: 'حذف المشروع؟',
    msg: `«${name}» يبقى في السلة 30 يوماً.`,
    ok: 'حذف',
    danger: true,
    onOk: () => void doDelete(id, name),
  });
}

async function doDelete(id: string, name: string) {
  await engine.idle();
  const trashId = `tr-${crypto.randomUUID()}`;
  const ops: Op[] = [{ op: 'delete', entity: 'projects', id, label: `مشروع: ${name}`, trashId }];
  try {
    await api('/api/ops', { method: 'POST', json: { ops } });
  } catch {
    toast('تعذّر حذف المشروع', { tone: 'danger' });
    return;
  }
  const s = getState().settings;
  if (s?.lastProjectId === id) {
    // «كمّل من حيث وقفت» forgets it
    setState({ settings: { ...s, lastProjectId: null } });
    api('/api/settings', { method: 'PATCH', json: { lastProjectId: null } }).catch(() => {});
  }
  const wasOpen = openId() === id;
  await showHome();
  toast(`حُذف المشروع «${name}»`, {
    ms: 8000,
    actions: [{
      label: 'تراجع', testid: 'toast-undo-project',
      run: () => void api(`/api/trash/${encodeURIComponent(trashId)}/restore`, { method: 'POST' })
        .then(() => (wasOpen ? openProject(id) : pollNow()))
        .catch(() => toast('تعذّرت الاستعادة، جرّب السلة', { tone: 'danger' })),
    }],
  });
}

// ---------- sign out (UPDATE-1 أ9) ----------

export function askLogout() {
  setState({ menu: false });
  askConfirm({
    title: 'تسجيل الخروج؟',
    msg: 'تحتاج كلمة السر للدخول مرة ثانية.',
    ok: 'تسجيل الخروج',
    danger: true,
    onOk: () => void logout(),
  });
}

export async function logout() {
  await engine.idle().catch(() => {});
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  forgetSession();
  setState({ auth: 'login', loaded: false, projectId: null, editor: null, modal: null, selection: [], menu: false });
}

// ---------- new version (UPDATE-1 أ10) ----------

/** Waits for pending saves, then reloads into the new version. */
export async function reloadForUpdate() {
  await engine.idle();
  await activateNewShell();
}
