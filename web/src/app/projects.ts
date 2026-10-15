import type { Op } from '../../../shared/schema';
import { api } from '../data/api';
import { uid } from '../lib/util';
import { commit, openProject } from './actions';
import { askConfirm, engine, getState, project, setState, toast } from './state';

/**
 * Project-level actions (UPDATE-1 أ1, أ9, أ10): rename, settings, duplicate, archive, delete,
 * sign out, reload for a new version.
 *
 * Phase A has no Home screen yet: «الرئيسية» opens the projects list (the Home screen
 * replaces it in phase B).
 */

export function goHome() {
  setState({ modal: 'projects', projMenu: false, popMenu: null });
}

/** Changes fields of the open project (undoable like any edit). */
export function updateProject(fields: Record<string, unknown>, label = 'تعديل المشروع', key?: string) {
  const p = project();
  if (!p) return;
  commit([{ op: 'update', entity: 'projects', id: p.id, fields }], { history: label, key: key ? `project:${p.id}:${key}` : undefined });
}

export function renameProject(name: string) {
  const p = project();
  const n = name.trim();
  if (!p || !n || n === p.name) return;
  updateProject({ name: n }, 'إعادة تسمية المشروع');
}

export function archiveProject(on: boolean) {
  const p = project();
  if (!p) return;
  updateProject({ archived: on }, on ? 'أرشفة' : 'إلغاء الأرشفة');
  toast(on ? 'أُرشف المشروع — يبقى في «المؤرشفة»' : 'أُلغيت الأرشفة', { undo: true });
}

/** Server-side copy (UPDATE-1 أ1). */
export async function duplicateProject(id: string, keepStatus: boolean) {
  setState({ modal: null });
  await engine.idle();
  try {
    const res = await api<{ projectId: string }>(`/api/projects/${encodeURIComponent(id)}/duplicate`, { method: 'POST', json: { keepStatus } });
    toast('تكرّر المشروع', { actions: [{ label: 'فتح', run: () => void openProject(res.projectId), testid: 'toast-open' }], ms: 8000 });
  } catch {
    toast('تعذّر تكرار المشروع', { tone: 'danger' });
  }
}

/**
 * Delete to the trash (30 days). The open project is left first; the toast's «تراجع» restores
 * it from the trash and reopens it.
 */
export function deleteProject(id: string, name: string) {
  askConfirm({
    title: 'حذف المشروع؟',
    msg: `سيذهب «${name}» إلى السلة 30 يوماً ويمكنك استعادته.`,
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
    setState({ settings: { ...s, lastProjectId: null } });
    api('/api/settings', { method: 'PATCH', json: { lastProjectId: null } }).catch(() => {});
  }
  if (getState().projectId === id) await openFallback(id);
  goHome();
  toast(`حُذف المشروع «${name}»`, {
    ms: 8000,
    actions: [{
      label: 'تراجع', testid: 'toast-undo-project',
      run: () => void api(`/api/trash/${encodeURIComponent(trashId)}/restore`, { method: 'POST' })
        .then(() => openProject(id))
        .catch(() => toast('تعذّرت الاستعادة — جرّب من السلة', { tone: 'danger' })),
    }],
  });
}

interface Summary { id: string; archived?: boolean; updatedAt: number }

/** Opens the most recent other active project (or a new empty one if none is left). */
async function openFallback(leaving: string) {
  const list = await api<Summary[]>('/api/projects').catch(() => [] as Summary[]);
  const next = list.find((p) => p.id !== leaving && !p.archived) ?? list.find((p) => p.id !== leaving);
  if (next) return openProject(next.id);
  const pid = uid('pr');
  await api('/api/ops', { method: 'POST', json: { ops: [{ op: 'create', entity: 'projects', id: pid, fields: { name: 'مشروع جديد', template: 'blank', aspect: '16:9' } }] } });
  return openProject(pid);
}

// ---------- sign out (UPDATE-1 أ9) ----------

export function askLogout() {
  setState({ menu: false });
  askConfirm({
    title: 'تسجيل الخروج؟',
    msg: 'ستحتاج كلمة السر للدخول مرة أخرى على هذا الجهاز.',
    ok: 'تسجيل الخروج',
    danger: true,
    onOk: () => void logout(),
  });
}

export async function logout() {
  await engine.idle().catch(() => {});
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  setState({ auth: 'login', loaded: false, projectId: null, editor: null, modal: null, selection: [], menu: false });
}

// ---------- new version (UPDATE-1 أ10) ----------

/** Waits for pending saves, then reloads into the new version. */
export async function reloadForUpdate() {
  await engine.idle();
  location.reload();
}
