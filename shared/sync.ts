import type { Store } from './model';
import { ENTITY_NAMES, type Changes, type EntityName, type Row } from './schema';

/**
 * Field-level last-write-wins merge of rows coming from the server (SPEC §3.4).
 *
 * - `pending` holds fields this device has changed but the server hasn't acknowledged yet;
 *   those keep the local value (our write will land after the remote one).
 * - `versions` is the newest server `updatedAt` this device knows per row (from polls and from
 *   the `now` of its own acknowledged writes). Older copies are ignored, so a slow poll that
 *   started before our write can't roll it back.
 */
/** row key → field → number of in-flight writes touching it */
export type Pending = Map<string, Map<string, number>>;
export type Versions = Map<string, number>;

export const rowKey = (entity: EntityName, id: string) => `${entity}:${id}`;

export function mergeChanges(store: Store, changes: Pick<Changes, 'rows'>, pending: Pending, versions: Versions): { store: Store; changed: boolean } {
  let changed = false;
  const next = { ...store };
  for (const entity of ENTITY_NAMES) {
    const incoming = changes.rows[entity];
    if (!incoming?.length) continue;
    const map = new Map(store[entity]);
    for (const remote of incoming) {
      const key = rowKey(entity, remote.id);
      const known = versions.get(key) ?? -1;
      if (remote.updatedAt < known) continue;
      versions.set(key, remote.updatedAt);
      const local = map.get(remote.id);
      if (remote.deletedAt) {
        // A deletion from another device wins over local unsent edits.
        if (local && !local.deletedAt) {
          map.set(remote.id, { ...local, deletedAt: remote.deletedAt, updatedAt: remote.updatedAt });
          changed = true;
        } else if (!local) {
          map.set(remote.id, remote);
        }
        continue;
      }
      const keep = pending.get(key);
      const merged: Row = { ...remote };
      if (local && keep) for (const f of keep.keys()) merged[f] = local[f];
      if (!local || !sameRow(local, merged)) {
        map.set(remote.id, merged);
        changed = true;
      }
    }
    next[entity] = map;
  }
  return { store: next, changed };
}

function sameRow(a: Row, b: Row): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (k === 'updatedAt') continue;
    const x = a[k], y = b[k];
    if (x === y) continue;
    if (typeof x === 'object' && typeof y === 'object' && JSON.stringify(x) === JSON.stringify(y)) continue;
    return false;
  }
  return true;
}

/** Marks fields as changed locally and not yet saved. */
export function markPending(pending: Pending, key: string, fields: string[]) {
  const p = pending.get(key) ?? new Map<string, number>();
  for (const f of fields) p.set(f, (p.get(f) ?? 0) + 1);
  pending.set(key, p);
}

/** Releases the fields of one write (acknowledged or failed). */
export function releasePending(pending: Pending, key: string, fields: string[]) {
  const p = pending.get(key);
  if (!p) return;
  for (const f of fields) {
    const n = (p.get(f) ?? 0) - 1;
    if (n > 0) p.set(f, n);
    else p.delete(f);
  }
  if (!p.size) pending.delete(key);
}

/** Records an acknowledged write: the server stamped these rows with `now`. */
export function acknowledge(versions: Versions, pending: Pending, writes: { key: string; fields: string[] }[], now: number) {
  for (const { key, fields } of writes) {
    versions.set(key, Math.max(versions.get(key) ?? 0, now));
    releasePending(pending, key, fields);
  }
}
