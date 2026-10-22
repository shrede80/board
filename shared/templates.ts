import { stripRow } from './copy';
import type { Op, Row } from './schema';

/**
 * Saved templates (UPDATE-3 §7). Saving copies on the server (worker/src/duplicate.ts); adding a
 * scene template to a project is built here as ordinary create ops (one undo step): the scene with
 * its shots, photos and plan; its characters and locations link to the ones of the project that
 * have the same name, or are added to it (with their photos).
 */

/** Rows of a scene template project (its snapshot), by entity. */
export type TemplateRows = Partial<Record<'scenes' | 'shots' | 'itemImages' | 'planItems' | 'characters' | 'locations' | 'sceneCharacters', Row[]>>;

const same = (a: unknown, b: unknown) => String(a ?? '').trim().toLocaleLowerCase('ar') === String(b ?? '').trim().toLocaleLowerCase('ar') && String(a ?? '').trim() !== '';
const live = (l: Row[] | undefined) => (l ?? []).filter((r) => !r.deletedAt);

export function sceneTemplateOps(
  t: TemplateRows,
  o: {
    projectId: string;
    position: number;
    boardX: number;
    boardY: number;
    z: number;
    /** the project's live characters and locations (matched by name) */
    characters: Row[];
    locations: Row[];
    newId: (prefix: string) => string;
  },
): { sceneId: string; ops: Op[] } | null {
  const scene = live(t.scenes).sort((a, b) => (a.position as number) - (b.position as number))[0];
  if (!scene) return null;
  const ops: Op[] = [];
  const pid = o.projectId;
  const imgs = live(t.itemImages);
  const copyImages = (ownerId: string, to: string) => {
    for (const ii of imgs.filter((r) => r.ownerId === ownerId)) ops.push({ op: 'create', entity: 'itemImages', id: o.newId('ii'), fields: { ...stripRow(ii), projectId: pid, ownerId: to } });
  };

  // characters and locations: same name → the project's own, else a new one with its photos
  const ids = new Map<string, string>();
  const link = (list: Row[] | undefined, mine: Row[], entity: 'characters' | 'locations', prefix: string) => {
    for (const r of live(list)) {
      const hit = mine.find((m) => !m.deletedAt && same(m.name, r.name));
      if (hit) {
        ids.set(r.id, hit.id);
        continue;
      }
      const id = o.newId(prefix);
      ids.set(r.id, id);
      ops.push({ op: 'create', entity, id, fields: { ...stripRow(r), projectId: pid } });
      copyImages(r.id, id);
    }
  };
  link(t.characters, o.characters, 'characters', 'ch');
  link(t.locations, o.locations, 'locations', 'loc');

  const sid = o.newId('sc');
  ops.push({
    op: 'create', entity: 'scenes', id: sid,
    fields: {
      ...stripRow(scene), projectId: pid, position: o.position, locationId: scene.locationId ? ids.get(scene.locationId as string) ?? null : null,
      boardX: Math.round(o.boardX), boardY: Math.round(o.boardY), boardZ: o.z, boardLocked: false,
    },
  });
  for (const sh of live(t.shots).filter((r) => r.sceneId === scene.id).sort((a, b) => (a.position as number) - (b.position as number))) {
    const hid = o.newId('sh');
    ops.push({ op: 'create', entity: 'shots', id: hid, fields: { ...stripRow(sh), projectId: pid, sceneId: sid } });
    copyImages(sh.id, hid);
  }
  for (const it of live(t.planItems).filter((r) => r.sceneId === scene.id)) {
    const refId = it.kind === 'person' && it.refId ? ids.get(it.refId as string) ?? null : it.refId;
    ops.push({ op: 'create', entity: 'planItems', id: o.newId('pl'), fields: { ...stripRow(it), projectId: pid, sceneId: sid, refId } });
  }
  const seen = new Set<string>();
  for (const sc of live(t.sceneCharacters).filter((r) => r.sceneId === scene.id)) {
    const ch = ids.get(sc.characterId as string);
    if (!ch || seen.has(ch)) continue;
    seen.add(ch);
    ops.push({ op: 'create', entity: 'sceneCharacters', id: `${sid}:${ch}`, fields: { projectId: pid, sceneId: sid, characterId: ch } });
  }
  return { sceneId: sid, ops };
}

/** «قالب: إعلان عقار» → «إعلان عقار» (the new project's suggested name). */
export const templateBaseName = (name: string) => name.replace(/^\s*قالب\s*[:：]\s*/, '').trim();
