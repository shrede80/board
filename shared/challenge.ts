/**
 * «تحدي العشرين إطاراً» rules (UPDATE-2 §3), shared by the Worker (which decides) and the web
 * app (which shows the state). Pure functions; randomness is injected so tests can pin it.
 *
 * Only the deck's SHAPE lives here (card number, stage, fixed, double) — never card text.
 */

export interface CardShape {
  id: number;
  stage: string;
  fixed: boolean;
  /** partner card of a double card */
  double: number | null;
}
export interface DeckShape {
  cards: CardShape[];
  /** drawn stages in order (prep, card 1 and the last card are fixed around them) */
  stagesInOrder: string[];
  prep: number;
  first: number;
  last: number;
}

export type DayState = 'drawn' | 'done' | 'burned' | 'postponed';
export interface DayLite {
  cardId: number;
  seq: number | null;
  state: DayState;
  drawnAt: number;
  completedAt: number | null;
}

export type Rand = () => number;

export const TOTAL_DAYS = 20;

const finished = (d: DayLite) => d.state === 'done' || d.state === 'burned';

function byId(shape: DeckShape) {
  return new Map(shape.cards.map((c) => [c.id, c]));
}

/** Stage of every day number 0…20 (prep, first, the drawn stages by size, last). */
export function seqStages(shape: DeckShape): string[] {
  const card = byId(shape);
  const out = [card.get(shape.prep)!.stage, card.get(shape.first)!.stage];
  for (const st of shape.stagesInOrder) for (const c of shape.cards) if (c.stage === st) out.push(st);
  out.push(card.get(shape.last)!.stage);
  return out;
}

/** The second card of a double pair: never drawn on its own, it follows its partner. */
export function isFollower(c: CardShape) {
  return c.double != null && c.double < c.id;
}

/** Cards of a stage not yet in the run (postponed cards are still in the run). */
export function remainingIn(shape: DeckShape, days: DayLite[], stage: string): CardShape[] {
  const used = new Set(days.map((d) => d.cardId));
  return shape.cards.filter((c) => c.stage === stage && !used.has(c.id));
}

export type Next =
  | { kind: 'card'; cardId: number; returning: boolean }
  | { kind: 'none'; why: 'open' | 'prep' | 'finished' };

/**
 * What the next press of «اسحب» gives (UPDATE-2 §3.1–3.4):
 * prep → card 1 → stage 1 → 2 → 3 (each emptied first) → the last card.
 * A double's partner comes right after it; a postponed card comes back before any new draw.
 */
export function nextCard(shape: DeckShape, days: DayLite[], rand: Rand): Next {
  const has = (id: number) => days.some((d) => d.cardId === id);
  if (!has(shape.prep)) return { kind: 'card', cardId: shape.prep, returning: false };
  if (days.some((d) => d.state === 'drawn')) return { kind: 'none', why: 'open' };
  const prep = days.find((d) => d.cardId === shape.prep)!;
  if (!finished(prep)) return { kind: 'none', why: 'prep' };
  if (!has(shape.first)) return { kind: 'card', cardId: shape.first, returning: false };

  const card = byId(shape);
  const last = [...days].filter((d) => d.seq != null).sort((a, b) => b.seq! - a.seq!)[0];
  const lastCard = last && card.get(last.cardId);
  if (lastCard && lastCard.double != null && !has(lastCard.double)) return { kind: 'card', cardId: lastCard.double, returning: false };

  const postponed = days.filter((d) => d.state === 'postponed').sort((a, b) => a.drawnAt - b.drawnAt)[0];
  if (postponed) return { kind: 'card', cardId: postponed.cardId, returning: true };

  for (const st of shape.stagesInOrder) {
    const pool = remainingIn(shape, days, st).filter((c) => !isFollower(c));
    if (pool.length) return { kind: 'card', cardId: pick(pool, rand).id, returning: false };
  }
  if (!has(shape.last)) return { kind: 'card', cardId: shape.last, returning: false };
  return { kind: 'none', why: 'finished' };
}

function pick<T>(list: T[], rand: Rand): T {
  const i = Math.min(list.length - 1, Math.floor(rand() * list.length));
  return list[i];
}

/** Fixed cards, prep and double cards can be neither postponed nor burned. */
export function isProtected(shape: DeckShape, cardId: number) {
  const c = byId(shape).get(cardId);
  return !c || c.fixed || c.double != null || cardId === shape.prep;
}

export type PostponeCheck = { ok: true; replacement: number } | { ok: false; why: 'state' | 'protected' | 'alone' };

/**
 * «أجّل» (UPDATE-2 §3.4): the card goes back to its stage and another card of the same stage
 * is drawn straight away. Not possible when it is the only one left there.
 */
export function postponeCheck(shape: DeckShape, days: DayLite[], cardId: number, rand: Rand): PostponeCheck {
  const day = days.find((d) => d.cardId === cardId);
  if (!day || day.state !== 'drawn') return { ok: false, why: 'state' };
  if (isProtected(shape, cardId)) return { ok: false, why: 'protected' };
  const stage = byId(shape).get(cardId)!.stage;
  const pool = remainingIn(shape, days, stage).filter((c) => !isFollower(c));
  if (!pool.length) return { ok: false, why: 'alone' };
  return { ok: true, replacement: pick(pool, rand).id };
}

export function burnCheck(shape: DeckShape, days: DayLite[], cardId: number, burnUsed: boolean): { ok: true } | { ok: false; why: 'state' | 'protected' | 'used' } {
  const day = days.find((d) => d.cardId === cardId);
  if (!day || day.state !== 'drawn') return { ok: false, why: 'state' };
  if (isProtected(shape, cardId)) return { ok: false, why: 'protected' };
  if (burnUsed || days.some((d) => d.state === 'burned')) return { ok: false, why: 'used' };
  return { ok: true };
}

// ---------- daily lock (UPDATE-2 §3.6) ----------

const DAY_MS = 86_400_000;
/** tzOffset = Date#getTimezoneOffset() of the device (minutes, UTC − local). */
const localDay = (t: number, tzOffset: number) => Math.floor((t - tzOffset * 60_000) / DAY_MS);

/**
 * After a day is finished (done or burned, prep excepted) the next card opens at the device's
 * next midnight. Returns the unlock time, or null when nothing is locked.
 */
export function lockedUntil(shape: DeckShape, days: DayLite[], now: number, tzOffset: number): number | null {
  const last = days
    .filter((d) => finished(d) && d.cardId !== shape.prep && d.completedAt != null)
    .sort((a, b) => b.completedAt! - a.completedAt!)[0];
  if (!last) return null;
  const today = localDay(now, tzOffset);
  if (localDay(last.completedAt!, tzOffset) < today) return null;
  return (today + 1) * DAY_MS + tzOffset * 60_000;
}

// ---------- journal (UPDATE-2 §4.5) ----------

export interface Journal {
  worked?: string;
  failed?: string;
  regret?: string;
  tomorrow?: string;
  folder?: string;
  sendRegret?: boolean;
  setup?: boolean[];
}

/** The five answers of the «3 من 5» rule: worked, failed, regret, tomorrow, film link or folder. */
export function journalAnswers(j: Journal | null | undefined, filmUrl: string | null | undefined): number {
  const has = (s: unknown) => typeof s === 'string' && s.trim().length > 0;
  return [has(j?.worked), has(j?.failed), has(j?.regret), has(j?.tomorrow), has(filmUrl) || has(j?.folder)].filter(Boolean).length;
}
export const JOURNAL_MIN = 3;

// ---------- progress ----------

export function progressOf(days: DayLite[], shape: DeckShape) {
  const counted = days.filter((d) => d.cardId !== shape.prep);
  return {
    done: counted.filter((d) => d.state === 'done').length,
    burned: counted.filter((d) => d.state === 'burned').length,
  };
}

/** Seeded generator (mulberry32) for tests. */
export function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
