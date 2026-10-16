import type { Store } from '../../../shared/model';
import type { Row } from '../../../shared/schema';
import { MOOD_PALETTE } from '../lib/constants';
import type { Img } from '../lib/util';
import type { ImageMeta } from './engine';

/**
 * Nested, ordered view of one project built from the flat store — the same shape the
 * prototype's view code works with (scenes → shots → images, library, notes, board cards).
 * Numbers are positions in these arrays, never stored (SPEC §3.3).
 */
export interface PShot extends Row {
  sceneId: string;
  description: string;
  status: 'planned' | 'shot' | 'approved';
  durationS: number;
  lightingIds: string[];
  audioIds: string[];
  images: Img[];
}
export interface PScene extends Row {
  name: string;
  mood: string;
  intExt: string;
  dayNight: string;
  locationId: string | null;
  boardX: number;
  boardY: number;
  boardW: number | null;
  boardZ: number;
  boardLocked: boolean;
  characterIds: string[];
  /** the scene's own cover (e.g. from an idea) when no shot carries it */
  coverImg: Img | null;
  noteIds: string[];
  moodboardIds: string[];
  shots: PShot[];
}
export interface PLib extends Row {
  name?: string;
  title?: string;
  images: Img[];
}
export interface PInbox extends Row {
  kind: 'image' | 'note';
  text: string;
  sceneId: string | null;
  createdAt: number;
  isNew: boolean;
  image: Img | null;
}
export type CardKind = 'note' | 'character' | 'location' | 'moodboard' | 'image' | 'heading' | 'frame';
export interface PCard extends Row {
  kind: CardKind;
  refId: string;
  x: number;
  y: number;
  w: number | null;
  h: number | null;
  z: number;
  locked: boolean;
  color: string | null;
  text: string;
}
export interface PProject {
  id: string;
  name: string;
  aspect: string;
  template: string;
  client: string;
  shootDate: string | null;
  shootTime: string | null;
  stage: string;
  archived: boolean;
  coverImageId: string | null;
  scenes: PScene[];
  library: { characters: PLib[]; locations: PLib[]; moodboards: PLib[]; inbox: PInbox[] };
  notes: Row[];
  cards: PCard[];
}

const live = (m: Map<string, Row>, pid: string) => [...m.values()].filter((r) => !r.deletedAt && r.projectId === pid);
const byPos = (a: Row, b: Row) => (a.position as number) - (b.position as number) || (a.id < b.id ? -1 : 1);

export interface Uploads {
  /** ownerKind:ownerId → images being uploaded (shown immediately) */
  [owner: string]: Img[];
}

let memo: { store: Store; images: Map<string, ImageMeta>; uploads: Uploads; pid: string; out: PProject | null } | null = null;

export function deriveProject(store: Store, images: Map<string, ImageMeta>, pid: string | null, uploads: Uploads): PProject | null {
  if (!pid) return null;
  if (memo && memo.store === store && memo.images === images && memo.uploads === uploads && memo.pid === pid) return memo.out;
  const p = store.projects.get(pid);
  if (!p || p.deletedAt) {
    memo = { store, images, uploads, pid, out: null };
    return null;
  }
  const img = (imageId: string, linkId?: string): Img => ({ imageId, linkId, placeholder: images.get(imageId)?.placeholder ?? null });
  const imgsBy = new Map<string, Img[]>();
  for (const r of live(store.itemImages, pid).sort(byPos)) {
    const k = `${r.ownerKind}:${r.ownerId}`;
    if (!imgsBy.has(k)) imgsBy.set(k, []);
    imgsBy.get(k)!.push(img(r.imageId as string, r.id));
  }
  const imagesOf = (kind: string, id: string) => [...(imgsBy.get(`${kind}:${id}`) ?? []), ...(uploads[`${kind}:${id}`] ?? [])];

  const shotsBy = new Map<string, PShot[]>();
  for (const r of live(store.shots, pid).sort(byPos)) {
    const sid = r.sceneId as string;
    if (!shotsBy.has(sid)) shotsBy.set(sid, []);
    shotsBy.get(sid)!.push({ ...(r as PShot), images: imagesOf('shot', r.id) });
  }
  const chars = new Map<string, string[]>();
  for (const r of live(store.sceneCharacters, pid)) {
    if (!chars.has(r.sceneId as string)) chars.set(r.sceneId as string, []);
    chars.get(r.sceneId as string)!.push(r.characterId as string);
  }
  const links = new Map<string, { notes: string[]; mbs: string[] }>();
  for (const r of live(store.sceneLinks, pid)) {
    const l = links.get(r.sceneId as string) ?? { notes: [], mbs: [] };
    (r.kind === 'note' ? l.notes : l.mbs).push(r.refId as string);
    links.set(r.sceneId as string, l);
  }
  const lib = (m: Map<string, Row>, kind: string) => live(m, pid).sort(byPos).map((r) => ({ ...r, images: imagesOf(kind, r.id) }) as PLib);
  const characters = lib(store.characters, 'character');
  const charIds = new Set(characters.map((c) => c.id));
  const notes = live(store.notes, pid);
  const noteIds = new Set(notes.map((n) => n.id));
  const moodboards = lib(store.moodboards, 'moodboard');
  const mbIds = new Set(moodboards.map((m) => m.id));

  const scenes: PScene[] = live(store.scenes, pid)
    .sort(byPos)
    .map((r) => ({
      ...(r as PScene),
      characterIds: (chars.get(r.id) ?? []).filter((c) => charIds.has(c)),
      noteIds: (links.get(r.id)?.notes ?? []).filter((n) => noteIds.has(n)),
      moodboardIds: (links.get(r.id)?.mbs ?? []).filter((m) => mbIds.has(m)),
      shots: shotsBy.get(r.id) ?? [],
      coverImg: r.coverImageId ? img(r.coverImageId as string) : null,
    }));

  const inbox: PInbox[] = live(store.inboxItems, pid)
    .sort((a, b) => (b.createdAt as number) - (a.createdAt as number))
    .map((r) => ({ ...(r as PInbox), image: r.imageId ? img(r.imageId as string) : null }));

  const out: PProject = {
    id: p.id,
    name: p.name as string,
    aspect: p.aspect as string,
    template: p.template as string,
    client: (p.client as string) ?? '',
    shootDate: (p.shootDate as string) ?? null,
    shootTime: (p.shootTime as string) ?? null,
    stage: (p.stage as string) ?? 'prep',
    archived: !!p.archived,
    coverImageId: (p.coverImageId as string) ?? null,
    scenes,
    library: { characters, locations: lib(store.locations, 'location'), moodboards, inbox },
    notes,
    cards: live(store.boardCards, pid) as PCard[],
  };
  memo = { store, images, uploads, pid, out };
  return out;
}

// ---------- lookups (prototype core helpers) ----------

export function coverOf(e: { images: Img[]; coverImageId?: unknown } | null | undefined): Img | null {
  if (!e || !e.images.length) return null;
  return e.images.find((i) => i.imageId === e.coverImageId) ?? e.images[0];
}

export function sceneCover(sc: PScene): Img | null {
  if (sc.coverImageId) {
    for (const sh of sc.shots) {
      const i = sh.images.find((x) => x.imageId === sc.coverImageId);
      if (i) return i;
    }
  }
  const first = sc.shots.find((s) => s.images.length);
  return first ? coverOf(first) : sc.coverImg;
}

export const sceneDur = (sc: PScene) => sc.shots.reduce((a, s) => a + (Number(s.durationS) || 0), 0);

export interface ShotRef {
  sc: PScene;
  sh: PShot;
  si: number;
  hi: number;
  num: string;
}
export function allShots(p: PProject): ShotRef[] {
  const out: ShotRef[] = [];
  p.scenes.forEach((sc, si) => sc.shots.forEach((sh, hi) => out.push({ sc, sh, si, hi, num: `${si + 1}.${hi + 1}` })));
  return out;
}
export function findShot(p: PProject, id: string): ShotRef | null {
  for (let si = 0; si < p.scenes.length; si++) {
    const sc = p.scenes[si];
    const hi = sc.shots.findIndex((s) => s.id === id);
    if (hi > -1) return { sc, sh: sc.shots[hi], si, hi, num: `${si + 1}.${hi + 1}` };
  }
  return null;
}

export function moodHex(m: string | null | undefined): string {
  if (m && MOOD_PALETTE[m]) return MOOD_PALETTE[m].hex;
  return /^#/.test(m || '') ? (m as string) : '#7c8288';
}
export function moodName(m: string | null | undefined): string {
  return (m && MOOD_PALETTE[m]?.name) || 'مخصص';
}

/** Equipment index including virtual supports (drone, handheld). */
export function eqName(eq: Map<string, Row>, id: string | null | undefined): string {
  if (!id) return '';
  const e = eq.get(id);
  return e ? ((e.short as string) || (e.model as string) || (e.name as string)) : id;
}

export function camLine(eq: Map<string, Row>, sh: Row): string {
  const cam = eq.get(sh.cameraId as string);
  const name = eqName(eq, sh.cameraId as string);
  if (!name) return '';
  if (cam?.lensIds) return `${name} · ${eqName(eq, sh.lens as string) || ''}${sh.focalMm ? ' عند ' + sh.focalMm + 'mm' : ''}`;
  if (cam?.builtinLenses) return `${name} · ${((sh.lens as string) || '').split(' ')[0]}`;
  if (cam?.zoomOnly) return `${name} · ${sh.focalMm || ''}mm`;
  return name;
}

export function moveLine(eq: Map<string, Row>, sh: Row): string {
  if (sh.rigId === 'sup-drone') return (sh.motion as string) || '';
  return [sh.motion as string, eqName(eq, sh.rigId as string)].filter(Boolean).join(' · ');
}
