import type { Op, Row } from './schema';

/**
 * Ideas box logic shared by laptop and phone (UPDATE-1 ب2): links in the text, and the five
 * «حوّلها إلى…» conversions as plain ops. The idea is discarded in the same write, so one undo
 * brings it back and removes what was made.
 */

export type Segment = { text: string; href?: string };
const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]»،])/gi;

/** Splits text into plain parts and links (https://… or www.…). */
export function linkify(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i) });
    const raw = m[0];
    out.push({ text: raw, href: /^https?:/i.test(raw) ? raw : `https://${raw}` });
    last = i + raw.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Short label for a link: «instagram.com/reel/…» */
export function shortUrl(href: string): string {
  try {
    const u = new URL(href);
    const path = u.pathname.split('/').filter(Boolean);
    return `${u.hostname.replace(/^www\./, '')}${path.length ? `/${path[0]}` : ''}${path.length > 1 || u.search ? '/…' : ''}`;
  } catch {
    return href.slice(0, 40);
  }
}

/** First line (≤ 60 chars) as a title, the rest as a summary. */
export function titleAndRest(text: string): { title: string; rest: string } {
  const t = text.trim();
  const nl = t.indexOf('\n');
  const first = (nl === -1 ? t : t.slice(0, nl)).trim();
  if (first.length <= 60) return { title: first, rest: nl === -1 ? '' : t.slice(nl + 1).trim() };
  return { title: `${first.slice(0, 59)}…`, rest: t };
}

export type ConvertKind = 'shot' | 'scene' | 'refs' | 'note' | 'moodboard';

export interface ConvertCtx {
  projectId: string;
  newId: (prefix: string) => string;
  /** shot: target scene, position at its end, field defaults (camera, lens… of its last shot) */
  shot?: { sceneId: string; position: number; fields: Record<string, unknown> };
  /** scene: position at the end of the project and a board spot */
  scene?: { position: number; boardX: number; boardY: number; boardZ: number };
  /** refs: the existing shot */
  refs?: { shotId: string; sceneId: string; nextImagePosition: number; hasCover: boolean };
  /** note: where it lands on the board */
  note?: { x: number; y: number; z: number };
  /** moodboard: position at the end of the library */
  moodboard?: { position: number };
}

/** Ops for one conversion (the idea's discard included). `made` = the main new row. */
export function convertIdeaOps(idea: Row, kind: ConvertKind, c: ConvertCtx): { ops: Op[]; made: { entity: string; id: string } } {
  const text = ((idea.text as string) ?? '').trim();
  const images = ((idea.imageIds as string[]) ?? []).filter(Boolean);
  const pid = c.projectId;
  const ops: Op[] = [];
  const imgOps = (ownerKind: 'shot' | 'moodboard', ownerId: string, from = 1) =>
    images.map((imageId, k): Op => ({ op: 'create', entity: 'itemImages', id: c.newId('ii'), fields: { projectId: pid, ownerKind, ownerId, imageId, position: from + k } }));
  let made = { entity: '', id: '' };

  if (kind === 'shot') {
    const s = c.shot!;
    const id = c.newId('sh');
    ops.push({ op: 'create', entity: 'shots', id, fields: { ...s.fields, projectId: pid, sceneId: s.sceneId, position: s.position, description: text, coverImageId: images[0] ?? null } });
    ops.push(...imgOps('shot', id));
    made = { entity: 'shots', id };
  } else if (kind === 'scene') {
    const s = c.scene!;
    const id = c.newId('sc');
    const { title, rest } = titleAndRest(text);
    ops.push({
      op: 'create', entity: 'scenes', id,
      fields: { projectId: pid, position: s.position, name: title || 'مشهد جديد', summary: rest, intExt: 'ext', dayNight: 'day', mood: 'sand', locationId: null, goal: '', coverImageId: images[0] ?? null, boardX: s.boardX, boardY: s.boardY, boardZ: s.boardZ },
    });
    if (images.length > 1) {
      const mb = c.newId('mb');
      ops.push({ op: 'create', entity: 'moodboards', id: mb, fields: { projectId: pid, title: title || 'لوحة مزاج', swatches: [], position: c.moodboard?.position ?? Date.now() } });
      ops.push(...imgOps('moodboard', mb));
      ops.push({ op: 'create', entity: 'sceneLinks', id: `${id}:moodboard:${mb}`, fields: { projectId: pid, sceneId: id, kind: 'moodboard', refId: mb } });
    }
    made = { entity: 'scenes', id };
  } else if (kind === 'refs') {
    const r = c.refs!;
    ops.push(...imgOps('shot', r.shotId, r.nextImagePosition));
    if (!r.hasCover && images[0]) ops.push({ op: 'update', entity: 'shots', id: r.shotId, fields: { coverImageId: images[0] } });
    if (text) {
      const note = c.newId('note');
      ops.push({ op: 'create', entity: 'notes', id: note, fields: { projectId: pid, text } });
      ops.push({ op: 'create', entity: 'sceneLinks', id: `${r.sceneId}:note:${note}`, fields: { projectId: pid, sceneId: r.sceneId, kind: 'note', refId: note } });
    }
    made = { entity: 'shots', id: r.shotId };
  } else if (kind === 'note') {
    const n = c.note!;
    const note = c.newId('note');
    ops.push({ op: 'create', entity: 'notes', id: note, fields: { projectId: pid, text } });
    ops.push({ op: 'create', entity: 'boardCards', id: c.newId('bc'), fields: { projectId: pid, kind: 'note', refId: note, x: n.x, y: n.y, z: n.z } });
    // the photos land next to the note, leftwards (RTL)
    images.forEach((imageId, k) => ops.push({ op: 'create', entity: 'boardCards', id: c.newId('bc'), fields: { projectId: pid, kind: 'image', refId: imageId, x: n.x - (k + 1) * 284, y: n.y, z: n.z + k + 1 } }));
    made = { entity: 'notes', id: note };
  } else {
    const id = c.newId('mb');
    const { title } = titleAndRest(text);
    ops.push({ op: 'create', entity: 'moodboards', id, fields: { projectId: pid, title: title || 'لوحة مزاج', swatches: [], position: c.moodboard!.position } });
    ops.push(...imgOps('moodboard', id));
    made = { entity: 'moodboards', id };
  }
  ops.push({ op: 'discard', entity: 'ideas', id: idea.id });
  return { ops, made };
}
