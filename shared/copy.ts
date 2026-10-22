import type { Op, Row } from './schema';

/**
 * «تكرار مشهد» (UPDATE-1 أ6): a deep copy built as plain create ops (one undo step).
 * Shots and their photos (same image ids, by reference), characters and location (same
 * library items, new links), linked notes (new copies), linked moodboards (new links).
 */
export interface SceneSnap {
  scene: Row;
  shots: Row[];
  /** item_images rows of those shots */
  shotImages: Row[];
  /** ids of the characters linked to the scene */
  chars: string[];
  /** note rows linked to the scene */
  notes: Row[];
  /** ids of the moodboards linked to the scene */
  moodboards: string[];
  /** the scene's shot plan (UPDATE-3 §6) */
  plan?: Row[];
}

export const stripRow = (r: Row): Record<string, unknown> => {
  const { id: _i, updatedAt: _u, deletedAt: _d, ...f } = r;
  return f;
};

export function copySceneOps(
  s: SceneSnap,
  o: { projectId: string; position: number; dx: number; dy: number; z: number; newId: (prefix: string) => string; exists?: (kind: 'character' | 'moodboard', id: string) => boolean },
): { sceneId: string; ops: Op[] } {
  const exists = o.exists ?? (() => true);
  const sid = o.newId('sc');
  const ops: Op[] = [{
    op: 'create', entity: 'scenes', id: sid,
    fields: {
      ...stripRow(s.scene), name: `${(s.scene.name as string) || ''} (نسخة)`.trim(), position: o.position,
      boardX: Math.round((s.scene.boardX as number) + o.dx), boardY: Math.round((s.scene.boardY as number) + o.dy), boardLocked: false, boardZ: o.z,
    },
  }];
  for (const sh of s.shots) {
    const hid = o.newId('sh');
    ops.push({ op: 'create', entity: 'shots', id: hid, fields: { ...stripRow(sh), sceneId: sid } });
    for (const ii of s.shotImages.filter((r) => r.ownerId === sh.id)) ops.push({ op: 'create', entity: 'itemImages', id: o.newId('ii'), fields: { ...stripRow(ii), ownerId: hid } });
  }
  for (const ch of s.chars) if (exists('character', ch)) ops.push({ op: 'create', entity: 'sceneCharacters', id: `${sid}:${ch}`, fields: { projectId: o.projectId, sceneId: sid, characterId: ch } });
  for (const n of s.notes) {
    const nid = o.newId('note');
    ops.push({ op: 'create', entity: 'notes', id: nid, fields: { projectId: o.projectId, text: n.text } });
    ops.push({ op: 'create', entity: 'sceneLinks', id: `${sid}:note:${nid}`, fields: { projectId: o.projectId, sceneId: sid, kind: 'note', refId: nid } });
  }
  for (const it of s.plan ?? []) ops.push({ op: 'create', entity: 'planItems', id: o.newId('pl'), fields: { ...stripRow(it), projectId: o.projectId, sceneId: sid } });
  for (const mb of s.moodboards) if (exists('moodboard', mb)) ops.push({ op: 'create', entity: 'sceneLinks', id: `${sid}:moodboard:${mb}`, fields: { projectId: o.projectId, sceneId: sid, kind: 'moodboard', refId: mb } });
  return { sceneId: sid, ops };
}
