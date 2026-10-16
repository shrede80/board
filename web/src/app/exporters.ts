import JSZip from 'jszip';
import { api } from '../data/api';
import { allShots, camLine, eqName, moveLine, type PProject } from '../data/project';
import { STATUS } from '../lib/constants';
import { download, imageUrl, mmss, pad2 } from '../lib/util';
import { buildXlsx } from '../lib/xlsx';
import { openProject } from './actions';
import { uploadFile } from './images';
import { engine, toast } from './state';
import type { Row } from '../../../shared/schema';

// ---------- shot list (table / Excel) ----------

export const shotCols = [
  { key: 'num', label: 'الرقم', width: 8 }, { key: 'scene', label: 'المشهد', width: 24 }, { key: 'desc', label: 'الوصف', align: 'right', width: 40 },
  { key: 'size', label: 'الحجم', width: 10 }, { key: 'angle', label: 'الزاوية', width: 16 }, { key: 'cam', label: 'الكاميرا والعدسة', width: 28 },
  { key: 'move', label: 'الحركة', width: 22 }, { key: 'light', label: 'الإضاءة', width: 24 }, { key: 'audio', label: 'الصوت', width: 22 },
  { key: 'dur', label: 'المدة', width: 8 }, { key: 'status', label: 'الحالة', width: 10 },
];

export function shotRows(p: PProject, eq: Map<string, Row>) {
  return allShots(p).map((x) => ({
    num: x.num, scene: `${pad2(x.si + 1)} ${x.sc.name}`, desc: x.sh.description || '', size: (x.sh.size as string) || '', angle: (x.sh.angle as string) || '',
    cam: camLine(eq, x.sh), move: moveLine(eq, x.sh), light: (x.sh.lightingIds ?? []).map((i) => eqName(eq, i)).join('، '),
    audio: (x.sh.audioIds ?? []).map((i) => eqName(eq, i)).join('، '), dur: mmss(x.sh.durationS), status: STATUS[x.sh.status]?.label ?? '',
  }));
}

export async function exportXlsx(p: PProject) {
  const rows = shotRows(p, engine.store.equipment);
  const blob = await buildXlsx('قائمة اللقطات', shotCols, rows.map((r) => shotCols.map((c) => r[c.key as keyof typeof r])));
  download(`${p.name} — قائمة اللقطات.xlsx`, blob);
  toast('قائمة اللقطات جاهزة');
}

/** PDF = the browser's print dialog with the @media print rules in dark.css (A4 landscape). */
export function printPdf() {
  // Wait for full-size images in the print pages to load first.
  const imgs = [...document.querySelectorAll<HTMLImageElement>('[data-print-root] img')];
  Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = i.onerror = r; })))).then(() => setTimeout(() => window.print(), 50));
}

// ---------- full project file (.zip) ----------

interface PortableImage { id: string; file: string | null }
interface Portable { format: string; project: Row; rows: Record<string, Row[]>; images: PortableImage[] }

export async function exportProjectZip(p: PProject, onProgress?: (done: number, total: number) => void) {
  await engine.idle();
  const data = await api<Portable>(`/api/projects/${encodeURIComponent(p.id)}/export`);
  const zip = new JSZip();
  zip.file('project.json', JSON.stringify(data, null, 2));
  const files = data.images.filter((i) => i.file);
  let done = 0;
  for (const im of files) {
    const res = await fetch(imageUrl(im.id, false), { credentials: 'same-origin' });
    if (!res.ok) throw new Error('image');
    const blob = await res.blob();
    const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/png' ? 'png' : 'webp';
    im.file = `images/${im.id}.${ext}`;
    zip.file(im.file, blob);
    onProgress?.(++done, files.length);
  }
  zip.file('project.json', JSON.stringify(data, null, 2));
  const out = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
  download(`${p.name}.zip`, out, 'application/zip');
  toast('انحفظت نسخة المشروع على جهازك');
}

export interface ImportPreview {
  zip: JSZip;
  data: Portable;
  name: string;
  counts: { scenes: number; shots: number; images: number; library: number };
}

/** Reads and checks a project .zip before anything is created. Throws an Arabic message on failure. */
export async function readProjectZip(file: File): Promise<ImportPreview> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('الملف مو نسخة مشروع صالحة (zip تالف أو نوع ثاني).');
  }
  const pj = zip.file('project.json');
  if (!pj) throw new Error('الملف ما فيه project.json — هو نسخة من «لوحة المشاهد»؟');
  let data: Portable;
  try {
    data = JSON.parse(await pj.async('string'));
  } catch {
    throw new Error('ملف project.json تالف وما ينقرأ.');
  }
  if (!data || data.format !== 'lawhat-almashahed/1' || !data.project || typeof data.rows !== 'object' || !Array.isArray(data.images)) {
    throw new Error('هذا الملف مو نسخة مشروع من «لوحة المشاهد».');
  }
  const missing = data.images.filter((i) => i.file && !zip.file(i.file));
  if (missing.length) throw new Error(`الملف ناقص: ${missing.length} صورة مو موجودة فيه.`);
  const n = (k: string) => (Array.isArray(data.rows[k]) ? data.rows[k].length : 0);
  return {
    zip, data, name: String(data.project.name ?? 'مشروع'),
    counts: { scenes: n('scenes'), shots: n('shots'), images: data.images.filter((i) => i.file).length, library: n('characters') + n('locations') + n('moodboards') },
  };
}

/** Uploads the photos, then creates a NEW project with new ids (never overwrites). */
export async function importProjectZip(pre: ImportPreview, onProgress?: (done: number, total: number) => void) {
  const imageMap: Record<string, string> = {};
  const files = pre.data.images.filter((i) => i.file);
  let done = 0;
  for (const im of files) {
    const blob = await pre.zip.file(im.file!)!.async('blob');
    const type = im.file!.endsWith('.jpg') ? 'image/jpeg' : im.file!.endsWith('.png') ? 'image/png' : 'image/webp';
    // stored byte for byte; only the thumbnail is generated
    imageMap[im.id] = await uploadFile(new File([blob], im.file!.split('/').pop()!, { type }), true);
    onProgress?.(++done, files.length);
  }
  const res = await api<{ projectId: string }>('/api/import', { method: 'POST', json: { project: pre.data, imageMap } });
  await openProject(res.projectId);
  toast('انستورد المشروع');
}
