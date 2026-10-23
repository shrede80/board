import { describe, expect, it } from 'vitest';
import type { Row } from './schema';
import { sceneTemplateOps, templateBaseName } from './templates';

const row = (id: string, f: Record<string, unknown>): Row => ({ id, updatedAt: 1, deletedAt: null, ...f }) as Row;

describe('a scene template added to a project (UPDATE-3 §7.2)', () => {
  const t = {
    scenes: [row('sc-t', { projectId: 'pr-t', position: 1, name: 'مقابلة', locationId: 'loc-t', boardX: 5, boardY: 5 })],
    shots: [row('sh-2', { projectId: 'pr-t', sceneId: 'sc-t', position: 2, description: 'ب' }), row('sh-1', { projectId: 'pr-t', sceneId: 'sc-t', position: 1, description: 'أ' })],
    itemImages: [row('ii-1', { projectId: 'pr-t', ownerKind: 'shot', ownerId: 'sh-1', imageId: 'img-1', position: 1 }), row('ii-c', { projectId: 'pr-t', ownerKind: 'character', ownerId: 'ch-b', imageId: 'img-2', position: 1 })],
    planItems: [row('pl-1', { projectId: 'pr-t', sceneId: 'sc-t', kind: 'person', refId: 'ch-a', x: 1, y: 1 }), row('pl-2', { projectId: 'pr-t', sceneId: 'sc-t', kind: 'camera', refId: 'cam-zve10', x: 0, y: 2 })],
    characters: [row('ch-a', { projectId: 'pr-t', name: 'المقدّم' }), row('ch-b', { projectId: 'pr-t', name: 'الضيف' }), row('ch-x', { projectId: 'pr-t', name: 'ليس في المشهد' })],
    locations: [row('loc-t', { projectId: 'pr-t', name: 'الاستوديو' }), row('loc-x', { projectId: 'pr-t', name: 'موقع ثاني' })],
    sceneCharacters: [row('sc-t:ch-a', { sceneId: 'sc-t', characterId: 'ch-a' }), row('sc-t:ch-b', { sceneId: 'sc-t', characterId: 'ch-b' })],
  };
  let n = 0;
  const res = sceneTemplateOps(t, {
    projectId: 'pr-x', position: 9, boardX: 100, boardY: 50, z: 7, newId: (p) => `${p}-n${++n}`,
    characters: [row('ch-mine', { projectId: 'pr-x', name: ' المقدّم ', position: 4 })], locations: [],
  })!;
  const of = (e: string) => res.ops.filter((o) => o.op === 'create' && o.entity === e) as { id: string; fields: Record<string, unknown> }[];

  it('characters with the same name link to the project’s own; the others (and the location) are added with their photos', () => {
    // only the scene's own cast and location, placed at the end of the library
    expect(of('characters').map((o) => [o.fields.name, o.fields.position])).toEqual([['الضيف', 5]]);
    const guest = of('characters')[0].id;
    expect(of('sceneCharacters').map((o) => o.fields.characterId).sort()).toEqual(['ch-mine', guest].sort());
    expect(of('locations').map((o) => o.fields.name)).toEqual(['الاستوديو']);
    expect(of('scenes')[0].fields).toMatchObject({ projectId: 'pr-x', position: 9, locationId: of('locations')[0].id, boardX: 100, boardY: 50, boardZ: 7 });
    expect(of('itemImages').find((o) => o.fields.ownerId === guest)?.fields.imageId).toBe('img-2');
  });

  it('shots in order with their photos (same image, by reference), the plan with the person on the linked character; all in this project', () => {
    expect(of('shots').map((o) => o.fields.description)).toEqual(['أ', 'ب']);
    expect(of('shots').every((o) => o.fields.sceneId === res.sceneId)).toBe(true);
    expect(of('itemImages').find((o) => o.fields.imageId === 'img-1')?.fields.ownerId).toBe(of('shots')[0].id);
    expect(of('planItems').map((o) => o.fields.refId)).toEqual(['ch-mine', 'cam-zve10']);
    expect(res.ops.every((o) => o.op !== 'create' || (o.fields as Record<string, unknown>).projectId === 'pr-x')).toBe(true);
  });

  it('an empty template gives nothing; «قالب: …» names lose their prefix', () => {
    expect(sceneTemplateOps({}, { projectId: 'p', position: 1, boardX: 0, boardY: 0, z: 0, characters: [], locations: [], newId: (p) => p })).toBeNull();
    expect(templateBaseName('قالب: إعلان عقار')).toBe('إعلان عقار');
    expect(templateBaseName('مقابلة')).toBe('مقابلة');
  });
});
