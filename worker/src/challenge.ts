import deck from '../../updates/update-2/data/challenge-deck.json';
import {
  burnCheck, journalAnswers, JOURNAL_MIN, lockedUntil, nextCard, postponeCheck, seqStages, type DayLite, type DeckShape, type Journal, type Rand,
} from '../../shared/challenge';
import type { Row } from '../../shared/schema';
import { fullKey } from './images';
import { BadRequest, OWNER_ID, toApi } from './rows';

/**
 * «تحدي العشرين إطاراً» on the server (UPDATE-2 §2–3).
 *
 * SECRECY: the deck is imported here only — the web bundle never contains it. A card's text
 * leaves the server only once that card has been drawn in the run being read.
 */

type Card = (typeof deck.days)[number];
const CARDS = new Map<number, Card>(deck.days.map((c) => [c.day, c]));

export const SHAPE: DeckShape = {
  cards: deck.days.map((c) => ({ id: c.day, stage: c.stageId, fixed: 'fixed' in c && c.fixed === true, double: 'double' in c && typeof c.double === 'number' ? c.double : null })),
  stagesInOrder: deck.sequence.stagesInOrder,
  prep: deck.sequence.prep,
  first: deck.sequence.first,
  last: deck.sequence.last,
};

/** Public, card-free information: stage names/colours, the ten rules, the BTS checklist, labels. */
export const META = {
  deckVersion: deck.version,
  stages: deck.stages,
  rules: deck.rules,
  btsChecklist: deck.btsChecklist,
  requirementLabels: deck.requirementLabels,
  /** stage of each day number 0…20 */
  seqStages: seqStages(SHAPE),
};

export interface ChallengeState {
  now: number;
  run: Row | null;
  days: Row[];
  /** text of the cards drawn in this run, by card number */
  cards: Record<number, Card>;
  /** what the open card allows (server knows the remaining cards; the browser must not) */
  open: { cardId: number; postpone: 'ok' | 'protected' | 'alone'; burn: 'ok' | 'protected' | 'used' } | null;
}

const lite = (r: Row): DayLite => ({
  cardId: r.cardId as number, seq: (r.seq as number | null) ?? null, state: r.state as DayLite['state'],
  drawnAt: r.drawnAt as number, completedAt: (r.completedAt as number | null) ?? null,
});

async function currentRun(db: D1Database): Promise<Row | null> {
  const r = await db.prepare(`SELECT * FROM challenge_runs WHERE owner_id = ? AND status <> 'archived' AND deleted_at IS NULL`).bind(OWNER_ID).first<Record<string, unknown>>();
  return r ? toApi('challengeRuns', r) : null;
}

async function daysOf(db: D1Database, runId: string): Promise<Row[]> {
  const res = await db.prepare('SELECT * FROM challenge_days WHERE run_id = ? AND owner_id = ? ORDER BY seq').bind(runId, OWNER_ID).all<Record<string, unknown>>();
  return res.results.map((r) => toApi('challengeDays', r));
}

/** State of the current run, or of an archived one (`runId`). */
export async function challengeState(db: D1Database, runId?: string): Promise<ChallengeState> {
  const now = Date.now();
  let run: Row | null;
  if (runId) {
    const r = await db.prepare('SELECT * FROM challenge_runs WHERE id = ? AND owner_id = ?').bind(runId, OWNER_ID).first<Record<string, unknown>>();
    run = r ? toApi('challengeRuns', r) : null;
  } else run = await currentRun(db);
  if (!run) return { now, run: null, days: [], cards: {}, open: null };
  const days = await daysOf(db, run.id);
  const cards: Record<number, Card> = {};
  for (const d of days) {
    const c = CARDS.get(d.cardId as number);
    if (c) cards[c.day] = c;
  }
  let open: ChallengeState['open'] = null;
  const cur = days.find((d) => d.state === 'drawn');
  if (cur && run.status === 'active') {
    const l = days.map(lite);
    const p = postponeCheck(SHAPE, l, cur.cardId as number, Math.random);
    const b = burnCheck(SHAPE, l, cur.cardId as number, run.burnUsed === true);
    open = {
      cardId: cur.cardId as number,
      postpone: p.ok ? 'ok' : p.why === 'alone' ? 'alone' : 'protected',
      burn: b.ok ? 'ok' : b.why === 'used' ? 'used' : 'protected',
    };
  }
  return { now, run, days, cards, open };
}

const newId = (p: string) => `${p}-${crypto.randomUUID()}`;

/** Inserts a freshly drawn day unless another device already took this day number. */
function insertDay(db: D1Database, runId: string, cardId: number, seq: number, now: number, overrode: boolean) {
  return db
    .prepare(
      `INSERT OR IGNORE INTO challenge_days (id, owner_id, run_id, card_id, seq, state, drawn_at, overrode, created_at, updated_at)
       SELECT ?1, ?2, ?3, ?4, ?5, 'drawn', ?6, ?7, ?6, ?6
       WHERE EXISTS (SELECT 1 FROM challenge_runs WHERE id = ?3 AND status = 'active')
         AND NOT EXISTS (SELECT 1 FROM challenge_days WHERE run_id = ?3 AND (state = 'drawn' OR seq = ?5 OR card_id = ?4))`,
    )
    .bind(newId('cd'), OWNER_ID, runId, cardId, seq, now, overrode ? 1 : 0);
}

const nextSeq = (days: Row[]) => days.reduce((m, d) => (d.seq == null ? m : Math.max(m, d.seq as number)), -1) + 1;

/** «ابدأ التحدي»: a new run (if none) and the prep card. Safe to press twice. */
export async function start(db: D1Database): Promise<ChallengeState> {
  const now = Date.now();
  let run = await currentRun(db);
  if (!run) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO challenge_runs (id, owner_id, status, deck_version, started_at, burn_used, created_at, updated_at)
         VALUES (?, ?, 'active', ?, ?, 0, ?, ?)`,
      )
      .bind(newId('cr'), OWNER_ID, deck.version, now, now, now)
      .run();
    run = await currentRun(db);
  }
  if (!run) throw new Error('run not created');
  const days = await daysOf(db, run.id);
  if (!days.length) await insertDay(db, run.id, SHAPE.prep, 0, now, false).run();
  return challengeState(db);
}

export class Refused extends Error {
  constructor(public code: string, public extra: Record<string, unknown> = {}) {
    super(code);
  }
}

/**
 * «اسحب»: the card is chosen now, on the server. Two devices pressing together get the same
 * card: the day number is reserved by a conditional insert (and a unique index).
 */
export async function draw(db: D1Database, opts: { tz: number; override: boolean; rand?: Rand }): Promise<ChallengeState> {
  const now = Date.now();
  const run = await currentRun(db);
  if (!run || run.status !== 'active') throw new Refused('no_run');
  const days = await daysOf(db, run.id);
  const l = days.map(lite);
  const next = nextCard(SHAPE, l, opts.rand ?? Math.random);
  if (next.kind === 'none') return challengeState(db); // already drawn (e.g. by the other device) or nothing left
  const until = lockedUntil(SHAPE, l, now, opts.tz);
  if (until && !opts.override) throw new Refused('locked', { until });
  const seq = nextSeq(days);
  if (next.returning) {
    await db
      .prepare(
        `UPDATE challenge_days SET state = 'drawn', seq = ?3, drawn_at = ?4, overrode = ?5, updated_at = MAX(updated_at + 1, ?4)
         WHERE run_id = ?1 AND card_id = ?2 AND state = 'postponed'
           AND NOT EXISTS (SELECT 1 FROM challenge_days x WHERE x.run_id = ?1 AND (x.state = 'drawn' OR x.seq = ?3))`,
      )
      .bind(run.id, next.cardId, seq, now, until ? 1 : 0)
      .run();
  } else {
    await insertDay(db, run.id, next.cardId, seq, now, !!until).run();
  }
  return challengeState(db);
}

/** «أجّل»: the card goes back to its stage and another one of the same stage is drawn at once. */
export async function postpone(db: D1Database, cardId: number, rand: Rand = Math.random): Promise<ChallengeState> {
  const now = Date.now();
  const run = await currentRun(db);
  if (!run || run.status !== 'active') throw new Refused('no_run');
  const days = await daysOf(db, run.id);
  const day = days.find((d) => d.cardId === cardId);
  const check = postponeCheck(SHAPE, days.map(lite), cardId, rand);
  if (!check.ok || !day) throw new Refused(check.ok ? 'state' : check.why);
  await db.batch([
    db
      .prepare(
        `UPDATE challenge_days SET state = 'postponed', seq = NULL, postpone_count = postpone_count + 1, updated_at = MAX(updated_at + 1, ?2)
         WHERE id = ?1 AND state = 'drawn'`,
      )
      .bind(day.id, now),
    insertDay(db, run.id, check.replacement, day.seq as number, now, day.overrode === true),
  ]);
  return challengeState(db);
}

/** «احرق»: once per run, with a written reason. A burned day is finished but not «مكتمل». */
export async function burn(db: D1Database, cardId: number, reason: string): Promise<ChallengeState> {
  const now = Date.now();
  const text = reason.trim().slice(0, 2000);
  if (!text) throw new BadRequest('reason required');
  const run = await currentRun(db);
  if (!run || run.status !== 'active') throw new Refused('no_run');
  const days = await daysOf(db, run.id);
  const check = burnCheck(SHAPE, days.map(lite), cardId, run.burnUsed === true);
  if (!check.ok) throw new Refused(check.why);
  const day = days.find((d) => d.cardId === cardId)!;
  await db.batch([
    db
      .prepare(
        `UPDATE challenge_days SET state = 'burned', burn_reason = ?3, completed_at = ?2, updated_at = MAX(updated_at + 1, ?2)
         WHERE id = ?1 AND state = 'drawn'
           AND NOT EXISTS (SELECT 1 FROM challenge_days x WHERE x.run_id = challenge_days.run_id AND x.state = 'burned')`,
      )
      .bind(day.id, now, text),
    db
      .prepare(
        `UPDATE challenge_runs SET burn_used = 1, updated_at = MAX(updated_at + 1, ?2)
         WHERE id = ?1 AND EXISTS (SELECT 1 FROM challenge_days x WHERE x.run_id = ?1 AND x.state = 'burned')`,
      )
      .bind(run.id, now),
  ]);
  return challengeState(db);
}

/** «سجّل اليوم» / «أنهيت التجهيز». A challenge day needs 3 of the 5 journal answers. */
export async function complete(db: D1Database, cardId: number): Promise<ChallengeState> {
  const now = Date.now();
  const run = await currentRun(db);
  if (!run || run.status !== 'active') throw new Refused('no_run');
  const days = await daysOf(db, run.id);
  const day = days.find((d) => d.cardId === cardId);
  if (!day || day.state !== 'drawn') throw new Refused('state');
  if (cardId !== SHAPE.prep && journalAnswers(day.journal as Journal, day.filmUrl as string) < JOURNAL_MIN) throw new Refused('journal');
  const stmts = [
    db.prepare(`UPDATE challenge_days SET state = 'done', completed_at = ?2, updated_at = MAX(updated_at + 1, ?2) WHERE id = ?1 AND state = 'drawn'`).bind(day.id, now),
  ];
  if (cardId === SHAPE.last) {
    stmts.push(
      db.prepare(`UPDATE challenge_runs SET status = 'done', finished_at = ?2, updated_at = MAX(updated_at + 1, ?2) WHERE id = ?1 AND status = 'active'`).bind(run.id, now),
    );
  }
  await db.batch(stmts);
  return challengeState(db);
}

/** «دورة جديدة» after the last card: archive this run, start a new one (new order). */
export async function newRun(db: D1Database): Promise<ChallengeState> {
  const now = Date.now();
  const run = await currentRun(db);
  if (run && run.status !== 'done') throw new Refused('not_finished');
  await db.batch([
    db.prepare(`UPDATE challenge_runs SET status = 'archived', updated_at = MAX(updated_at + 1, ?2) WHERE owner_id = ?1 AND status = 'done'`).bind(OWNER_ID, now),
    db
      .prepare(
        `INSERT INTO challenge_runs (id, owner_id, status, deck_version, started_at, burn_used, location, created_at, updated_at)
         SELECT ?1, ?2, 'active', ?3, ?4, 0, ?5, ?4, ?4 WHERE NOT EXISTS (SELECT 1 FROM challenge_runs WHERE owner_id = ?2 AND status <> 'archived')`,
      )
      .bind(newId('cr'), OWNER_ID, deck.version, now, run?.location ? JSON.stringify(run.location) : null),
  ]);
  return start(db);
}

export async function listRuns(db: D1Database): Promise<Row[]> {
  const res = await db.prepare('SELECT * FROM challenge_runs WHERE owner_id = ? ORDER BY started_at DESC').bind(OWNER_ID).all<Record<string, unknown>>();
  return res.results.map((r) => toApi('challengeRuns', r));
}

// ---------- voice memo (UPDATE-2 §2.2) ----------

const AUDIO = new Set(['audio/mp4', 'audio/webm', 'audio/aac', 'audio/mpeg']);
export const MAX_VOICE_BYTES = 5 * 1024 * 1024;
export const MAX_VOICE_SECONDS = 120;

/** Audio is accepted here only (never on /api/images). Stored in R2 like an image. */
export async function uploadVoice(db: D1Database, bucket: R2Bucket, form: FormData): Promise<{ id: string }> {
  const file = form.get('file');
  if (!(file instanceof File)) throw new BadRequest('file required');
  const type = file.type.split(';')[0].trim();
  if (!AUDIO.has(type)) throw new BadRequest('unsupported audio type');
  if (file.size === 0 || file.size > MAX_VOICE_BYTES) throw new BadRequest('audio too large');
  const seconds = Number(form.get('duration'));
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_VOICE_SECONDS + 2) throw new BadRequest('audio too long');
  if (!(await looksLikeAudio(file))) throw new BadRequest('not audio');
  const id = `aud-${crypto.randomUUID()}`;
  await bucket.put(fullKey(id), file.stream(), { httpMetadata: { contentType: type } });
  await db
    .prepare('INSERT INTO images (id, owner_id, r2_key, thumb_key, width, height, bytes, created_at) VALUES (?, ?, ?, NULL, 0, 0, ?, ?)')
    .bind(id, OWNER_ID, fullKey(id), file.size, Date.now())
    .run();
  return { id };
}

async function looksLikeAudio(f: File): Promise<boolean> {
  const h = new Uint8Array(await f.slice(0, 12).arrayBuffer());
  const s = (a: number, b: number) => String.fromCharCode(...h.slice(a, b));
  return (
    s(4, 8) === 'ftyp' || // mp4 / m4a (Safari)
    (h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3) || // webm (Chrome)
    s(0, 3) === 'ID3' || // mp3 with tags
    (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) // mp3 / aac (ADTS) frame sync
  );
}
