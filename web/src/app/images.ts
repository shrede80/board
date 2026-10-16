import { placeAt, positionAt } from '../../../shared/model';
import { MAX_UPLOAD_BYTES, type Op, type Row } from '../../../shared/schema';
import { api } from '../data/api';
import { coverOf, type PLib, type PShot } from '../data/project';
import type { Img } from '../lib/util';
import { uid } from '../lib/util';
import { commit, renumberOps } from './actions';
import { engine, getState, project, setState, toast } from './state';

/**
 * Images (SPEC §4): resized in the browser to ≤ 2400 px + a 480 px thumbnail, WebP ~0.82
 * (JPEG when the browser can't encode WebP, e.g. some Safari versions), uploaded through the
 * Worker, then linked to their owner. While uploading, the local preview shows immediately.
 */

const FULL = 2400;
const THUMB = 480;
const QUALITY = 0.82;

export type OwnerKind = 'shot' | 'character' | 'location' | 'moodboard';
export interface Target {
  type: OwnerKind;
  id: string;
}

async function encode(bmp: ImageBitmap, max: number): Promise<Blob> {
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  const webp = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', QUALITY));
  if (webp && webp.type === 'image/webp') return webp;
  return (await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85)))!;
}

/** keepOriginal: a photo that is already small enough is stored byte for byte (project import). */
export async function compress(file: File, keepOriginal = false): Promise<{ full: Blob; thumb: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  try {
    const asIs = keepOriginal && Math.max(bmp.width, bmp.height) <= FULL && /^image\/(webp|jpeg|png)$/.test(file.type);
    const full = asIs ? file : await encode(bmp, FULL);
    const thumb = await encode(bmp, THUMB);
    const scale = Math.min(1, FULL / Math.max(bmp.width, bmp.height));
    return { full, thumb, width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) };
  } finally {
    bmp.close();
  }
}

/** Compresses and uploads one file; returns the new image id. */
export async function uploadFile(file: File, keepOriginal = false): Promise<string> {
  if (!/^image\//.test(file.type)) throw new Error('type');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('size');
  return uploadCompressed(await compress(file, keepOriginal));
}

export type Compressed = Awaited<ReturnType<typeof compress>>;

/** Uploads an image already compressed in the browser (also used by the offline idea queue). */
export async function uploadCompressed(c: Compressed): Promise<string> {
  const fd = new FormData();
  const ext = (b: Blob) => (b.type === 'image/webp' ? 'webp' : b.type === 'image/png' ? 'png' : 'jpg');
  fd.set('file', new File([c.full], `image.${ext(c.full)}`, { type: c.full.type }));
  fd.set('thumb', new File([c.thumb], `thumb.${ext(c.thumb)}`, { type: c.thumb.type }));
  fd.set('width', String(c.width));
  fd.set('height', String(c.height));
  const res = await api<{ id: string; width: number; height: number }>('/api/images', { method: 'POST', body: fd });
  engine.addImages([{ id: res.id, width: res.width, height: res.height, placeholder: null }]);
  return res.id;
}

const ownerKey = (t: Target) => `${t.type}:${t.id}`;

function setUploads(key: string, f: (list: Img[]) => Img[]) {
  setState((s) => {
    const list = f(s.uploads[key] ?? []);
    const uploads = { ...s.uploads };
    if (list.length) uploads[key] = list;
    else delete uploads[key];
    return { uploads };
  });
}

const files = new Map<string, File>();

/** Adds files as images of a shot / character / location / moodboard. */
export function addFiles(target: Target, list: FileList | File[]) {
  if (getState().offline) return toast('لا يوجد اتصال، التغييرات لن تُحفظ', { tone: 'danger' });
  const imgs = [...list].filter((f) => /^image\//.test(f.type));
  if (!imgs.length) return;
  for (const f of imgs) {
    if (f.size > MAX_UPLOAD_BYTES) {
      toast('الصورة أكبر من 15MB', { tone: 'danger' });
      continue;
    }
    const tempId = uid('up');
    files.set(tempId, f);
    setUploads(ownerKey(target), (l) => [...l, { imageId: tempId, localUrl: URL.createObjectURL(f), uploading: true }]);
    void runUpload(target, tempId);
  }
}

async function runUpload(target: Target, tempId: string) {
  const key = ownerKey(target);
  const f = files.get(tempId);
  if (!f) return;
  setUploads(key, (l) => l.map((i) => (i.imageId === tempId ? { ...i, error: false, uploading: true } : i)));
  try {
    const imageId = await uploadFile(f);
    linkImage(target, imageId);
    setUploads(key, (l) => {
      const it = l.find((i) => i.imageId === tempId);
      if (it?.localUrl) setTimeout(() => URL.revokeObjectURL(it.localUrl!), 5000);
      return l.filter((i) => i.imageId !== tempId);
    });
    files.delete(tempId);
  } catch {
    setUploads(key, (l) => l.map((i) => (i.imageId === tempId ? { ...i, error: true, uploading: false } : i)));
    toast('فشل رفع صورة — أعد المحاولة', { tone: 'danger' });
  }
}

export function retryUpload(target: Target, tempId: string) {
  void runUpload(target, tempId);
}

function ownerOf(target: Target): (PShot | PLib) | null {
  const p = project();
  if (!p) return null;
  if (target.type === 'shot') {
    for (const sc of p.scenes) {
      const s = sc.shots.find((x) => x.id === target.id);
      if (s) return s;
    }
    return null;
  }
  const lib = target.type === 'character' ? p.library.characters : target.type === 'location' ? p.library.locations : p.library.moodboards;
  return lib.find((x) => x.id === target.id) ?? null;
}

const OWNER_ENTITY = { shot: 'shots', character: 'characters', location: 'locations', moodboard: 'moodboards' } as const;

function linkImage(target: Target, imageId: string) {
  const p = project();
  const o = ownerOf(target);
  if (!p || !o) return;
  const linked = o.images.filter((i) => i.linkId) as unknown as Row[];
  const ops: Op[] = [{ op: 'create', entity: 'itemImages', id: uid('ii'), fields: { projectId: p.id, ownerKind: target.type, ownerId: target.id, imageId, position: positionAt(linkedPositions(linked), linked.length) } }];
  if (!o.coverImageId && target.type !== 'moodboard') ops.push({ op: 'update', entity: OWNER_ENTITY[target.type], id: target.id, fields: { coverImageId: imageId } });
  commit(ops, { history: 'إضافة صورة' });
}

/** item_images rows behind the images of an owner, in order. */
function linkedPositions(linked: Row[]): Row[] {
  return linked.map((i) => engine.store.itemImages.get((i as unknown as Img).linkId!)!).filter(Boolean);
}

export function setCover(target: Target, imageId: string) {
  commit([{ op: 'update', entity: OWNER_ENTITY[target.type], id: target.id, fields: { coverImageId: imageId } }], { history: 'صورة الغلاف' });
}

export function removeImage(target: Target, img: Img) {
  const o = ownerOf(target);
  if (!o) return;
  if (!img.linkId) {
    // a failed/pending upload: just drop the preview
    setUploads(ownerKey(target), (l) => l.filter((i) => i.imageId !== img.imageId));
    files.delete(img.imageId);
    return;
  }
  const ops: Op[] = [{ op: 'delete', entity: 'itemImages', id: img.linkId }];
  if (coverOf(o)?.imageId === img.imageId && o.coverImageId) {
    const next = o.images.find((i) => i.linkId && i.imageId !== img.imageId);
    ops.push({ op: 'update', entity: OWNER_ENTITY[target.type], id: target.id, fields: { coverImageId: next?.imageId ?? null } });
  }
  commit(ops, { history: 'حذف صورة' });
}

export function moveImage(target: Target, from: number, to: number) {
  const o = ownerOf(target);
  if (!o) return;
  const linked = o.images.filter((i) => i.linkId);
  const moving = linked[from];
  if (!moving || from === to) return;
  const rows = linkedPositions(linked as unknown as Row[]).filter((r) => r.id !== moving.linkId);
  const at = placeAt(rows, to);
  commit([...renumberOps('itemImages', at.renumber), { op: 'update', entity: 'itemImages', id: moving.linkId!, fields: { position: at.position } }], { history: 'ترتيب الصور' });
}

/** Files dropped on the empty board become a new moodboard card. */
export async function filesToMoodboard(list: FileList, pos: { x: number; y: number }) {
  const p = project();
  if (!p || getState().offline) return;
  const imgs = [...list].filter((f) => /^image\//.test(f.type) && f.size <= MAX_UPLOAD_BYTES);
  if (!imgs.length) return;
  toast('يرفع الصور…');
  try {
    const ids = await Promise.all(imgs.map((f) => uploadFile(f)));
    const mid = uid('mb');
    const ops: Op[] = [
      { op: 'create', entity: 'moodboards', id: mid, fields: { projectId: p.id, position: positionAt(p.library.moodboards, p.library.moodboards.length), title: 'لوحة مزاج', swatches: [] } },
      ...ids.map((imageId, i): Op => ({ op: 'create', entity: 'itemImages', id: uid('ii'), fields: { projectId: p.id, ownerKind: 'moodboard', ownerId: mid, imageId, position: i + 1 } })),
      { op: 'create', entity: 'boardCards', id: uid('bc'), fields: { projectId: p.id, kind: 'moodboard', refId: mid, x: pos.x, y: pos.y } },
    ];
    commit(ops, { history: 'لوحة مزاج' });
  } catch {
    toast('فشل رفع صورة — أعد المحاولة', { tone: 'danger' });
  }
}
