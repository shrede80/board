import { useEffect } from 'react';
import { journalAnswers, JOURNAL_MIN, lockedUntil, TOTAL_DAYS, type DayLite, type DeckShape, type Journal } from '../../../shared/challenge';
import { MAX_BTS_IMAGES, MAX_STILLS, type EntityName, type Row } from '../../../shared/schema';
import { api, ApiError } from '../data/api';
import { uid } from '../lib/util';
import { commit } from './actions';
import { engine, getState, setState, toast, useApp } from './state';

/**
 * «تحدي العشرين إطاراً» in the browser (UPDATE-2 §4). Runs and days are ordinary synced rows;
 * a card's TEXT comes only from /api/challenge, which sends drawn cards only. Nothing here
 * knows an undrawn card.
 */

export interface ChCard {
  day: number;
  stageId: string;
  type: string;
  title: string;
  hook: string;
  subtitle?: string;
  idea: string;
  constraint?: string;
  deliverable?: string | string[];
  gear?: string;
  time?: string;
  difficulty?: number;
  requirements: string[];
  successMark?: string;
  skill?: string;
  bts?: string;
  publish?: string;
  note?: { label: string; text: string };
  double?: number;
  setupItems?: string[];
  gearGaps?: string[];
  fixed?: boolean;
  /** the planning half of the double pair: linked to a project of this app */
  planning?: boolean;
  /** the execution half: number of its planning card */
  executionOf?: number;
}
export interface ChMeta {
  deckVersion: number;
  stages: Record<string, { label: string; color: string; soft: string }>;
  rules: string[];
  btsChecklist: string[];
  requirementLabels: Record<string, string>;
  seqStages: string[];
}
interface ServerState {
  now: number;
  run: Row | null;
  days: Row[];
  cards: Record<string, ChCard>;
  open: { cardId: number; postpone: 'ok' | 'protected' | 'alone'; burn: 'ok' | 'protected' | 'used' } | null;
}

export type ChRoute =
  | { v: 'draw'; override?: boolean }
  | { v: 'card'; dayId: string; flipped?: boolean }
  | { v: 'journal'; dayId: string }
  | { v: 'journey'; runId?: string }
  | { v: 'mirror'; runId?: string }
  | { v: 'log' }
  | { v: 'rules' }
  | { v: 'menu'; dayId: string }
  | { v: 'burn'; dayId: string };

// ---------- module cache (memory only) ----------
let meta: ChMeta | null = null;
const cards = new Map<number, ChCard>();
let openInfo: ServerState['open'] = null;
let loading: Promise<void> | null = null;

const bump = () => setState((s) => ({ chVersion: s.chVersion + 1 }));

export const getMeta = () => meta;
export const cardOf = (cardId: number) => cards.get(cardId);
export const openActions = () => openInfo;

function ingest(s: ServerState) {
  for (const [k, c] of Object.entries(s.cards)) cards.set(Number(k), c);
  openInfo = s.open;
  const rows: Partial<Record<EntityName, Row[]>> = { challengeDays: s.days };
  if (s.run) rows.challengeRuns = [s.run];
  engine.ingest(rows);
  bump();
}

export async function loadMeta() {
  if (meta) return;
  meta = await api<ChMeta>('/api/challenge/meta');
  bump();
}

/** Reads the current run (or an archived one) with its drawn cards (again). */
export function refresh(runId?: string): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    try {
      await loadMeta();
      const s = await api<ServerState>(runId ? `/api/challenge?run=${encodeURIComponent(runId)}` : '/api/challenge');
      if (runId) {
        // an archived run: its cards only (never the open-card actions of the current run)
        for (const [k, c] of Object.entries(s.cards)) cards.set(Number(k), c);
        bump();
      } else ingest(s);
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** Finished runs, newest first (UPDATE-2 §3.7: the archive can be viewed). */
export function archivedRuns(): Row[] {
  return [...engine.store.challengeRuns.values()].filter((r) => !r.deletedAt && r.status === 'archived').sort((a, b) => (b.startedAt as number) - (a.startedAt as number));
}

// ---------- selectors ----------

export function currentRun(): Row | null {
  let best: Row | null = null;
  for (const r of engine.store.challengeRuns.values()) {
    if (r.deletedAt || r.status === 'archived') continue;
    if (!best || (r.startedAt as number) > (best.startedAt as number)) best = r;
  }
  return best;
}

export function runDays(runId: string | undefined): Row[] {
  if (!runId) return [];
  return [...engine.store.challengeDays.values()].filter((d) => d.runId === runId && !d.deletedAt);
}

export const lite = (r: Row): DayLite => ({
  cardId: r.cardId as number, seq: (r.seq as number | null) ?? null, state: r.state as DayLite['state'],
  drawnAt: r.drawnAt as number, completedAt: (r.completedAt as number | null) ?? null,
});

/** Only the fields the lock needs (prep is card 0 in the deck file). */
const LOCK_SHAPE = { prep: 0 } as DeckShape;

export type HomeStatus =
  | { kind: 'start' }
  | { kind: 'open'; day: Row }
  | { kind: 'draw' }
  | { kind: 'locked'; until: number }
  | { kind: 'mirror' };

export interface ChView {
  run: Row | null;
  days: Row[];
  /** days with a number, by number */
  bySeq: Map<number, Row>;
  open: Row | null;
  /** the day number being played (open card, or the next one to draw) */
  current: number;
  status: HomeStatus;
  done: number;
  burned: number;
}

export function view(now = Date.now(), runId?: string): ChView {
  const run = runId ? engine.store.challengeRuns.get(runId) ?? null : currentRun();
  const days = runDays(run?.id);
  const bySeq = new Map<number, Row>();
  for (const d of days) if (d.seq != null) bySeq.set(d.seq as number, d);
  const open = days.find((d) => d.state === 'drawn') ?? null;
  const current = open ? (open.seq as number) : bySeq.size;
  const counted = days.filter((d) => d.cardId !== 0);
  const done = counted.filter((d) => d.state === 'done').length;
  const burned = counted.filter((d) => d.state === 'burned').length;
  let status: HomeStatus;
  if (!run) status = { kind: 'start' };
  else if (run.status !== 'active') status = { kind: 'mirror' };
  else if (open) status = { kind: 'open', day: open };
  else {
    const until = lockedUntil(LOCK_SHAPE, days.map(lite), now, new Date(now).getTimezoneOffset());
    status = until ? { kind: 'locked', until } : { kind: 'draw' };
  }
  return { run, days, bySeq, open, current, status, done, burned };
}

/** Re-renders on data, routes and card cache; fetches card text that is missing. */
export function useChallenge(runId?: string): ChView {
  useApp((s) => s.dataVersion);
  useApp((s) => s.chVersion);
  const v = view(Date.now(), runId);
  const missing = v.days.some((d) => !cards.has(d.cardId as number)) || !meta;
  const offline = useApp((s) => s.offline);
  useEffect(() => {
    if (missing && !offline) void refresh(runId).catch(() => {});
  }, [missing, offline, runId]);
  return v;
}

// ---------- labels ----------

/** «المرحلة الأولى — الأساس» → short «الأساس», long «المرحلة الأولى». */
export function stageNames(stageId: string | undefined): { short: string; long: string } {
  const label = (stageId && meta?.stages[stageId]?.label) || '';
  const [a, b] = label.split(' — ');
  return { short: b ?? a, long: a };
}
export const stageOfSeq = (seq: number) => meta?.seqStages[seq];
export const stageColor = (stageId: string | undefined) => (stageId && meta?.stages[stageId]?.color) || 'var(--ink-700)';

export function cardsLeft(n: number) {
  if (n === 1) return 'بطاقة واحدة باقية';
  if (n === 2) return 'بطاقتان باقيتان';
  if (n >= 3 && n <= 10) return `${n} بطاقات باقية`;
  return `${n} بطاقة باقية`;
}
export function hoursLeft(until: number, now = Date.now()) {
  const h = Math.max(1, Math.ceil((until - now) / 3_600_000));
  if (h === 1) return 'بعد ساعة';
  if (h === 2) return 'بعد ساعتين';
  if (h <= 10) return `بعد ${h} ساعات`;
  return `بعد ${h} ساعة`;
}

/** Cards of a stage still in the deck for this run (count only). */
export function remainingInStage(v: ChView, stageId: string): number {
  if (!meta) return 0;
  const size = meta.seqStages.filter((s) => s === stageId).length;
  const used = v.days.filter((d) => cards.get(d.cardId as number)?.stageId === stageId && d.state !== 'postponed').length;
  return Math.max(0, size - used);
}

export const folderName = (seq: number, title: string) => `D${String(seq).padStart(2, '0')}_${title.trim().replace(/\s+/g, '-')}`;
export { JOURNAL_MIN, TOTAL_DAYS };

// ---------- routes ----------

export const pushCh = (r: ChRoute) => setState((s) => ({ ch: [...s.ch, r] }));
export const popCh = () => setState((s) => ({ ch: s.ch.slice(0, -1) }));
export const replaceCh = (r: ChRoute) => setState((s) => ({ ch: [...s.ch.slice(0, -1), r] }));
export const closeCh = () => setState({ ch: [] });

// ---------- server actions ----------

async function action(path: string, json: unknown = {}): Promise<ServerState | null> {
  if (getState().offline) {
    toast('لا يوجد اتصال', { tone: 'danger' });
    return null;
  }
  try {
    await loadMeta();
    const s = await api<ServerState>(`/api/challenge/${path}`, { method: 'POST', json });
    ingest(s);
    return s;
  } catch (e) {
    const code = e instanceof ApiError ? (e.body.error as string) : '';
    const msg: Record<string, string> = {
      locked: 'البطاقة مقفلة حتى منتصف الليل',
      journal: 'جاوب على 3 أسئلة على الأقل',
      alone: 'ما فيه بطاقة ثانية في هذه المرحلة',
      used: 'استخدمت الحرق من قبل',
    };
    toast(msg[code] ?? (e instanceof ApiError && e.status === 0 ? 'لا يوجد اتصال' : 'تعذّر الحفظ، حاول مرة ثانية'), { tone: 'danger' });
    if (e instanceof ApiError && e.status === 409) void refresh().catch(() => {});
    return null;
  }
}

export async function startChallenge() {
  const s = await action('start');
  const d = s?.days.find((x) => x.state === 'drawn');
  if (d) setState({ ch: [{ v: 'card', dayId: d.id }] });
}

/** Draws now (the server picks). Returns the open day afterwards. */
export async function drawCard(override: boolean): Promise<Row | null> {
  const s = await action('draw', { tz: new Date().getTimezoneOffset(), override });
  return s?.days.find((x) => x.state === 'drawn') ?? null;
}

export async function postponeCard(day: Row) {
  const s = await action('postpone', { cardId: day.cardId });
  const d = s?.days.find((x) => x.state === 'drawn');
  if (!d) return;
  toast('أُجّلت · هذي بطاقتك الجديدة');
  setState((st) => ({ ch: [...st.ch.filter((r) => r.v !== 'menu' && !('dayId' in r && r.dayId === day.id)), { v: 'card', dayId: d.id }] }));
}

export async function burnCard(day: Row, reason: string) {
  const s = await action('burn', { cardId: day.cardId, reason });
  if (!s) return;
  closeCh();
  toast('حُرقت البطاقة');
}

/** Saves the journal edits, sends the regret to the ideas box, then finishes the day. */
export async function completeDay(day: Row): Promise<boolean> {
  if (day.cardId !== 0) syncRegretIdea(day);
  await engine.idle();
  const s = await action('complete', { cardId: day.cardId });
  if (!s) return false;
  closeCh();
  toast(day.cardId === 0 ? 'التجهيز تمّ' : `سُجّل اليوم ${day.seq}`);
  return true;
}

/** «دورة جديدة» after the last card: this run goes to the archive, a new order starts with prep. */
export async function startNewRun() {
  const s = await action('new-run');
  const d = s?.days.find((x) => x.state === 'drawn');
  if (d) setState({ ch: [{ v: 'card', dayId: d.id }] });
}

/** «استخدم موقعي»: asks once, saved on the run (the sun times use it). */
export function setMyLocation(run: Row) {
  if (!('geolocation' in navigator)) return toast('الموقع غير متاح', { tone: 'danger' });
  navigator.geolocation.getCurrentPosition(
    (p) => {
      const location = { lat: Math.round(p.coords.latitude * 1e4) / 1e4, lng: Math.round(p.coords.longitude * 1e4) / 1e4, label: 'موقعي' };
      commit([{ op: 'update', entity: 'challengeRuns', id: run.id, fields: { location } }], { history: 'الموقع' });
      toast('انحفظ موقعك');
    },
    () => toast('ما وصلنا للموقع', { tone: 'danger' }),
    { timeout: 15_000, maximumAge: 3_600_000 },
  );
}

// ---------- journal edits (ordinary synced ops) ----------

export const journalOf = (d: Row): Journal => (d.journal && typeof d.journal === 'object' ? (d.journal as Journal) : {});

export function setJournal(day: Row, patch: Partial<Journal>, key?: string) {
  const cur = engine.store.challengeDays.get(day.id) ?? day;
  commit([{ op: 'update', entity: 'challengeDays', id: day.id, fields: { journal: { ...journalOf(cur), ...patch } } }], {
    history: 'الدفتر', key: key ? `chj:${day.id}:${key}` : undefined,
  });
}

export function setDayField(day: Row, fields: Record<string, unknown>, key?: string) {
  commit([{ op: 'update', entity: 'challengeDays', id: day.id, fields }], { history: 'الدفتر', key: key ? `chd:${day.id}:${key}` : undefined });
}

export const answers = (d: Row) => journalAnswers(journalOf(d), d.filmUrl as string);

/** «أرسلها لصندوق الأفكار» (on by default): one linked idea without a project, kept in step with the text. */
export function syncRegretIdea(day: Row) {
  const d = engine.store.challengeDays.get(day.id) ?? day;
  const j = journalOf(d);
  const text = (j.regret ?? '').trim();
  if (j.sendRegret === false || !text) return;
  const body = `${text}\n— دفتر التحدي · اليوم ${d.seq}`;
  const existing = d.regretIdeaId ? engine.store.ideas.get(d.regretIdeaId as string) : undefined;
  if (existing && !existing.deletedAt) {
    if (existing.text !== body) commit([{ op: 'update', entity: 'ideas', id: existing.id, fields: { text: body } }], { history: 'تعديل الفكرة' });
    return;
  }
  if (d.regretIdeaId) return; // the idea was deleted on purpose: don't bring it back
  const id = uid('idea');
  commit(
    [
      { op: 'create', entity: 'ideas', id, fields: { text: body, imageIds: [], projectId: null, sceneId: null, source: matchMedia('(max-width: 760px)').matches ? 'phone' : 'laptop', isNew: true } },
      { op: 'update', entity: 'challengeDays', id: d.id, fields: { regretIdeaId: id } },
    ],
    { history: 'فكرة من الدفتر' },
  );
}

export const LIMITS = { stills: MAX_STILLS, bts: MAX_BTS_IMAGES };
