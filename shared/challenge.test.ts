import { describe, expect, it } from 'vitest';
import {
  burnCheck, journalAnswers, lockedUntil, nextCard, postponeCheck, progressOf, seeded, seqStages, type DayLite, type DeckShape,
} from './challenge';

/** A synthetic deck for the rules (not the real one): prep, a fixed first card, three drawn stages with one double pair, a fixed last card. */
const SHAPE: DeckShape = {
  cards: [
    { id: 0, stage: 'prep', fixed: true, double: null },
    { id: 1, stage: 'zero', fixed: true, double: null },
    ...[2, 3, 4, 5].map((id) => ({ id, stage: 'stage1', fixed: false, double: null })),
    ...[6, 7, 8, 9, 10].map((id) => ({ id, stage: 'stage2', fixed: false, double: null })),
    ...[11, 12, 13, 14, 15, 16, 17, 18, 19].map((id) => ({ id, stage: 'stage3', fixed: false, double: id === 12 ? 13 : id === 13 ? 12 : null })),
    { id: 20, stage: 'final', fixed: true, double: null },
  ],
  stagesInOrder: ['stage1', 'stage2', 'stage3'],
  prep: 0,
  first: 1,
  last: 20,
};
const stageOf = (id: number) => SHAPE.cards.find((c) => c.id === id)!.stage;

/** Plays a whole run: draw, finish, draw… */
function playRun(seed: number) {
  const rand = seeded(seed);
  const days: DayLite[] = [];
  let t = 1;
  for (;;) {
    const n = nextCard(SHAPE, days, rand);
    if (n.kind === 'none') {
      expect(n.why).toBe('finished');
      break;
    }
    days.push({ cardId: n.cardId, seq: days.length, state: 'drawn', drawnAt: t++, completedAt: null });
    days[days.length - 1].state = 'done';
    days[days.length - 1].completedAt = t++;
  }
  return days.map((d) => d.cardId);
}

describe('challenge order', () => {
  it('prep, card 1, each stage emptied before the next, the last card at the end — for many orders', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const order = playRun(seed);
      seen.add(order.join(','));
      expect(order).toHaveLength(21);
      expect(new Set(order).size).toBe(21);
      expect(order[0]).toBe(0);
      expect(order[1]).toBe(1);
      expect(order[20]).toBe(20);
      expect(order.map(stageOf)).toEqual(seqStages(SHAPE));
    }
    expect(seen.size).toBeGreaterThan(250); // really random
  });

  it('the double pair always comes back to back, smaller first; the partner is never drawn alone', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const order = playRun(seed);
      const i = order.indexOf(12);
      expect(order[i + 1]).toBe(13);
    }
  });

  it('nothing is drawn while a card is open or before prep is finished', () => {
    const days: DayLite[] = [{ cardId: 0, seq: 0, state: 'drawn', drawnAt: 1, completedAt: null }];
    expect(nextCard(SHAPE, days, seeded(1))).toEqual({ kind: 'none', why: 'open' });
  });
});

describe('postpone', () => {
  const base = (): DayLite[] => [
    { cardId: 0, seq: 0, state: 'done', drawnAt: 1, completedAt: 2 },
    { cardId: 1, seq: 1, state: 'done', drawnAt: 3, completedAt: 4 },
  ];

  it('gives another card of the same stage now, and the postponed one comes back on the next draw', () => {
    const days = [...base(), { cardId: 4, seq: 2, state: 'drawn' as const, drawnAt: 5, completedAt: null }];
    const p = postponeCheck(SHAPE, days, 4, seeded(7));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(stageOf(p.replacement)).toBe('stage1');
    expect(p.replacement).not.toBe(4);
    days[2] = { ...days[2], state: 'postponed', seq: null };
    days.push({ cardId: p.replacement, seq: 2, state: 'done', drawnAt: 6, completedAt: 7 });
    for (let seed = 1; seed < 50; seed++) expect(nextCard(SHAPE, days, seeded(seed))).toEqual({ kind: 'card', cardId: 4, returning: true });
  });

  it('is refused for the only card left in its stage, for fixed cards, prep and the double pair', () => {
    const days = [...base(), ...[2, 3, 5].map((id, i) => ({ cardId: id, seq: 2 + i, state: 'done' as const, drawnAt: 10 + i, completedAt: 11 + i }))];
    days.push({ cardId: 4, seq: 5, state: 'drawn', drawnAt: 30, completedAt: null });
    expect(postponeCheck(SHAPE, days, 4, seeded(1))).toEqual({ ok: false, why: 'alone' });
    expect(postponeCheck(SHAPE, [{ cardId: 0, seq: 0, state: 'drawn', drawnAt: 1, completedAt: null }], 0, seeded(1))).toEqual({ ok: false, why: 'protected' });
    expect(postponeCheck(SHAPE, [...base().slice(0, 1), { cardId: 1, seq: 1, state: 'drawn', drawnAt: 3, completedAt: null }], 1, seeded(1))).toEqual({ ok: false, why: 'protected' });
    const dd = [...base(), { cardId: 12, seq: 2, state: 'drawn' as const, drawnAt: 5, completedAt: null }];
    expect(postponeCheck(SHAPE, dd, 12, seeded(1))).toEqual({ ok: false, why: 'protected' });
  });
});

describe('burn', () => {
  it('once per run, never a fixed or double card; burned is not counted as done', () => {
    const days: DayLite[] = [
      { cardId: 0, seq: 0, state: 'done', drawnAt: 1, completedAt: 2 },
      { cardId: 1, seq: 1, state: 'done', drawnAt: 3, completedAt: 4 },
      { cardId: 5, seq: 2, state: 'drawn', drawnAt: 5, completedAt: null },
    ];
    expect(burnCheck(SHAPE, days, 5, false)).toEqual({ ok: true });
    expect(burnCheck(SHAPE, days, 5, true)).toEqual({ ok: false, why: 'used' });
    days[2] = { ...days[2], state: 'burned', completedAt: 6 };
    days.push({ cardId: 6, seq: 3, state: 'drawn', drawnAt: 7, completedAt: null });
    expect(burnCheck(SHAPE, days, 6, false)).toEqual({ ok: false, why: 'used' });
    expect(progressOf(days, SHAPE)).toEqual({ done: 1, burned: 1 });
    expect(burnCheck(SHAPE, [{ cardId: 13, seq: 2, state: 'drawn', drawnAt: 1, completedAt: null }], 13, false)).toEqual({ ok: false, why: 'protected' });
    expect(burnCheck(SHAPE, [{ cardId: 20, seq: 20, state: 'drawn', drawnAt: 1, completedAt: null }], 20, false)).toEqual({ ok: false, why: 'protected' });
  });
});

describe('daily lock', () => {
  const riyadh = -180; // getTimezoneOffset() in Riyadh (UTC+3)
  const at = (iso: string) => Date.parse(iso);
  const days = (completedAt: number, cardId = 1): DayLite[] => [
    { cardId: 0, seq: 0, state: 'done', drawnAt: 0, completedAt: 1 },
    { cardId, seq: 1, state: 'done', drawnAt: 2, completedAt },
  ];

  it('locks until the device midnight after a finished day', () => {
    const done = at('2026-10-16T20:00:00+03:00');
    expect(lockedUntil(SHAPE, days(done), at('2026-10-16T23:59:00+03:00'), riyadh)).toBe(at('2026-10-17T00:00:00+03:00'));
    expect(lockedUntil(SHAPE, days(done), at('2026-10-17T00:00:01+03:00'), riyadh)).toBeNull();
    // the same instant is still «today» in another time zone
    expect(lockedUntil(SHAPE, days(done), at('2026-10-17T00:30:00+03:00'), 0)).toBe(at('2026-10-17T00:00:00Z'));
  });

  it('prep does not lock: card 1 is available at once', () => {
    const d: DayLite[] = [{ cardId: 0, seq: 0, state: 'done', drawnAt: 0, completedAt: Date.now() }];
    expect(lockedUntil(SHAPE, d, Date.now(), riyadh)).toBeNull();
  });
});

describe('journal: 3 of 5', () => {
  it('counts worked, failed, regret, tomorrow, and film link or folder', () => {
    expect(journalAnswers({}, '')).toBe(0);
    expect(journalAnswers({ worked: 'a', failed: '  ' }, '')).toBe(1);
    expect(journalAnswers({ worked: 'a', regret: 'b' }, 'https://x')).toBe(3);
    expect(journalAnswers({ worked: 'a', regret: 'b', folder: 'D03' }, 'https://x')).toBe(3);
    expect(journalAnswers({ worked: 'a', failed: 'b', regret: 'c', tomorrow: 'd', folder: 'D03' }, '')).toBe(5);
  });
});
