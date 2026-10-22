import { describe, expect, it } from 'vitest';
import { FIELD_GROUPS, hiddenFields, shownFields, toggleField } from './fields';

describe('«الحقول» (UPDATE-3 §4)', () => {
  it('no setting = «بسيط», as in the table of §4.1', () => {
    const s = shownFields(null);
    expect([...s.shotEditor]).toEqual(expect.arrayContaining(['refs', 'desc', 'dur', 'status', 'size', 'motion']));
    expect(s.shotEditor.has('camera')).toBe(false);
    expect(hiddenFields(null, 'shotEditor')).toEqual(['angle', 'camera', 'rig', 'light', 'audio']);
    expect(hiddenFields(null, 'shotCard')).toEqual(['size', 'motion', 'camera']);
    expect(hiddenFields(null, 'sceneEditor')).toEqual(['characters', 'goal', 'mood', 'links']);
    expect(hiddenFields(null, 'sceneCard')).toEqual(['characters']);
  });
  it('«كامل» shows everything', () => {
    for (const g of Object.keys(FIELD_GROUPS) as (keyof typeof FIELD_GROUPS)[]) expect(hiddenFields({ preset: 'full' }, g)).toEqual([]);
  });
  it('a manual change makes it «مخصص»; fixed fields never turn off', () => {
    const a = toggleField(null, 'shotCard', 'camera');
    expect(a.preset).toBe('custom');
    expect(shownFields(a).shotCard.has('camera')).toBe(true);
    expect(shownFields(a).shotEditor.has('camera')).toBe(false); // other groups keep «بسيط»
    const b = toggleField(a, 'shotCard', 'camera');
    expect(shownFields(b).shotCard.has('camera')).toBe(false);
    const c = toggleField(null, 'shotEditor', 'desc');
    expect(c).toEqual({ preset: 'simple' });
    expect(shownFields({ preset: 'custom', shown: { shotEditor: [] } }).shotEditor.has('desc')).toBe(true);
  });
});
