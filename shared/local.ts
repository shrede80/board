import type { Store } from './model';
import { ENTITIES, type EntityName, type FieldDef, type Op, type Row } from './schema';
import { rowKey } from './sync';

/**
 * Applies ops to the local store immediately (optimistic UI), mirroring what the server does.
 * Returns, for each trash delete (by op index), the row keys it hid — so an undo can un-hide
 * them locally the moment the restore is sent.
 */
export function applyLocal(store: Store, ops: Op[], hidden: Map<string, string[]>, now = Date.now()): { store: Store; hiddenByIndex: Map<number, string[]> } {
  const next: Store = { ...store };
  const touched = new Set<EntityName>();
  const map = (e: EntityName) => {
    if (!touched.has(e)) {
      next[e] = new Map(next[e]);
      touched.add(e);
    }
    return next[e];
  };
  const hiddenByIndex = new Map<number, string[]>();
  let seq = 0;

  ops.forEach((op, i) => {
    if (op.op === 'restore') {
      for (const key of hidden.get(op.trashId) ?? []) {
        const [entity, id] = splitKey(key);
        const m = map(entity);
        const r = m.get(id);
        if (r) m.set(id, { ...r, deletedAt: null });
      }
      return;
    }
    const def = ENTITIES[op.entity];
    const m = map(op.entity);
    const cur = m.get(op.id);
    switch (op.op) {
      case 'create': {
        const row: Row = { id: op.id, updatedAt: now, deletedAt: null };
        for (const [name, f] of Object.entries(def.fields) as [string, FieldDef][]) {
          if (name in op.fields) row[name] = op.fields[name];
          else if (name === 'createdAt') row[name] = now;
          else if (name === 'position') row[name] = now + seq++;
          else row[name] = f.def ?? null;
        }
        m.set(op.id, row);
        break;
      }
      case 'update':
        if (cur) m.set(op.id, { ...cur, ...op.fields });
        break;
      case 'discard':
        if (cur) m.set(op.id, { ...cur, deletedAt: now });
        break;
      case 'undelete':
        if (cur) m.set(op.id, { ...cur, deletedAt: null });
        break;
      case 'delete': {
        if (!cur || cur.deletedAt) break;
        m.set(op.id, { ...cur, deletedAt: now });
        if (!def.trashable) break;
        const keys = [rowKey(op.entity, op.id)];
        const cascade = (entity: EntityName, test: (r: Row) => boolean) => {
          const cm = map(entity);
          for (const r of cm.values()) {
            if (!r.deletedAt && test(r)) {
              cm.set(r.id, { ...r, deletedAt: now });
              keys.push(rowKey(entity, r.id));
            }
          }
        };
        if (op.entity === 'scenes') cascade('shots', (r) => r.sceneId === op.id);
        if (['notes', 'characters', 'locations', 'moodboards'].includes(op.entity)) cascade('boardCards', (r) => r.refId === op.id);
        hiddenByIndex.set(i, keys);
        break;
      }
    }
  });
  return { store: next, hiddenByIndex };
}

export function splitKey(key: string): [EntityName, string] {
  const i = key.indexOf(':');
  return [key.slice(0, i) as EntityName, key.slice(i + 1)];
}
