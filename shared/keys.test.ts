import { describe, expect, it } from 'vitest';
import { assignKey, COMMANDS, commandFor, comboOf, ctxOf, effectiveKeys, isChanged, keyCaps, keyText, resetKey } from './keys';

const ev = (code: string, key: string, m: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ code, key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...m });

describe('«اختصاراتك» (UPDATE-3 §3.3)', () => {
  it('the defaults never clash inside a screen', () => {
    const eff = effectiveKeys({});
    const clash = (a: string, b: string) => ctxOf(a) === ctxOf(b) || ctxOf(a) === 'all' || ctxOf(b) === 'all';
    for (const a of COMMANDS) for (const b of COMMANDS) {
      if (a.id >= b.id || !clash(a.id, b.id)) continue;
      // the plan's arrows sit in their own screen; fixed families are listed once each
      for (const k of eff[a.id]) expect(eff[b.id].includes(k), `${a.id} × ${b.id} on ${k}`).toBe(false);
    }
  });

  it('a key used in the same screen is a conflict; another screen is fine', () => {
    // Alt+K is free → works
    const r = assignKey({}, 'duplicate', 'Alt+KeyK');
    expect(r.ok).toBe(true);
    if (r.ok) expect(effectiveKeys(r.over).duplicate).toEqual(['Alt+KeyK']);
    // N is «ملاحظة» on the board: the same key for «لقطة جديدة» in the storyboard is allowed
    expect(effectiveKeys({}).addNote).toEqual(['KeyN']);
    expect(assignKey({}, 'sbScene', 'KeyN')).toMatchObject({ ok: false, reason: 'conflict', other: 'sbShot' });
    expect(assignKey({}, 'sbShotDone', 'KeyS').ok).toBe(true); // S = scene on the board only
    // inside the board: Ctrl+D is «تكرار»
    expect(assignKey({}, 'alignRight', 'Mod+KeyD')).toMatchObject({ ok: false, reason: 'conflict', other: 'duplicate', otherFixed: false });
    // «عام» clashes with every screen
    expect(assignKey({}, 'sbShotDone', 'Mod+KeyK')).toMatchObject({ ok: false, reason: 'conflict', other: 'search' });
  });

  it('swap gives the other command the old key', () => {
    const r = assignKey({}, 'alignRight', 'Mod+KeyD', true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const eff = effectiveKeys(r.over);
    expect(eff.alignRight).toEqual(['Mod+KeyD']);
    expect(eff.duplicate).toEqual(['Alt+KeyD']);
  });

  it('reserved browser/system keys and fixed commands are refused', () => {
    for (const k of ['Mod+KeyW', 'Mod+KeyT', 'Mod+KeyN', 'Mod+KeyQ', 'Mod+KeyR', 'Mod+KeyL', 'Mod+Tab', 'Mod+Shift+KeyT', 'Mod+Shift+KeyL', 'Mod+KeyH', 'Mod+KeyM', 'F5', 'F11', 'F12', 'Alt+F4']) {
      expect(assignKey({}, 'addCharacter', k), k).toMatchObject({ ok: false, reason: 'reserved' });
    }
    expect(assignKey({}, 'esc', 'KeyQ')).toMatchObject({ ok: false, reason: 'fixed' });
    expect(assignKey({}, 'copy', 'KeyQ')).toMatchObject({ ok: false, reason: 'fixed' });
    // a key owned by a fixed command can't be taken either
    expect(assignKey({}, 'addCharacter', 'Alt+ArrowLeft')).toMatchObject({ ok: false, reason: 'conflict', other: 'nudgeJump', otherFixed: true });
    // a fixed command ignores a saved override
    expect(effectiveKeys({ esc: 'KeyQ' }).esc).toEqual(['Escape']);
  });

  it('only changes are saved; removing and resetting', () => {
    const r = assignKey({ duplicate: 'Alt+KeyK' }, 'duplicate', 'Mod+KeyD');
    expect(r.ok && r.over).toEqual({}); // back to the default = nothing saved
    const off = assignKey({}, 'magnet', null);
    expect(off.ok && off.over).toEqual({ magnet: null });
    if (off.ok) {
      expect(effectiveKeys(off.over).magnet).toEqual([]);
      expect(isChanged(off.over, 'magnet')).toBe(true);
      expect(resetKey(off.over, 'magnet')).toEqual({});
    }
    expect(resetKey({ a: 'x', b: null })).toEqual({});
    // a command without a default key gets one
    const add = assignKey({}, 'theme', 'Alt+KeyB');
    expect(add.ok && effectiveKeys(add.over).theme).toEqual(['Alt+KeyB']);
  });

  it('merges with the defaults; finds the command of the active screen', () => {
    const over = { duplicate: 'Alt+KeyK' };
    expect(commandFor('Alt+KeyK', 'board', over)).toBe('duplicate');
    expect(commandFor('Mod+KeyD', 'board', over)).toBe(null);
    expect(commandFor('Mod+KeyD', 'storyboard', over)).toBe('sbDuplicate');
    expect(commandFor('KeyN', 'board', {})).toBe('addNote');
    expect(commandFor('KeyN', 'storyboard', {})).toBe('sbShot');
    expect(commandFor('Mod+KeyY', null, {})).toBe('redo');
    expect(commandFor('Mod+KeyK', null, {})).toBe('search');
  });

  it('recognises the physical key: the Arabic layout gives the same combo', () => {
    expect(comboOf(ev('KeyN', 'ى'))).toBe('KeyN');
    expect(comboOf(ev('KeyD', 'ي', { ctrlKey: true }))).toBe('Mod+KeyD');
    expect(comboOf(ev('KeyD', 'd', { metaKey: true }))).toBe('Mod+KeyD');
    expect(comboOf(ev('KeyH', 'ا', { altKey: true, shiftKey: true }))).toBe('Alt+Shift+KeyH');
    expect(comboOf(ev('ShiftLeft', 'Shift', { shiftKey: true }))).toBe(null);
    expect(keyCaps('Mod+Alt+Shift+KeyD', true)).toEqual(['⌘', '⌥', '⇧', 'D']);
    expect(keyCaps('Mod+BracketRight', false)).toEqual(['Ctrl', ']']);
    expect(keyText('Shift+Slash', false)).toBe('?');
    expect(keyText('Mod+KeyD', false)).toBe('Ctrl D');
    expect(keyText('Mod+KeyD', true)).toBe('⌘D');
  });
});
