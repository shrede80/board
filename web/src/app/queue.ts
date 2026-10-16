import { MAX_IDEA_IMAGES, MAX_UPLOAD_BYTES } from '../../../shared/schema';
import { api, ApiError } from '../data/api';
import { uid } from '../lib/util';
import { compress, uploadCompressed, type Compressed } from './images';
import { getState, setState, toast, type PendingIdea } from './state';

/**
 * Ideas typed on the phone wait here until they reach the server (UPDATE-1 ج8).
 * IndexedDB keeps the text and the photos already compressed in the browser. Items are sent in
 * order; the idea id is made on the phone, so sending the same item twice still makes one idea
 * (the server ignores a second create). Uploaded photo ids are remembered per item, so a retry
 * does not upload them again. Connection problems, 5xx and an ended session leave the item
 * waiting; any other refusal marks it failed with «إعادة المحاولة» and «حذف».
 */

interface StoredImage extends Compressed {
  uploadedId?: string;
}
interface Stored {
  id: string;
  text: string;
  projectId: string | null;
  sceneId: string | null;
  createdAt: number;
  images: StoredImage[];
  failed?: string;
}

const DB_NAME = 'lawhat';
const STORE = 'pendingIdeas';
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    dbp.catch(() => (dbp = null));
  }
  return dbp;
}

async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = f(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const all = async () => ((await tx('readonly', (s) => s.getAll())) as Stored[]).sort((a, b) => a.createdAt - b.createdAt);
const put = (x: Stored) => tx('readwrite', (s) => s.put(x));
const del = (id: string) => tx('readwrite', (s) => s.delete(id));

// ---------- the list shown in the UI ----------

const urls = new Map<string, string[]>();

export async function refreshPending() {
  let items: Stored[] = [];
  try {
    items = await all();
  } catch {
    /* IndexedDB unavailable (private mode): nothing can be waiting */
  }
  const ids = new Set(items.map((i) => i.id));
  for (const [id, list] of urls) if (!ids.has(id)) (list.forEach((u) => URL.revokeObjectURL(u)), urls.delete(id));
  const views: PendingIdea[] = items.map((i) => {
    if (!urls.has(i.id)) urls.set(i.id, i.images.map((im) => URL.createObjectURL(im.thumb)));
    return { id: i.id, text: i.text, projectId: i.projectId, sceneId: i.sceneId, createdAt: i.createdAt, thumbs: urls.get(i.id)!, failed: i.failed };
  });
  setState({ pending: views });
}

let askedPersist = false;
/** Asks the browser not to clear stored data on its own (UPDATE-1 ج8). */
export function requestPersist() {
  if (askedPersist) return;
  askedPersist = true;
  void navigator.storage?.persisted?.().then((on) => (on ? undefined : navigator.storage.persist?.())).catch(() => {});
}

/** Saves the idea on the device first, then sends it. Returns the idea id, or null if nothing was saved. */
export async function queueIdea(o: { text: string; files: File[]; projectId: string | null; sceneId: string | null }): Promise<string | null> {
  const files = o.files.filter((f) => /^image\//.test(f.type)).slice(0, MAX_IDEA_IMAGES);
  if (files.some((f) => f.size > MAX_UPLOAD_BYTES)) {
    toast('الصورة أكبر من 15 ميجا', { tone: 'danger' });
    return null;
  }
  const images: StoredImage[] = [];
  try {
    for (const f of files) images.push(await compress(f));
  } catch {
    toast('تعذّرت قراءة الصورة', { tone: 'danger' });
    return null;
  }
  const item: Stored = { id: uid('idea'), text: o.text.trim(), projectId: o.projectId, sceneId: o.sceneId, createdAt: Date.now(), images };
  try {
    await put(item);
  } catch {
    toast('تعذّر حفظ الفكرة على الجهاز', { tone: 'danger' });
    return null;
  }
  requestPersist();
  await refreshPending();
  void flushQueue();
  return item.id;
}

const permanent = (e: unknown) => e instanceof ApiError && e.status >= 400 && e.status < 500 && ![401, 408, 429].includes(e.status);

let running = false;
let again = false;

/** Sends what is waiting, oldest first. Safe to call any time; concurrent calls queue up. */
export async function flushQueue() {
  if (running) return void (again = true);
  running = true;
  let sent = 0, waited = 0;
  try {
    const items = await all().catch(() => [] as Stored[]);
    for (const it of items) {
      if (it.failed) continue;
      if (getState().auth !== 'app' || getState().bootOffline) break;
      try {
        for (const im of it.images) {
          if (im.uploadedId) continue;
          im.uploadedId = await uploadCompressed(im);
          await put(it);
        }
        await api('/api/ops', {
          method: 'POST',
          json: { ops: [{ op: 'create', entity: 'ideas', id: it.id, fields: {
            projectId: it.projectId, sceneId: it.sceneId, text: it.text, imageIds: it.images.map((im) => im.uploadedId), source: 'phone', isNew: true, createdAt: it.createdAt,
          } }] },
        });
        await del(it.id);
        sent++;
        if (Date.now() - it.createdAt > 5000) waited++;
      } catch (e) {
        if (!permanent(e)) break; // no connection, server busy, or signed out: try again later
        it.failed = e instanceof ApiError && typeof e.body.error === 'string' && /[؀-ۿ]/.test(e.body.error) ? e.body.error : 'رفض الخادم الفكرة';
        await put(it).catch(() => {});
      }
    }
  } finally {
    running = false;
    await refreshPending();
    if (sent) {
      if (waited) toast(waited === 1 ? 'أُرسلت الفكرة اللي كانت بانتظار الإنترنت' : `أُرسلت ${waited} أفكار كانت بانتظار الإنترنت`);
      const { pollNow } = await import('./actions');
      void pollNow();
    }
    if (again) {
      again = false;
      void flushQueue();
    }
  }
}

export async function retryPending(id: string) {
  const it = (await all()).find((x) => x.id === id);
  if (!it) return;
  delete it.failed;
  await put(it);
  await refreshPending();
  void flushQueue();
}

export async function deletePending(id: string) {
  await del(id).catch(() => {});
  await refreshPending();
}
