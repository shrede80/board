import { describe, expect, it } from 'vitest';
import { COMMANDS } from './keys';
import { PHONE_TWIN } from './parity';

describe('mobile = laptop (UPDATE-4 ج): every shortcut command has a place on the phone, or is keyboard-only', () => {
  it('lists every command, and nothing else', () => {
    const ids = COMMANDS.map((c) => c.id).sort();
    expect(Object.keys(PHONE_TWIN).sort()).toEqual(ids);
  });
  it('a keyboard-only entry says why; a phone entry names a testid', () => {
    for (const [id, t] of Object.entries(PHONE_TWIN)) {
      if ('keyboard' in t) expect(t.keyboard.length, id).toBeGreaterThan(5);
      else expect(t.phone, id).toMatch(/^[a-z][a-z0-9-]+$/);
    }
  });
});
