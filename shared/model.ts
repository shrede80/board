import type { EntityName, Row } from './schema';

/**
 * Normalized client-side store: one Map per entity. Pure helpers here are shared by the
 * web app and the tests — numbering, ordering, fractional positions.
 */
export type Store = Record<EntityName, Map<string, Row>>;

export function emptyStore(): Store {
  return {
    projects: new Map(), scenes: new Map(), shots: new Map(), characters: new Map(), locations: new Map(), moodboards: new Map(),
    notes: new Map(), boardCards: new Map(), inboxItems: new Map(), sceneCharacters: new Map(), sceneLinks: new Map(),
    itemImages: new Map(), equipment: new Map(),
  };
}

const byPos = (a: Row, b: Row) => (a.position as number) - (b.position as number) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function orderedScenes(s: Store, projectId?: string): Row[] {
  return [...s.scenes.values()].filter((r) => !r.deletedAt && (!projectId || r.projectId === projectId)).sort(byPos);
}

export function shotsOf(s: Store, sceneId: string): Row[] {
  return [...s.shots.values()].filter((r) => !r.deletedAt && r.sceneId === sceneId).sort(byPos);
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Scene and shot numbers are never stored (SPEC §3.3): scene = its index + 1, shot = "scene.index".
 * Shots whose scene is missing/deleted get no number.
 */
export function numbering(s: Store, projectId?: string): { scenes: Map<string, number>; shots: Map<string, string> } {
  const scenes = new Map<string, number>();
  const shots = new Map<string, string>();
  orderedScenes(s, projectId).forEach((sc, si) => {
    scenes.set(sc.id, si + 1);
    shotsOf(s, sc.id).forEach((sh, hi) => shots.set(sh.id, `${si + 1}.${hi + 1}`));
  });
  return { scenes, shots };
}

/**
 * A position strictly between `a` and `b` (either may be missing = list edge).
 * Fractional, so moving one item updates one row only.
 */
export function between(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null && b == null) return 1;
  if (a == null) return (b as number) - 1;
  if (b == null) return a + 1;
  return (a + b) / 2;
}

/** Position for inserting at `index` in an ordered list (index = list.length appends). */
export function positionAt(list: Row[], index: number, excludeId?: string): number {
  const l = excludeId ? list.filter((r) => r.id !== excludeId) : list;
  const i = Math.max(0, Math.min(index, l.length));
  return between(l[i - 1]?.position as number | undefined, l[i]?.position as number | undefined);
}

/**
 * Like positionAt, but when repeated halving has left no room between the neighbours it also
 * returns new evenly spaced positions for the whole list (sent as updates in the same write).
 */
export function placeAt(list: Row[], index: number, excludeId?: string): { position: number; renumber: { id: string; position: number }[] } {
  const l = excludeId ? list.filter((r) => r.id !== excludeId) : list;
  const i = Math.max(0, Math.min(index, l.length));
  const position = positionAt(l, i);
  const a = l[i - 1]?.position as number | undefined, b = l[i]?.position as number | undefined;
  const tight = (a != null && position - a < 1e-9) || (b != null && b - position < 1e-9);
  if (!tight) return { position, renumber: [] };
  const renumber = l.map((r, k) => ({ id: r.id, position: k < i ? k + 1 : k + 2 }));
  return { position: i + 1, renumber };
}

/** True when two neighbours are too close for another midpoint (after ~50 halvings). */
export function needsRebalance(list: Row[]): boolean {
  for (let i = 1; i < list.length; i++) {
    const gap = (list[i].position as number) - (list[i - 1].position as number);
    if (gap < 1e-9) return true;
  }
  return false;
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
