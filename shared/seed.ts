import type { EntityName, Row } from './schema';

/**
 * Converts the prototype's `seed.json` (one nested document) into the project file format
 * used by import. Development and tests only — never shipped with the Worker.
 */
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface SeedPortable {
  format: 'lawhat-almashahed/1';
  exportedAt: string;
  project: Row;
  rows: Partial<Record<EntityName, Row[]>>;
  images: { id: string; width: number; height: number; placeholder: { x: number; y: number; v: number } | null; file: null }[];
}

export function seedProjects(seed: Any): SeedPortable[] {
  return (seed.projects as Any[]).map((p) => seedProject(p));
}

export function seedProject(p: Any): SeedPortable {
  const row = (id: string, fields: Any): Row => ({ id, updatedAt: 0, deletedAt: null, ...fields });
  const rows: Record<string, Row[]> = {
    scenes: [], shots: [], characters: [], locations: [], moodboards: [], notes: [], boardCards: [], inboxItems: [],
    sceneCharacters: [], sceneLinks: [], itemImages: [],
  };
  const images: SeedPortable['images'] = [];
  const addImages = (ownerKind: string, ownerId: string, list: Any[] = []) =>
    list.forEach((im, i) => {
      images.push({ id: im.id, width: 0, height: 0, placeholder: im.frame ?? { x: 50, y: 50, v: 0 }, file: null });
      rows.itemImages.push(row(`${ownerId}:${im.id}`, { ownerKind, ownerId, imageId: im.id, position: i + 1 }));
    });

  (p.scenes as Any[]).forEach((sc, si) => {
    rows.scenes.push(row(sc.id, {
      position: si + 1, name: sc.name, intExt: sc.intExt, dayNight: sc.dayNight, locationId: sc.locationId ?? null,
      summary: sc.summary ?? '', goal: sc.goal ?? '', mood: sc.mood, coverImageId: sc.coverImageId ?? null,
      boardX: sc.board?.x ?? 0, boardY: sc.board?.y ?? 0,
    }));
    for (const ch of sc.characterIds ?? []) rows.sceneCharacters.push(row(`${sc.id}:${ch}`, { sceneId: sc.id, characterId: ch }));
    for (const n of sc.noteIds ?? []) rows.sceneLinks.push(row(`${sc.id}:note:${n}`, { sceneId: sc.id, kind: 'note', refId: n }));
    for (const m of sc.moodboardIds ?? []) rows.sceneLinks.push(row(`${sc.id}:moodboard:${m}`, { sceneId: sc.id, kind: 'moodboard', refId: m }));
    (sc.shots as Any[]).forEach((sh, hi) => {
      rows.shots.push(row(sh.id, {
        sceneId: sc.id, position: hi + 1, description: sh.desc ?? '', size: sh.size ?? 'MS', angle: sh.angle ?? '',
        cameraId: sh.cameraId ?? null, lens: sh.lens ?? null, focalMm: sh.focal ?? null, filter: sh.filterId ?? null,
        motion: sh.movement ?? null, rigId: sh.supportId ?? null, lightingIds: sh.lightingIds ?? [], lightingMood: sh.lightingMood ?? '',
        audioIds: sh.audioIds ?? [], audioNotes: sh.audioNotes ?? '', dialogue: sh.dialogue ?? '', durationS: sh.duration ?? 0,
        status: sh.status ?? 'planned', coverImageId: sh.coverImageId ?? null,
      }));
      addImages('shot', sh.id, sh.images);
    });
  });
  const L = p.library ?? {};
  (L.characters ?? []).forEach((c: Any, i: number) => {
    rows.characters.push(row(c.id, { position: i + 1, name: c.name, role: c.role ?? '', description: c.desc ?? '', wardrobe: c.wardrobe ?? '', notes: c.notes ?? '', coverImageId: c.coverImageId ?? null }));
    addImages('character', c.id, c.images);
  });
  (L.locations ?? []).forEach((l: Any, i: number) => {
    rows.locations.push(row(l.id, { position: i + 1, name: l.name, address: l.address ?? '', mapUrl: l.mapUrl ?? '', notes: l.notes ?? '', coverImageId: l.coverImageId ?? null }));
    addImages('location', l.id, l.images);
  });
  (L.moodboards ?? []).forEach((m: Any, i: number) => {
    rows.moodboards.push(row(m.id, { position: i + 1, title: m.title, swatches: m.swatches ?? [], coverImageId: m.coverImageId ?? null }));
    addImages('moodboard', m.id, m.images);
  });
  (L.inbox ?? []).forEach((it: Any) => {
    let imageId: string | null = null;
    if (it.type === 'image') {
      imageId = `${it.id}-img`;
      images.push({ id: imageId, width: 0, height: 0, placeholder: it.frame ?? { x: 50, y: 50, v: 0 }, file: null });
    }
    rows.inboxItems.push(row(it.id, { kind: it.type, imageId, text: it.text ?? '', sceneId: it.sceneId ?? null, isNew: it.isNew !== false }));
  });
  for (const n of p.notes ?? []) rows.notes.push(row(n.id, { text: n.text ?? '' }));
  for (const c of p.board?.cards ?? []) rows.boardCards.push(row(c.id, { kind: c.kind, refId: c.refId, x: c.x, y: c.y }));

  return {
    format: 'lawhat-almashahed/1',
    exportedAt: new Date().toISOString(),
    project: row(p.id, { name: p.name, template: p.template, aspect: p.aspect }),
    rows: rows as Partial<Record<EntityName, Row[]>>,
    images,
  };
}
