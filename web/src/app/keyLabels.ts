import { effectiveKeys, keyText, type KeyOverrides } from '../../../shared/keys';
import { pref } from './prefs';

/** Shortcut labels for tooltips and menus, from the same table as the keys themselves (UPDATE-3 §3.3). */
export const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const keyOverrides = () => pref<KeyOverrides>('keys') ?? {};

/** The key shown for a command right now («Ctrl D», «⌘D»), '' when it has none. */
export function kb(id: string, index = 0): string {
  return keyText(effectiveKeys(keyOverrides())[id]?.[index], isMac());
}
/** «ملاحظة · N» for tooltips. */
export function tip(label: string, id: string): string {
  const k = kb(id);
  return k ? `${label} · ${k}` : label;
}
