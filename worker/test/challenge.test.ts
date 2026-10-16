import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import deck from '../../updates/update-2/data/challenge-deck.json';
import { seeded } from '../../shared/challenge';
import { draw, postpone, SHAPE } from '../src/challenge';
import { backup, sweepImages } from '../src/maintenance';
import { call, getJson, ops, setupAndLogin, upload } from './helpers';

type Day = { id: string; cardId: number; seq: number | null; state: string; overrode: boolean; completedAt: number | null };
type State = { run: { id: string; status: string; burnUsed: boolean } | null; days: Day[]; cards: Record<string, { day: number; title: string }>; open: { cardId: number; postpone: string; burn: string } | null };

const TZ = -180;
const post = async (cookie: string, path: string, json: unknown = {}) => call(`/api/challenge/${path}`, { method: 'POST', cookie, json });
async function act(cookie: string, path: string, json: unknown = {}): Promise<State> {
  const res = await post(cookie, path, json);
  if (res.status !== 200) throw new Error(`${path} ${res.status} ${await res.text()}`);
  return (await res.json()) as State;
}
const openDay = (s: State) => s.days.find((d) => d.state === 'drawn')!;

/** Fills 3 of the 5 journal answers of a day through ordinary ops (as the app does). */
async function journal(cookie: string, dayId: string) {
  await ops(cookie, [{ op: 'update', entity: 'challengeDays', id: dayId, fields: { journal: { worked: 'أ', failed: 'ب', tomorrow: 'ج' } } }]);
}
/** Finishes the open day and moves its completion to yesterday, so the next card is not locked. */
async function finishOpen(cookie: string, s: State): Promise<State> {
  const d = openDay(s);
  if (d.cardId !== 0) await journal(cookie, d.id);
  const after = await act(cookie, 'complete', { cardId: d.cardId });
  await env.DB.prepare('UPDATE challenge_days SET completed_at = completed_at - 172800000 WHERE id = ?').bind(d.id).run();
  return after;
}

describe('challenge: deck and secrecy', () => {
  it('the deck shape matches UPDATE-2 (21 cards, fixed 0/1/20, one double pair)', () => {
    expect(SHAPE.cards).toHaveLength(21);
    expect(SHAPE.cards.filter((c) => c.fixed).map((c) => c.id)).toEqual([0, 1, 20]);
    expect(SHAPE.cards.filter((c) => c.double != null).map((c) => [c.id, c.double])).toEqual([[17, 18], [18, 17]]);
  });

  it('the server never sends the text of a card that is not drawn in the run', async () => {
    const cookie = await setupAndLogin();
    // a title that is also a public stage name («التجهيز») is not card content
    const stageNames = Object.values(deck.stages).map((x) => x.label);
    const titles = deck.days.map((d) => (stageNames.includes(d.title) ? '\u0000none' : d.title));
    const hooks = deck.days.map((d) => d.hook);
    const leaks = (body: string, drawn: number[]) =>
      deck.days.filter((d) => !drawn.includes(d.day)).filter((d) => body.includes(titles[d.day]) || body.includes(hooks[d.day]) || body.includes(d.idea)).map((d) => d.day);

    let res = await call('/api/challenge', { cookie });
    let text = await res.text();
    expect(leaks(text, [])).toEqual([]);
    expect(leaks(await (await call('/api/challenge/meta', { cookie })).text(), [])).toEqual([]);

    const s = await act(cookie, 'start');
    expect(Object.keys(s.cards)).toEqual(['0']);
    await finishOpen(cookie, s);
    let st = await act(cookie, 'draw', { tz: TZ });
    await finishOpen(cookie, st);
    st = await act(cookie, 'draw', { tz: TZ });
    const drawn = st.days.map((d) => d.cardId);
    expect(drawn).toHaveLength(3);
    res = await call('/api/challenge', { cookie });
    text = await res.text();
    expect(leaks(text, drawn)).toEqual([]);
    expect(Object.keys(JSON.parse(text).cards).map(Number).sort((a, b) => a - b)).toEqual([...drawn].sort((a, b) => a - b));
    // the other read paths carry rows (card numbers) only, never text
    for (const path of ['/api/home', `/api/changes?since=0`]) expect(leaks(await (await call(path, { cookie })).text(), [])).toEqual([]);
  });

  it('clients cannot create days, move the state or touch server fields', async () => {
    const cookie = await setupAndLogin();
    const s = await act(cookie, 'start');
    const d = s.days[0];
    const bad = async (o: unknown) => (await call('/api/ops', { method: 'POST', cookie, json: { ops: [o] } })).status;
    expect(await bad({ op: 'create', entity: 'challengeDays', id: 'x1', fields: { cardId: 5 } })).toBe(400);
    expect(await bad({ op: 'update', entity: 'challengeDays', id: d.id, fields: { state: 'done' } })).toBe(400);
    expect(await bad({ op: 'update', entity: 'challengeDays', id: d.id, fields: { cardId: 7 } })).toBe(400);
    expect(await bad({ op: 'update', entity: 'challengeRuns', id: s.run!.id, fields: { burnUsed: true } })).toBe(400);
    expect(await bad({ op: 'delete', entity: 'challengeDays', id: d.id })).toBe(400);
    expect(await bad({ op: 'update', entity: 'challengeDays', id: d.id, fields: { stillImageIds: ['a', 'b', 'c', 'd'] } })).toBe(400);
    expect(await bad({ op: 'update', entity: 'challengeDays', id: d.id, fields: { journal: { hack: 'x' } } })).toBe(400);
    expect(await bad({ op: 'update', entity: 'challengeDays', id: d.id, fields: { journal: { worked: 'ok', setup: [true, false] } } })).toBe(200);
  });
});

describe('challenge: the rules on the server', () => {
  it('start is idempotent; prep, then card 1 at once (no lock after prep)', async () => {
    const cookie = await setupAndLogin();
    const a = await act(cookie, 'start');
    const b = await act(cookie, 'start');
    expect(b.days).toHaveLength(1);
    expect(b.run!.id).toBe(a.run!.id);
    expect(a.days[0]).toMatchObject({ cardId: 0, seq: 0, state: 'drawn' });
    await act(cookie, 'complete', { cardId: 0 });
    const s = await act(cookie, 'draw', { tz: TZ });
    expect(openDay(s)).toMatchObject({ cardId: 1, seq: 1, overrode: false });
  });

  it('a day needs 3 of the 5 journal answers', async () => {
    const cookie = await setupAndLogin();
    let s = await act(cookie, 'start');
    s = await finishOpen(cookie, s);
    s = await act(cookie, 'draw', { tz: TZ });
    const d = openDay(s);
    await ops(cookie, [{ op: 'update', entity: 'challengeDays', id: d.id, fields: { journal: { worked: 'أ', regret: 'ب' } } }]);
    const r = await post(cookie, 'complete', { cardId: d.cardId });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe('journal');
    await ops(cookie, [{ op: 'update', entity: 'challengeDays', id: d.id, fields: { filmUrl: 'https://vimeo.com/1' } }]);
    s = await act(cookie, 'complete', { cardId: d.cardId });
    expect(s.days.find((x) => x.id === d.id)!.state).toBe('done');
  });

  it('locks the next card until midnight; «أحتاج أفتحها اليوم» opens it and is recorded', async () => {
    const cookie = await setupAndLogin();
    let s = await act(cookie, 'start');
    s = await finishOpen(cookie, s);
    s = await act(cookie, 'draw', { tz: TZ });
    await journal(cookie, openDay(s).id);
    await act(cookie, 'complete', { cardId: openDay(s).cardId }); // finished now → locked
    const r = await post(cookie, 'draw', { tz: TZ });
    expect(r.status).toBe(409);
    const body = (await r.json()) as { error: string; until: number };
    expect(body.error).toBe('locked');
    expect(body.until).toBeGreaterThan(Date.now());
    expect(body.until - Date.now()).toBeLessThanOrEqual(24 * 3600 * 1000);
    s = await act(cookie, 'draw', { tz: TZ, override: true });
    expect(openDay(s).overrode).toBe(true);
    expect(openDay(s).seq).toBe(2);
  });

  it('two devices drawing at the same moment get one card', async () => {
    const cookie = await setupAndLogin();
    let s = await act(cookie, 'start');
    s = await finishOpen(cookie, s);
    s = await act(cookie, 'draw', { tz: TZ });
    s = await finishOpen(cookie, s);
    const [a, b] = await Promise.all([act(cookie, 'draw', { tz: TZ }), act(cookie, 'draw', { tz: TZ })]);
    const rows = await env.DB.prepare('SELECT card_id, seq FROM challenge_days WHERE seq = 2').all();
    expect(rows.results).toHaveLength(1);
    expect(openDay(a).cardId).toBe(openDay(b).cardId);
    // even when each request picked a different random card
    s = await finishOpen(cookie, a);
    await Promise.all([draw(env.DB, { tz: TZ, override: false, rand: seeded(1) }), draw(env.DB, { tz: TZ, override: false, rand: seeded(99) })]);
    const open = await env.DB.prepare(`SELECT card_id FROM challenge_days WHERE state = 'drawn'`).all();
    expect(open.results).toHaveLength(1);
    const at3 = await env.DB.prepare('SELECT COUNT(*) AS n FROM challenge_days WHERE seq = 3').first<{ n: number }>();
    expect(at3!.n).toBe(1);
  });

  it('postpone: another card of the same stage now; the postponed one comes back first next time', async () => {
    const cookie = await setupAndLogin();
    let s = await act(cookie, 'start');
    s = await finishOpen(cookie, s);
    s = await act(cookie, 'draw', { tz: TZ }); // card 1 (fixed)
    expect(s.open).toMatchObject({ cardId: 1, postpone: 'protected', burn: 'protected' });
    s = await finishOpen(cookie, s);
    s = await act(cookie, 'draw', { tz: TZ });
    const first = openDay(s);
    expect(s.open).toMatchObject({ postpone: 'ok', burn: 'ok' });
    s = await act(cookie, 'postpone', { cardId: first.cardId });
    const repl = openDay(s);
    expect(repl.cardId).not.toBe(first.cardId);
    expect(repl.seq).toBe(2);
    const stage = (id: number) => SHAPE.cards.find((c) => c.id === id)!.stage;
    expect(stage(repl.cardId)).toBe(stage(first.cardId));
    expect(s.days.find((d) => d.cardId === first.cardId)).toMatchObject({ state: 'postponed', seq: null });
    s = await finishOpen(cookie, s);
    s = await act(cookie, 'draw', { tz: TZ });
    expect(openDay(s)).toMatchObject({ cardId: first.cardId, seq: 3 });
  });

  it('postpone is refused when the card is the last one left in its stage', async () => {
    const cookie = await setupAndLogin();
    let s = await act(cookie, 'start');
    for (let i = 0; i < 7; i++) {
      s = await finishOpen(cookie, s);
      s = await act(cookie, 'draw', { tz: TZ });
    }
    // day 7 = the sixth and last card of stage 1
    expect(openDay(s).seq).toBe(7);
    expect(s.open!.postpone).toBe('alone');
    const r = await post(cookie, 'postpone', { cardId: openDay(s).cardId });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe('alone');
  });

  it('burn: once per run, with a reason; finished but not counted done; refused on fixed cards', async () => {
    const cookie = await setupAndLogin();
    let s = await act(cookie, 'start');
    expect((await post(cookie, 'burn', { cardId: 0, reason: 'x' })).status).toBe(409);
    s = await finishOpen(cookie, s);
    s = await act(cookie, 'draw', { tz: TZ });
    expect((await post(cookie, 'burn', { cardId: 1, reason: 'x' })).status).toBe(409);
    s = await finishOpen(cookie, s);
    s = await act(cookie, 'draw', { tz: TZ });
    expect((await post(cookie, 'burn', { cardId: openDay(s).cardId, reason: '  ' })).status).toBe(400);
    const burned = openDay(s);
    s = await act(cookie, 'burn', { cardId: burned.cardId, reason: 'المطر' });
    expect(s.days.find((d) => d.id === burned.id)).toMatchObject({ state: 'burned' });
    expect(s.run!.burnUsed).toBe(true);
    // the next card is locked like after a finished day; open it and try to burn again
    s = await act(cookie, 'draw', { tz: TZ, override: true });
    expect(s.open!.burn).toBe('used');
    expect((await post(cookie, 'burn', { cardId: openDay(s).cardId, reason: 'x' })).status).toBe(409);
  });

  it('a full run with the real deck: order, the double pair back to back, then «دورة جديدة»', async () => {
    const cookie = await setupAndLogin();
    let s = await act(cookie, 'start');
    for (;;) {
      s = await finishOpen(cookie, s);
      if (s.run!.status === 'done') break;
      s = await act(cookie, 'draw', { tz: TZ });
    }
    const order = [...s.days].sort((a, b) => a.seq! - b.seq!).map((d) => d.cardId);
    expect(order).toHaveLength(21);
    expect(order.slice(0, 2)).toEqual([0, 1]);
    expect(order[20]).toBe(20);
    expect(order[order.indexOf(17) + 1]).toBe(18);
    const stages = order.map((id) => SHAPE.cards.find((c) => c.id === id)!.stage);
    expect(stages.slice(2, 8).every((x) => x === 'stage1')).toBe(true);
    expect(stages.slice(8, 15).every((x) => x === 'stage2')).toBe(true);
    expect(stages.slice(15, 20).every((x) => x === 'stage3')).toBe(true);
    const old = s.run!.id;
    const n = await act(cookie, 'new-run');
    expect(n.run!.id).not.toBe(old);
    expect(n.days).toHaveLength(1);
    const runs = await getJson<{ id: string; status: string }[]>('/api/challenge/runs', cookie);
    expect(runs.find((r) => r.id === old)!.status).toBe('archived');
    // the archive can still be read, with its cards
    const arch = await getJson<State>(`/api/challenge?run=${old}`, cookie);
    expect(Object.keys(arch.cards)).toHaveLength(21);
  }, 60_000);

  it('new run is refused while the current one is not finished', async () => {
    const cookie = await setupAndLogin();
    await act(cookie, 'start');
    expect((await post(cookie, 'new-run')).status).toBe(409);
  });
});

describe('challenge: files and backups', () => {
  function audio(): Blob {
    const b = new Uint8Array(400);
    b.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]); // ....ftyp (m4a)
    return new Blob([b], { type: 'audio/mp4' });
  }
  async function uploadAudio(cookie: string, duration = '31.5', blob = audio()) {
    const fd = new FormData();
    fd.set('file', new File([blob], 'v.m4a', { type: blob.type }));
    fd.set('duration', duration);
    return call('/api/challenge/voice', { method: 'POST', cookie, body: fd });
  }

  it('voice: audio accepted only on its own route, ≤ 120 s, ≤ 5 MB', async () => {
    const cookie = await setupAndLogin();
    const ok = await uploadAudio(cookie);
    expect(ok.status).toBe(200);
    const { id } = (await ok.json()) as { id: string };
    const back = await call(`/api/images/${id}`, { cookie });
    expect(back.headers.get('Content-Type')).toBe('audio/mp4');
    expect((await uploadAudio(cookie, '180')).status).toBe(400);
    expect((await uploadAudio(cookie, '30', new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'audio/mp4' }))).status).toBe(400);
    expect((await uploadAudio(cookie, '30', new Blob(['hello world, not audio'], { type: 'audio/mp4' }))).status).toBe(400);
    // the image route still refuses audio
    const fd = new FormData();
    fd.set('file', new File([audio()], 'v.m4a', { type: 'audio/mp4' }));
    expect((await call('/api/images', { method: 'POST', cookie, body: fd })).status).toBe(400);
  });

  it('orphan cleanup keeps the challenge stills, BTS photos and voice memo', async () => {
    const cookie = await setupAndLogin();
    const s = await act(cookie, 'start');
    const still = await upload(cookie);
    const btsImg = await upload(cookie);
    const orphan = await upload(cookie);
    const voice = ((await (await uploadAudio(cookie)).json()) as { id: string }).id;
    await ops(cookie, [{ op: 'update', entity: 'challengeDays', id: s.days[0].id, fields: { stillImageIds: [still], btsImageIds: [btsImg], voiceId: voice } }]);
    const later = Date.now() + 3 * 24 * 3600 * 1000;
    const removed = await sweepImages(env.DB, env.BUCKET, later);
    expect(removed).toBe(1);
    const left = await env.DB.prepare('SELECT id FROM images ORDER BY id').all<{ id: string }>();
    expect(left.results.map((r) => r.id).sort()).toEqual([still, btsImg, voice].sort());
    expect(await env.BUCKET.head(`img/${voice}`)).not.toBeNull();
    expect(await env.BUCKET.head(`img/${orphan}`)).toBeNull();
  });

  it('the nightly backup includes both challenge tables', async () => {
    const cookie = await setupAndLogin();
    await act(cookie, 'start');
    const key = await backup(env.DB, env.BUCKET);
    const file = (await (await env.BUCKET.get(key))!.json()) as { tables: Record<string, unknown[]> };
    expect(file.tables.challenge_runs).toHaveLength(1);
    expect(file.tables.challenge_days).toHaveLength(1);
  });

  it('the rows sync to other devices through /api/changes', async () => {
    const cookie = await setupAndLogin();
    const before = Date.now() - 1;
    await act(cookie, 'start');
    const ch = await getJson<{ rows: Record<string, unknown[]> }>(`/api/changes?since=${before}`, cookie);
    expect(ch.rows.challengeRuns).toHaveLength(1);
    expect(ch.rows.challengeDays).toHaveLength(1);
  });

  it('postpone helper refuses an unknown or closed card', async () => {
    await setupAndLogin();
    await expect(postpone(env.DB, 5)).rejects.toThrow();
  });
});
