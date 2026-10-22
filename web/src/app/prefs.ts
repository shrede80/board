import type { PrefKey } from '../../../shared/schema';
import { commit } from './actions';
import { engine, useApp } from './state';

/**
 * The user's synced preferences (UPDATE-3 §8): one prefs row per key, written like any other
 * row (so it syncs to the other devices within the polling interval), never in the undo history.
 */
export function pref<T>(key: PrefKey): T | null {
  const r = engine.store.prefs.get(key);
  return r && !r.deletedAt ? ((r.value as T) ?? null) : null;
}

export function usePref<T>(key: PrefKey): T | null {
  useApp((s) => s.dataVersion);
  return pref<T>(key);
}

export function setPref(key: PrefKey, value: unknown): boolean {
  const r = engine.store.prefs.get(key);
  return commit([{ op: r && !r.deletedAt ? 'update' : 'create', entity: 'prefs', id: key, fields: { value } }], { history: false });
}
