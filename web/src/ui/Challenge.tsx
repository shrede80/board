import { useEffect, useRef, useState } from 'react';
import type { Row } from '../../../shared/schema';
import {
  answers, burnCard, cardOf, cardsLeft, closeCh, completeDay, drawCard, folderName, getMeta, hoursLeft, journalOf, JOURNAL_MIN, LIMITS, openActions,
  popCh, postponeCard, pushCh, remainingInStage, replaceCh, setDayField, setJournal, stageColor, stageNames, stageOfSeq, startChallenge, syncRegretIdea,
  TOTAL_DAYS, useChallenge, view, type ChCard, type ChRoute, type ChView,
} from '../app/challenge';
import { uploadFile } from '../app/images';
import { engine, getState, setState, toast, useApp } from '../app/state';
import { Icon, Switch, Textarea } from '../ds/ds';
import { api } from '../data/api';
import { useIsMobile } from '../lib/device';
import { AddSheet } from './m/AddSheet';
import { Sheet, SheetRow } from './m/kit';

/**
 * «تحدي العشرين إطاراً» (UPDATE-2 §4, mockups/challenge.html). Calm screens: a title, one line,
 * short sections. The same screens on the phone and (as a 560 px column) on the laptop.
 *
 * SECRECY: only cards returned by the server (drawn ones) are ever shown. A day that is not
 * drawn shows its number and «···», nothing else.
 */

const DARK = '#141210';
const PAPER = '#fdfcfa';
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Stage colour on the always-dark screens (the darkest stage gets a lighter card). */
function onDark(stageId: string | undefined) {
  const c = stageColor(stageId);
  if (c.includes('ink-900')) return { bg: '#2b2722', fg: PAPER, sub: '#b9b9c2', edge: '#4a4238' };
  if (c.includes('ink-700') || c.includes('text-muted')) return { bg: c, fg: DARK, sub: '#3a342c', edge: 'transparent' };
  return { bg: c, fg: DARK, sub: '#3a342c', edge: 'transparent' };
}

const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: 0.2 };
const cta: React.CSSProperties = { height: 54, borderRadius: 12, border: 'none', background: 'var(--color-accent)', color: '#141210', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700, fontSize: 16, width: '100%', cursor: 'pointer', boxShadow: '0 10px 24px rgba(169,124,73,.35)' };
const ghost: React.CSSProperties = { height: 52, borderRadius: 12, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, cursor: 'pointer' };
const ib: React.CSSProperties = { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', flexShrink: 0 };
const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '0 12px', borderRadius: 999, background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)', fontSize: 13, fontWeight: 700, color: 'var(--color-text)' };

// ======================================================================
// Home card (§4.1)
// ======================================================================

function useNow(ms = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function homeButton(v: ChView, now: number): { text: string; run?: () => void; disabled?: boolean } {
  const s = v.status;
  if (s.kind === 'start') return { text: 'ابدأ التحدي', run: () => void startChallenge() };
  if (s.kind === 'open') return { text: 'افتح بطاقة اليوم', run: () => setState({ ch: [{ v: 'card', dayId: s.day.id }] }) };
  if (s.kind === 'draw') return { text: 'اسحب بطاقة اليوم', run: () => setState({ ch: [{ v: 'draw' }] }) };
  if (s.kind === 'locked') return { text: `بطاقة بكرة ${hoursLeft(s.until, now)}`, disabled: true };
  // the mirror arrives with phase B; until then the journey
  return { text: 'المرآة', run: () => setState({ ch: [{ v: 'journey' }] }) };
}

/** 20 small frames: finished / current / coming. Nothing about a coming card. */
function Strip({ v, h = 20 }: { v: ChView; h?: number }) {
  return (
    <div data-testid="ch-strip" style={{ display: 'flex', gap: 3, direction: 'rtl' }}>
      {Array.from({ length: TOTAL_DAYS }, (_, i) => {
        const seq = i + 1;
        const d = v.bySeq.get(seq);
        const finished = d && (d.state === 'done' || d.state === 'burned');
        const cur = v.run && seq === v.current && v.status.kind !== 'mirror';
        return (
          <i key={seq} data-state={finished ? 'done' : cur ? 'current' : 'coming'}
            style={{ flex: 1, height: h, borderRadius: 2, background: finished ? (d!.state === 'burned' ? '#6b6255' : '#d3bf94') : cur ? '#d2a06a' : '#2b2722', boxShadow: cur ? `0 0 0 2px ${DARK},0 0 0 3px #d2a06a` : undefined }} />
        );
      })}
    </div>
  );
}

export function ChallengeHomeCard({ laptop }: { laptop?: boolean }) {
  const v = useChallenge();
  const offline = useApp((s) => s.offline);
  const now = useNow();
  if (!getMeta() && !v.run) return null;
  const b = homeButton(v, now);
  const stage = v.run ? stageNames(stageOfSeq(Math.min(v.current, TOTAL_DAYS))).short : '';
  const num = v.run ? Math.min(Math.max(v.current, 0), TOTAL_DAYS) : 0;
  const openJourney = () => v.run && setState({ ch: [{ v: 'journey' }] });
  const button = (
    <button data-testid="ch-home-btn" disabled={b.disabled || offline} onClick={(e) => (e.stopPropagation(), b.run?.())}
      style={{ background: b.disabled ? '#2b2722' : '#d2a06a', color: b.disabled ? '#b9b9c2' : DARK, border: 'none', borderRadius: 8, padding: '0 16px', height: 40, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', cursor: b.disabled ? 'default' : 'pointer', flexShrink: 0 }}>
      {b.text}
    </button>
  );
  const early = v.status.kind === 'locked' && (
    <button data-testid="ch-override" onClick={(e) => (e.stopPropagation(), setState({ ch: [{ v: 'draw', override: true }] }))}
      style={{ border: 'none', background: 'transparent', color: '#b9b9c2', fontSize: 12, textDecoration: 'underline', padding: '4px 0', cursor: 'pointer', alignSelf: laptop ? 'center' : 'flex-start' }}>
      أحتاج أفتحها اليوم
    </button>
  );
  const count = v.run && (
    <span style={{ fontSize: 14, whiteSpace: 'nowrap' }} data-testid="ch-home-count">
      <b style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 900, color: '#d2a06a', marginInlineEnd: 6 }}>{num}</b>من {TOTAL_DAYS}
    </span>
  );
  if (laptop) {
    return (
      <section data-component="ChallengeHome" data-testid="ch-home" onClick={openJourney}
        style={{ background: DARK, color: PAPER, border: '1px solid #3a342c', borderRadius: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 20, cursor: v.run ? 'pointer' : 'default' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 21, whiteSpace: 'nowrap' }}>تحدي العشرين إطاراً</span>
        {stage && <span style={{ fontSize: 12, color: '#b9b9c2', whiteSpace: 'nowrap' }}>{stage}</span>}
        <div style={{ flex: 1, minWidth: 160 }}><Strip v={v} h={16} /></div>
        {count}
        <div style={{ display: 'flex', flexDirection: 'column' }}>{button}{early}</div>
      </section>
    );
  }
  return (
    <section data-component="ChallengeHome" data-testid="ch-home" onClick={openJourney}
      style={{ background: DARK, color: PAPER, border: '1px solid #3a342c', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, cursor: v.run ? 'pointer' : 'default' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 21 }}>تحدي العشرين إطاراً</span>
        {stage && <span style={{ fontSize: 12, color: '#b9b9c2' }}>{stage}</span>}
      </div>
      <Strip v={v} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        {count || <span />}
        {button}
      </div>
      {early}
    </section>
  );
}

// ======================================================================
// The focus layer: one screen at a time (back closes the top one)
// ======================================================================

export function ChallengeLayer() {
  const stack = useApp((s) => s.ch);
  const addSheet = useApp((s) => s.addSheet);
  const mobile = useIsMobile();
  useChallenge();
  useEffect(() => {
    if (!stack.length) return;
    const onKey = (e: KeyboardEvent) => {
      const s = getState();
      if (e.key !== 'Escape' || s.confirm || s.popMenu || s.addSheet || s.modal) return;
      e.stopImmediatePropagation();
      popCh();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [stack.length]);
  if (!stack.length) return null;
  const SHEETS = ['rules', 'menu', 'burn'];
  const top = stack[stack.length - 1];
  const base = [...stack].reverse().find((r) => !SHEETS.includes(r.v));
  const dark = base?.v === 'draw';
  return (
    <div data-component="ChallengeLayer" data-testid="ch-layer" {...(dark ? { 'data-sb-theme': 'dark' } : {})}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: dark ? DARK : 'var(--color-bg)', color: dark ? PAPER : 'var(--color-text)', display: 'flex', justifyContent: 'center', paddingTop: 'env(safe-area-inset-top)' }}>
      <div style={{ width: '100%', maxWidth: mobile ? undefined : 560, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {base ? <Screen r={base} key={routeKey(base)} /> : null}
      </div>
      {SHEETS.includes(top.v) && <SheetFor r={top} />}
      {!mobile && addSheet && <AddSheet />}
    </div>
  );
}

const routeKey = (r: ChRoute) => `${r.v}:${'dayId' in r ? r.dayId : ''}`;

function Screen({ r }: { r: ChRoute }) {
  switch (r.v) {
    case 'draw':
      return <DrawScreen override={!!r.override} />;
    case 'card':
      return <CardScreen dayId={r.dayId} flippedAtStart={!!r.flipped} />;
    case 'journal':
      return <JournalScreen dayId={r.dayId} />;
    case 'journey':
      return <JourneyScreen />;
    case 'log':
      return <LogScreen />;
    default:
      return null;
  }
}

function SheetFor({ r }: { r: ChRoute }) {
  if (r.v === 'rules') return <RulesSheet />;
  if (r.v === 'menu') return <MenuSheet dayId={r.dayId} />;
  if (r.v === 'burn') return <BurnSheet dayId={r.dayId} />;
  return null;
}

function TopBar({ start, mid, end, testid }: { start?: React.ReactNode; mid?: React.ReactNode; end?: React.ReactNode; testid?: string }) {
  return (
    <div data-testid={testid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', flexShrink: 0, minHeight: 56 }}>
      <div style={{ width: 44 }}>{start}</div>
      <div style={{ ...label, fontSize: 13, color: 'inherit', opacity: 0.75, textAlign: 'center' }}>{mid}</div>
      <div style={{ width: 44 }}>{end}</div>
    </div>
  );
}
const Close = ({ onClick = popCh, testid = 'ch-close' }: { onClick?: () => void; testid?: string }) => (
  <button aria-label="إغلاق" data-testid={testid} onClick={onClick} style={ib}><Icon name="x" size={20} /></button>
);

// ======================================================================
// The draw (§4.2): always dark, a stack in the stage colour, one button
// ======================================================================

const Holes = ({ side }: { side: 'left' | 'right' }) => (
  <div style={{ position: 'absolute', top: 14, bottom: 14, [side]: 12, width: 8, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
    {Array.from({ length: 7 }, (_, i) => <i key={i} style={{ display: 'block', height: 10, borderRadius: 2, background: DARK, opacity: 0.25 }} />)}
  </div>
);

function DrawScreen({ override }: { override: boolean }) {
  const v = useChallenge();
  const offline = useApp((s) => s.offline);
  const now = useNow(30_000);
  const [phase, setPhase] = useState<'idle' | 'lift' | 'wait' | 'flip'>('idle');
  const [drawn, setDrawn] = useState<Row | null>(null);
  const [early, setEarly] = useState(override);
  const busy = phase !== 'idle';
  const seq = Math.min(v.current, TOTAL_DAYS);
  const stage = stageOfSeq(seq);
  const col = onDark(stage);
  // another device drew meanwhile (or it is already open): show it
  useEffect(() => {
    if (!busy && v.open) replaceCh({ v: 'card', dayId: v.open.id });
  }, [busy, v.open]);
  const locked = v.status.kind === 'locked' && !early;
  const go = async () => {
    if (busy || locked) return;
    const motion = !reduced();
    setPhase('lift');
    const lift = new Promise((r) => setTimeout(r, motion ? 150 : 0));
    const [day] = await Promise.all([drawCard(early), lift]);
    if (!day) return setPhase('idle');
    setDrawn(day);
    if (!motion) return replaceCh({ v: 'card', dayId: day.id });
    setPhase('flip');
    setTimeout(() => replaceCh({ v: 'card', dayId: day.id }), 500 + 380);
  };
  const title = drawn ? cardOf(drawn.cardId as number)?.title : '';
  const left = stage ? remainingInStage(v, stage) : 0;
  const lift = phase === 'lift' || phase === 'wait' ? 'translateY(-14px)' : 'none';
  return (
    <div data-testid="ch-draw" style={{ flex: 1, display: 'flex', flexDirection: 'column', color: PAPER }}>
      <TopBar start={<Close onClick={closeCh} />} mid={<span style={{ color: '#b9b9c2' }}>{`اليوم ${seq}`}</span>} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 34, padding: '0 40px 60px' }}>
        <div style={{ position: 'relative', width: 250, height: 350, perspective: 1600 }}>
          <div style={{ position: 'absolute', inset: 0, transform: 'rotate(-7deg) translate(-14px,6px)', borderRadius: 16, background: col.bg, opacity: 0.45 }} />
          <div style={{ position: 'absolute', inset: 0, transform: 'rotate(4deg) translate(10px,4px)', borderRadius: 16, background: col.bg, opacity: 0.7 }} />
          <div data-testid="ch-draw-card" style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transition: `transform ${phase === 'flip' ? 500 : 150}ms var(--ease-standard)`, transform: `${lift} ${phase === 'flip' ? 'rotateY(180deg)' : ''}` }}>
            <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: 16, background: col.bg, border: `1px solid ${col.edge}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, boxShadow: '0 30px 60px rgba(0,0,0,.5)' }}>
              <Holes side="right" />
              <Holes side="left" />
              <span style={{ fontSize: 13, fontWeight: 700, color: col.sub }}>{stageNames(stage).long}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 74, lineHeight: 1, color: col.fg }}>?</span>
              <span data-testid="ch-left" style={{ fontSize: 13, fontWeight: 700, color: col.sub }}>{cardsLeft(left)}</span>
            </div>
            <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', borderRadius: 16, background: PAPER, color: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
              {title && <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 30, lineHeight: 1.2 }}>{title}</span>}
            </div>
          </div>
        </div>
        {locked && v.status.kind === 'locked' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}>
            <span style={{ fontSize: 15, color: '#b9b9c2' }}>{`بطاقة بكرة ${hoursLeft(v.status.until, now)}`}</span>
            <button data-testid="ch-override" onClick={() => setEarly(true)} style={{ border: 'none', background: 'transparent', color: '#d2a06a', textDecoration: 'underline', fontSize: 14, cursor: 'pointer' }}>أحتاج أفتحها اليوم</button>
          </div>
        ) : (
          <button data-testid="ch-draw-btn" disabled={busy || offline || v.status.kind !== 'draw' && !early} onClick={() => void go()}
            style={{ width: '100%', height: 56, borderRadius: 12, border: 'none', background: PAPER, color: DARK, fontWeight: 700, fontSize: 17, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            اسحب
          </button>
        )}
      </div>
    </div>
  );
}

// ======================================================================
// The card (§4.3–4.4): face, then back after «أنهيت»
// ======================================================================

function dayRow(id: string): Row | undefined {
  return engine.store.challengeDays.get(id);
}

function Section({ title, children, accent, testid }: { title: string; children: React.ReactNode; accent?: boolean; testid?: string }) {
  return (
    <section data-testid={testid} style={{ display: 'flex', flexDirection: 'column', gap: 6, ...(accent ? { borderInlineStart: '3px solid var(--color-accent)', paddingInlineStart: 12 } : {}) }}>
      <span style={{ ...label, color: accent ? 'var(--tan-600)' : label.color }}>{title}</span>
      {children}
    </section>
  );
}
const P = ({ children }: { children: React.ReactNode }) => <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.8, fontFamily: 'var(--font-serif-text)' }}>{children}</p>;
function List({ items, testid }: { items: string[]; testid?: string }) {
  return (
    <ul data-testid={testid} style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((t, i) => (
        <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 15.5, lineHeight: 1.75, fontFamily: 'var(--font-serif-text)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text)', marginTop: 11, flexShrink: 0 }} />{t}
        </li>
      ))}
    </ul>
  );
}

/** The decision written yesterday («قرار واحد تسويه بكرة»), shown on top of today's card. */
function yesterdayDecision(v: ChView, day: Row): string {
  const seq = day.seq as number;
  for (let s = seq - 1; s >= 1; s--) {
    const d = v.bySeq.get(s);
    if (d?.state === 'done') return (journalOf(d).tomorrow ?? '').trim();
    if (d?.state === 'burned') continue;
  }
  return '';
}

function CardScreen({ dayId, flippedAtStart }: { dayId: string; flippedAtStart: boolean }) {
  const v = useChallenge();
  const offline = useApp((s) => s.offline);
  const day = dayRow(dayId);
  const card = day ? cardOf(day.cardId as number) : undefined;
  const [flipped, setFlipped] = useState(flippedAtStart);
  const [seen, setSeen] = useState(flippedAtStart);
  const [kit, setKit] = useState(false);
  if (!day || !card) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <TopBar start={<Close />} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>…</div>
      </div>
    );
  }
  const seq = day.seq as number | null;
  const open = day.state === 'drawn';
  const prep = card.type === 'prep';
  const backAllowed = !prep && day.state !== 'burned';
  const flip = () => {
    setSeen(true);
    setFlipped(true);
  };
  const stage = stageNames(card.stageId).short;
  const decision = open && !prep ? yesterdayDecision(v, day) : '';
  const menuBtn = (
    <button aria-label="خيارات" data-testid="ch-card-more" onClick={() => pushCh({ v: 'menu', dayId })} style={{ ...ib, fontSize: 20 }}><Icon name="more" size={20} /></button>
  );
  const face = (
    <div data-testid="ch-face" style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '4px 20px 120px' }}>
      {decision && (
        <div data-testid="ch-yesterday" style={{ background: 'var(--color-accent-soft)', borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Icon name="repeat" size={15} color="var(--tan-600)" />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tan-600)', whiteSpace: 'nowrap', marginTop: 1 }}>قرارك من أمس</span>
          <span style={{ fontSize: 13.5, lineHeight: 1.6 }}>{decision}</span>
        </div>
      )}
      {day.state === 'burned' && (
        <div data-testid="ch-burned" style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, lineHeight: 1.6 }}>
          <b>محروقة</b> — {day.burnReason as string}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1 data-testid="ch-title" style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 36, lineHeight: 1.15 }}>{card.title}</h1>
        <span data-testid="ch-hook" style={{ fontFamily: 'var(--font-serif-text)', fontSize: 16, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>{card.hook}</span>
        {card.subtitle && <span style={{ fontSize: 13, color: 'var(--tan-600)', fontWeight: 700 }}>{card.subtitle}</span>}
      </div>
      {card.note && (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <b style={{ fontSize: 13 }}>{card.note.label}</b>
          <span style={{ fontSize: 14, lineHeight: 1.7 }}>{card.note.text}</span>
        </div>
      )}
      <Section title="الفكرة"><P>{card.idea}</P></Section>
      {prep ? <PrepList day={day} card={card} /> : (
        <>
          {card.constraint && <Section title="القيد" accent><P>{card.constraint}</P></Section>}
          {card.deliverable && (
            <Section title="المطلوب">{Array.isArray(card.deliverable) ? <List items={card.deliverable} /> : <P>{card.deliverable}</P>}</Section>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {card.time && <span style={chip}><Icon name="clock" size={14} />{card.time}</span>}
            {card.difficulty != null && <span style={chip}>الصعوبة <span style={{ letterSpacing: 1 }}>{'●'.repeat(card.difficulty) + '○'.repeat(Math.max(0, 3 - card.difficulty))}</span></span>}
            {card.gear && (
              <button data-testid="ch-kit" onClick={() => setKit((k) => !k)} style={{ ...chip, cursor: 'pointer' }}>
                <Icon name="camera" size={14} />العدّة<Icon name={kit ? 'chevron-up' : 'chevron-down'} size={13} />
              </button>
            )}
            {card.requirements.map((r) => (
              <span key={r} style={chip} data-testid="ch-req"><Icon name={r} size={14} />{getMeta()?.requirementLabels[r] ?? r}</span>
            ))}
          </div>
          {kit && card.gear && <div data-testid="ch-kit-text" style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--color-text-muted)' }}>{card.gear}</div>}
        </>
      )}
    </div>
  );
  const partner = card.double != null ? v.days.find((d) => d.cardId === card.double) : undefined;
  const partnerCard = partner ? cardOf(partner.cardId as number) : undefined;
  const back = seen && backAllowed && (
    <div data-testid="ch-back" style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '4px 20px 120px' }}>
      <span style={label}>{`اليوم ${seq ?? ''} · ظهر البطاقة`}</span>
      {card.successMark && (
        <div style={{ background: DARK, color: PAPER, borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#d2a06a' }}>علامة النجاح</span>
          <span style={{ fontFamily: 'var(--font-serif-text)', fontSize: 17, lineHeight: 1.75 }}>{card.successMark}</span>
        </div>
      )}
      {card.skill && <Section title="المهارة"><P>{card.skill}</P></Section>}
      {card.bts && <Section title="الكواليس"><P>{card.bts}</P></Section>}
      {card.publish && <Section title="زاوية النشر"><P>{card.publish}</P></Section>}
      {card.double != null && (
        partner && partnerCard && partner.seq != null ? (
          <button data-testid="ch-partner" onClick={() => pushCh({ v: 'card', dayId: partner.id })} style={{ ...ghost, height: 'auto', padding: '12px 14px', justifyContent: 'space-between' }}>
            <span style={label}>البطاقة الشريكة</span><span>{`اليوم ${partner.seq} · ${partnerCard.title}`}</span>
          </button>
        ) : <span data-testid="ch-partner" style={{ ...label, fontWeight: 600 }}>شريكتها تجيك بكرة</span>
      )}
    </div>
  );
  const footer = (() => {
    if (prep) {
      return open ? <button data-testid="ch-prep-done" disabled={offline} style={cta} onClick={() => void completeDay(day)}>أنهيت التجهيز</button> : null;
    }
    if (!flipped) {
      if (!backAllowed) return null;
      return <button data-testid="ch-flip" style={cta} onClick={flip}>{open ? 'أنهيت — اقلب البطاقة' : 'اقلب البطاقة'}</button>;
    }
    return (
      <div style={{ display: 'flex', gap: 10 }}>
        <button data-testid="ch-unflip" style={{ ...ghost, flex: 1 }} onClick={() => setFlipped(false)}>رجوع للوجه</button>
        <button data-testid="ch-log-day" style={{ ...cta, flex: 2, boxShadow: 'none' }} onClick={() => pushCh({ v: 'journal', dayId })}>{open ? 'سجّل اليوم' : 'الدفتر'}</button>
      </div>
    );
  })();
  const motion = reduced() ? 'none' : 'transform 480ms var(--ease-standard)';
  return (
    <div data-testid="ch-card" data-card-state={day.state} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <TopBar start={<Close />} mid={prep ? stage : `${seq != null ? `اليوم ${seq}` : 'مؤجلة'}${stage ? ` · ${stage}` : ''}`} end={open && !prep ? menuBtn : <span />} />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', perspective: 1800 }}>
        <div style={{ display: 'grid', transformStyle: 'preserve-3d', transition: motion, transform: flipped ? 'rotateY(180deg)' : 'none' }}>
          <div style={{ gridArea: '1/1', backfaceVisibility: 'hidden', visibility: flipped && reduced() ? 'hidden' : undefined }}>{face}</div>
          <div style={{ gridArea: '1/1', backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', visibility: !flipped && reduced() ? 'hidden' : undefined }}>{back}</div>
        </div>
      </div>
      {footer && <div style={{ position: 'absolute', left: 20, right: 20, bottom: 'calc(24px + env(safe-area-inset-bottom))' }}>{footer}</div>}
    </div>
  );
}

/** Prep card: the setup items are a checklist that is saved; then the gaps worth filling. */
function PrepList({ day, card }: { day: Row; card: ChCard }) {
  const live = dayRow(day.id) ?? day;
  useApp((s) => s.dataVersion);
  const marks = journalOf(live).setup ?? [];
  const items = card.setupItems ?? [];
  const toggle = (i: number) => {
    const next = items.map((_, k) => (k === i ? !marks[k] : !!marks[k]));
    setJournal(live, { setup: next });
  };
  return (
    <>
      <Section title="التجهيز" testid="ch-setup">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((t, i) => (
            <label key={i} data-testid="ch-setup-item" data-checked={marks[i] ? '1' : '0'} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!marks[i]} onChange={() => toggle(i)} style={{ width: 22, height: 22, accentColor: 'var(--tan-600)', flexShrink: 0, marginTop: 3 }} />
              <span style={{ fontSize: 15, lineHeight: 1.75, fontFamily: 'var(--font-serif-text)', textDecoration: marks[i] ? 'line-through' : 'none', color: marks[i] ? 'var(--color-text-muted)' : undefined }}>{t}</span>
            </label>
          ))}
        </div>
      </Section>
      {card.gearGaps?.length ? <Section title="نواقص يجدر سدّها"><List items={card.gearGaps} /></Section> : null}
    </>
  );
}

// ======================================================================
// ⋯ menu, burn, rules (sheets)
// ======================================================================

function MenuSheet({ dayId }: { dayId: string }) {
  useChallenge();
  const day = dayRow(dayId);
  const a = openActions();
  if (!day) return null;
  const act = a && a.cardId === day.cardId ? a : null;
  return (
    <Sheet onClose={popCh} testid="ch-menu">
      {act && act.postpone !== 'protected' && (
        <SheetRow testid="ch-postpone" icon="repeat" label="أجّل" disabled={act.postpone === 'alone'}
          sub={act.postpone === 'alone' ? 'ما فيه بطاقة ثانية في هذه المرحلة' : undefined}
          onClick={() => void postponeCard(day)} />
      )}
      {act && act.burn !== 'protected' && (
        <SheetRow testid="ch-burn" icon="x-circle" label="احرق" disabled={act.burn === 'used'} sub={act.burn === 'used' ? 'استخدمت الحرق' : 'مرة وحدة'}
          onClick={() => replaceCh({ v: 'burn', dayId })} />
      )}
      <SheetRow testid="ch-quick-idea" icon="sparkles" label="فكرة سريعة" onClick={() => (popCh(), setState({ addSheet: 'idea' }))} />
    </Sheet>
  );
}

function BurnSheet({ dayId }: { dayId: string }) {
  const day = dayRow(dayId);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!day) return null;
  return (
    <Sheet onClose={popCh} testid="ch-burn-sheet" title="احرق البطاقة">
      <span style={{ fontSize: 14, color: 'var(--color-text-muted)', marginTop: -6 }}>مرة وحدة في الدورة. السبب ينحفظ في الدفتر.</span>
      <Textarea data-testid="ch-burn-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ليش؟" rows={3} style={{ fontSize: 16 }} />
      <button data-testid="ch-burn-ok" disabled={!reason.trim() || busy} onClick={async () => (setBusy(true), await burnCard(day, reason), setBusy(false))}
        style={{ ...cta, background: 'var(--color-danger)', color: PAPER, boxShadow: 'none', opacity: reason.trim() ? 1 : 0.5 }}>احرق</button>
    </Sheet>
  );
}

function RulesSheet() {
  const rules = getMeta()?.rules ?? [];
  return (
    <Sheet onClose={popCh} testid="ch-rules" title="القواعد العشر">
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rules.map((r, i) => (
          <li key={i} style={{ display: 'flex', gap: 12, fontSize: 14.5, lineHeight: 1.75 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--tan-600)', minWidth: 20 }}>{i + 1}</b>{r}
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

// ======================================================================
// Journal (§4.5): one question per screen
// ======================================================================

type TextKey = 'worked' | 'failed' | 'regret' | 'tomorrow';
const STEPS: { kind: 'bts' | TextKey | 'film'; q: string }[] = [
  { kind: 'bts', q: 'الكواليس' },
  { kind: 'worked', q: 'وش اللي نجح اليوم؟' },
  { kind: 'failed', q: 'وش اللي ما نجح؟' },
  { kind: 'regret', q: 'اللقطة اللي ندمت إنك ما صوّرتها' },
  { kind: 'tomorrow', q: 'قرار واحد تسويه بكرة بشكل مختلف' },
  { kind: 'film', q: 'الفيلم' },
];

function JournalScreen({ dayId }: { dayId: string }) {
  useChallenge();
  const offline = useApp((s) => s.offline);
  const day = dayRow(dayId);
  const card = day ? cardOf(day.cardId as number) : undefined;
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  if (!day || !card) return null;
  const open = day.state === 'drawn';
  const n = answers(day);
  const last = step === STEPS.length - 1;
  const s = STEPS[step];
  const finish = async () => {
    if (open) {
      setBusy(true);
      await completeDay(day);
      setBusy(false);
    } else {
      syncRegretIdea(day);
      popCh();
    }
  };
  return (
    <div data-testid="ch-journal" data-step={step} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <TopBar start={<Close />} mid={
        <span style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          {STEPS.map((_, i) => (
            <button key={i} aria-label={`سؤال ${i + 1}`} onClick={() => setStep(i)} style={{ width: i === step ? 20 : 7, height: 7, padding: 0, border: 'none', borderRadius: 4, background: i === step ? 'var(--color-accent)' : 'var(--color-surface-strong)', cursor: 'pointer' }} />
          ))}
        </span>
      } />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 20px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <span style={label}>{`دفتر اليوم ${day.seq} · ${step + 1} من ${STEPS.length}`}</span>
        <h1 data-testid="ch-q" style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 30, lineHeight: 1.25 }}>{s.q}</h1>
        {s.kind === 'bts' && <BtsStep day={day} />}
        {(s.kind === 'worked' || s.kind === 'failed' || s.kind === 'regret' || s.kind === 'tomorrow') && <TextStep day={day} k={s.kind} key={s.kind} />}
        {s.kind === 'film' && <FilmStep day={day} title={card.title} />}
        <span data-testid="ch-answers" style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{`جاوب على 3 أسئلة على الأقل من 5 · جاوبت ${n}`}</span>
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '10px 20px calc(24px + env(safe-area-inset-bottom))', flexShrink: 0 }}>
        {last ? (
          <>
            <button style={{ ...ghost, flex: 1 }} onClick={() => setStep(step - 1)}>السابق</button>
            <button data-testid="ch-journal-done" disabled={busy || offline || (open && n < JOURNAL_MIN)} onClick={() => void finish()}
              style={{ ...cta, flex: 2, boxShadow: 'none', opacity: open && n < JOURNAL_MIN ? 0.45 : 1 }}>{open ? 'سجّل اليوم' : 'تم'}</button>
          </>
        ) : (
          <>
            <button data-testid="ch-skip" style={{ ...ghost, flex: 1 }} onClick={() => setStep(step + 1)}>تخطّي</button>
            <button data-testid="ch-next" style={{ ...cta, flex: 2, boxShadow: 'none' }} onClick={() => setStep(step + 1)}>التالي</button>
          </>
        )}
      </div>
    </div>
  );
}

/** A text answer: typed locally, saved as you type (one undo step per pause). */
function TextStep({ day, k }: { day: Row; k: TextKey }) {
  const [val, setVal] = useState(() => journalOf(day)[k] ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const live = dayRow(day.id) ?? day;
  const send = journalOf(live).sendRegret !== false;
  return (
    <>
      <Textarea ref={ref} data-testid={`ch-a-${k}`} value={val} rows={5} placeholder="اكتب سطر أو سطرين…"
        onChange={(e) => {
          setVal(e.target.value);
          setJournal(live, { [k]: e.target.value }, k);
        }}
        style={{ fontFamily: 'var(--font-serif-text)', fontSize: 17, lineHeight: 1.7, minHeight: 150 }} />
      {k === 'regret' && (
        <div data-testid="ch-send-regret" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Switch checked={send} onChange={(v) => setJournal(live, { sendRegret: v })} label="أرسلها لصندوق الأفكار" />
        </div>
      )}
    </>
  );
}

function BtsStep({ day }: { day: Row }) {
  useApp((s) => s.dataVersion);
  const live = dayRow(day.id) ?? day;
  const list = getMeta()?.btsChecklist ?? [];
  const marks = (Array.isArray(live.bts) ? live.bts : [false, false, false, false, false]) as boolean[];
  const toggle = (i: number) => setDayField(live, { bts: marks.map((m, k) => (k === i ? !m : m)) });
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {list.map((t, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <label data-testid="ch-bts-item" data-checked={marks[i] ? '1' : '0'} style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!marks[i]} onChange={() => toggle(i)} style={{ width: 22, height: 22, accentColor: 'var(--tan-600)', flexShrink: 0 }} />
            <span style={{ fontSize: 15, lineHeight: 1.6 }}>{t}</span>
          </label>
          {i === 2 && <Voice day={live} />}
        </div>
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 14 }}>
        <span style={label}>{`صور الكواليس · حتى ${LIMITS.bts}`}</span>
        <Pics day={live} field="btsImageIds" max={LIMITS.bts} testid="ch-bts-pics" />
      </div>
    </div>
  );
}

function FilmStep({ day, title }: { day: Row; title: string }) {
  const live = dayRow(day.id) ?? day;
  const [film, setFilm] = useState((live.filmUrl as string) ?? '');
  const [pub, setPub] = useState((live.publishUrl as string) ?? '');
  const [folder, setFolder] = useState(journalOf(live).folder ?? '');
  const suggested = folderName(live.seq as number, title);
  const input: React.CSSProperties = { height: 48, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--field-bg, var(--color-bg))', color: 'var(--color-text)', padding: '0 12px', fontSize: 15, width: '100%', boxSizing: 'border-box', direction: 'ltr', textAlign: 'right' };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(suggested);
    } catch {
      /* not allowed: still fill the field */
    }
    setFolder(suggested);
    setJournal(live, { folder: suggested });
    toast('نُسخ اسم المجلد');
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={label}>رابط الفيلم</span>
        <input data-testid="ch-film" style={input} type="url" inputMode="url" placeholder="https://" value={film}
          onChange={(e) => (setFilm(e.target.value), setDayField(live, { filmUrl: e.target.value.trim() }, 'film'))} />
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={label}>{`لقطات ثابتة · حتى ${LIMITS.stills}`}</span>
        <Pics day={live} field="stillImageIds" max={LIMITS.stills} testid="ch-stills" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={label}>المجلد</span>
        <button data-testid="ch-folder-copy" onClick={() => void copy()} style={{ ...chip, alignSelf: 'flex-start', cursor: 'pointer', direction: 'ltr' }}>
          <Icon name="copy" size={14} />{suggested}
        </button>
        <input data-testid="ch-folder" style={input} value={folder} placeholder={suggested}
          onChange={(e) => (setFolder(e.target.value), setJournal(live, { folder: e.target.value }, 'folder'))} />
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={label}>رابط النشر (اختياري)</span>
        <input data-testid="ch-publish" style={input} type="url" inputMode="url" placeholder="https://" value={pub}
          onChange={(e) => (setPub(e.target.value), setDayField(live, { publishUrl: e.target.value.trim() }, 'pub'))} />
      </label>
    </div>
  );
}

/** Up to N photos for a journal field (stills or BTS). */
function Pics({ day, field, max, testid }: { day: Row; field: 'stillImageIds' | 'btsImageIds'; max: number; testid: string }) {
  useApp((s) => s.dataVersion);
  const offline = useApp((s) => s.offline);
  const [uploading, setUploading] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const ids = ((dayRow(day.id) ?? day)[field] as string[] | undefined) ?? [];
  const add = async (files: FileList | null) => {
    const list = [...(files ?? [])].filter((f) => /^image\//.test(f.type)).slice(0, Math.max(0, max - ids.length));
    if (!list.length) return;
    setUploading((n) => n + list.length);
    for (const f of list) {
      try {
        const id = await uploadFile(f);
        const cur = ((dayRow(day.id) ?? day)[field] as string[]) ?? [];
        if (cur.length < max) setDayField(day, { [field]: [...cur, id] });
      } catch {
        toast('فشل رفع الصورة', { tone: 'danger' });
      }
      setUploading((n) => n - 1);
    }
  };
  const box: React.CSSProperties = { width: 84, height: 56, borderRadius: 8, flexShrink: 0, position: 'relative', overflow: 'hidden' };
  return (
    <div data-testid={testid} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {ids.map((id) => (
        <div key={id} style={{ ...box, background: `center/cover url(/api/images/${id}/thumb)` }} data-testid={`${testid}-img`}>
          <button aria-label="حذف الصورة" onClick={() => setDayField(day, { [field]: ids.filter((x) => x !== id) })}
            style={{ position: 'absolute', top: 2, left: 2, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(20,18,16,.7)', color: PAPER, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}><Icon name="x" size={12} /></button>
        </div>
      ))}
      {Array.from({ length: uploading }, (_, i) => <div key={`u${i}`} style={{ ...box, background: 'var(--color-surface-strong)' }} />)}
      {ids.length + uploading < max && (
        <button data-testid={`${testid}-add`} disabled={offline} onClick={() => input.current?.click()} style={{ ...box, border: '1px dashed var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Icon name="plus" size={18} />
        </button>
      )}
      <input ref={input} type="file" accept="image/*" multiple hidden data-testid={`${testid}-input`} onChange={(e) => (void add(e.target.files), (e.target.value = ''))} />
    </div>
  );
}

// ---------- voice memo (§2.2): record, listen, record again, delete ----------

const MAX_SECONDS = 120;
function pickMime(): string {
  const list = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/aac'];
  if (typeof MediaRecorder === 'undefined') return '';
  return list.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? '';
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function Voice({ day }: { day: Row }) {
  const offline = useApp((s) => s.offline);
  const [state, setStateV] = useState<'idle' | 'rec' | 'saving'>('idle');
  const [secs, setSecs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rec = useRef<{ r: MediaRecorder; stream: MediaStream; t0: number; timer: ReturnType<typeof setInterval> } | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const voiceId = (dayRow(day.id) ?? day).voiceId as string | null;
  useEffect(() => () => {
    rec.current?.stream.getTracks().forEach((t) => t.stop());
    audio.current?.pause();
  }, []);
  const start = async () => {
    if (offline) return toast('لا يوجد اتصال', { tone: 'danger' });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return toast('اسمح بالمايك من إعدادات المتصفح', { tone: 'danger' });
    }
    const mime = pickMime();
    const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const cur = rec.current;
      rec.current = null;
      if (cur) clearInterval(cur.timer);
      const seconds = Math.min(MAX_SECONDS, (Date.now() - (cur?.t0 ?? Date.now())) / 1000);
      const type = (r.mimeType || mime || 'audio/webm').split(';')[0];
      const blob = new Blob(chunks, { type });
      setStateV('saving');
      try {
        const fd = new FormData();
        fd.set('file', new File([blob], `voice.${type.includes('mp4') ? 'm4a' : type.split('/')[1]}`, { type }));
        fd.set('duration', String(Math.max(0.1, seconds)));
        const res = await api<{ id: string }>('/api/challenge/voice', { method: 'POST', body: fd });
        const live = dayRow(day.id) ?? day;
        const bts = (Array.isArray(live.bts) ? [...(live.bts as boolean[])] : [false, false, false, false, false]);
        bts[2] = true;
        setDayField(live, { voiceId: res.id, bts });
        toast('انحفظت المذكرة');
      } catch {
        toast('تعذّر حفظ المذكرة', { tone: 'danger' });
      }
      setStateV('idle');
    };
    const t0 = Date.now();
    const timer = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      setSecs(s);
      if (s >= MAX_SECONDS) stop();
    }, 250);
    rec.current = { r, stream, t0, timer };
    setSecs(0);
    r.start(1000);
    setStateV('rec');
  };
  const stop = () => {
    const cur = rec.current;
    if (cur && cur.r.state !== 'inactive') cur.r.stop();
  };
  const play = async () => {
    if (!voiceId) return;
    if (playing) {
      audio.current?.pause();
      return setPlaying(false);
    }
    try {
      // fetched as a blob: Safari plays a blob URL without needing range requests
      const res = await fetch(`/api/images/${voiceId}`, { credentials: 'same-origin' });
      const url = URL.createObjectURL(await res.blob());
      const a = new Audio(url);
      audio.current = a;
      a.onended = () => setPlaying(false);
      await a.play();
      setPlaying(true);
    } catch {
      toast('تعذّر التشغيل', { tone: 'danger' });
    }
  };
  const small: React.CSSProperties = { height: 40, padding: '0 14px', borderRadius: 999, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', fontSize: 13.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' };
  if (state === 'rec') {
    return (
      <div data-testid="ch-voice" data-state="rec" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--color-danger)' }} />
        <span style={{ fontSize: 14, direction: 'ltr' }}>{`${mmss(secs)} / ${mmss(MAX_SECONDS)}`}</span>
        <button data-testid="ch-voice-stop" onClick={stop} style={{ ...small, background: 'var(--color-danger)', color: PAPER, border: 'none' }}><Icon name="pause" size={14} />إيقاف</button>
      </div>
    );
  }
  if (state === 'saving') return <span data-testid="ch-voice" data-state="saving" style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>يحفظ…</span>;
  return (
    <div data-testid="ch-voice" data-state={voiceId ? 'saved' : 'idle'} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {voiceId ? (
        <>
          <button data-testid="ch-voice-play" onClick={() => void play()} style={small}><Icon name={playing ? 'pause' : 'play'} size={14} />{playing ? 'إيقاف' : 'استمع'}</button>
          <button data-testid="ch-voice-again" disabled={offline} onClick={() => void start()} style={small}><Icon name="mic" size={14} />سجّل من جديد</button>
          <button data-testid="ch-voice-delete" onClick={() => setDayField(dayRow(day.id) ?? day, { voiceId: null })} style={{ ...small, color: 'var(--color-danger)' }}><Icon name="trash" size={14} />حذف</button>
        </>
      ) : (
        <button data-testid="ch-voice-rec" disabled={offline} onClick={() => void start()} style={small}><Icon name="mic" size={14} />سجّل</button>
      )}
    </div>
  );
}

// ======================================================================
// Your journey (§4.6): a contact sheet of 20 frames
// ======================================================================

function JourneyScreen() {
  const v = useChallenge();
  const prep = v.bySeq.get(0);
  return (
    <div data-testid="ch-journey" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <TopBar start={<button aria-label="رجوع" data-testid="ch-close" onClick={popCh} style={ib}><Icon name="arrow-right" size={20} /></button>} mid="رحلتك" />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span data-testid="ch-done-count" style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 44, lineHeight: 1 }}>{v.done}</span>
          <span data-testid="ch-done-line" style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{`من ${TOTAL_DAYS}${v.burned ? ` · محروقة ${v.burned}` : ''}`}</span>
        </div>
        {prep && (
          <button data-testid="ch-prep-chip" onClick={() => pushCh({ v: 'card', dayId: prep.id })} style={{ ...chip, alignSelf: 'flex-start', cursor: 'pointer' }}>
            {`التجهيز${prep.state === 'done' ? ' ✓' : ''}`}
          </button>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, direction: 'rtl' }}>
          {Array.from({ length: TOTAL_DAYS }, (_, i) => <Frame key={i + 1} v={v} seq={i + 1} />)}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', paddingTop: 6 }}>
          <button data-testid="ch-open-log" onClick={() => pushCh({ v: 'log' })} style={{ ...chip, cursor: 'pointer' }}>الدفتر</button>
          <button data-testid="ch-open-rules" onClick={() => pushCh({ v: 'rules' })} style={{ ...chip, cursor: 'pointer' }}>القواعد العشر</button>
        </div>
      </div>
    </div>
  );
}

function Frame({ v, seq }: { v: ChView; seq: number }) {
  const d = v.bySeq.get(seq);
  const finished = d && (d.state === 'done' || d.state === 'burned');
  const isCur = !finished && seq === v.current && v.run?.status === 'active';
  const base: React.CSSProperties = { aspectRatio: '3 / 2', borderRadius: 6, position: 'relative', overflow: 'hidden', border: 'none', padding: 0, display: 'block', width: '100%' };
  const num = (color: string, shadow?: string) => (
    <b style={{ position: 'absolute', top: 5, right: 7, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 15, color, textShadow: shadow }}>{seq}</b>
  );
  if (finished) {
    const still = ((d!.stillImageIds as string[]) ?? [])[0];
    const card = cardOf(d!.cardId as number);
    const g = stageColor(card?.stageId);
    const bg = still ? `center/cover url(/api/images/${still}/thumb)` : `radial-gradient(circle at 40% 45%, ${g}, #1c1916 75%)`;
    return (
      <button data-testid="ch-frame" data-state={d!.state} onClick={() => pushCh({ v: 'card', dayId: d!.id })} style={{ ...base, background: bg, cursor: 'pointer' }}>
        {num(PAPER, '0 1px 4px rgba(0,0,0,.6)')}
        {d!.state === 'burned' && <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top left,transparent calc(50% - 1px),rgba(253,252,250,.7) 50%,transparent calc(50% + 1px))' }} />}
      </button>
    );
  }
  if (isCur) {
    const open = v.open && v.open.seq === seq ? v.open : null;
    return (
      <button data-testid="ch-frame" data-state="current" onClick={() => open && pushCh({ v: 'card', dayId: open.id })} style={{ ...base, background: 'var(--color-bg)', boxShadow: 'inset 0 0 0 2px var(--color-accent)', cursor: open ? 'pointer' : 'default' }}>
        {num('var(--tan-600)')}
      </button>
    );
  }
  // coming: the number and «···», nothing else
  return (
    <div data-testid="ch-frame" data-state="coming" style={{ ...base, background: 'var(--color-surface-strong)' }}>
      {num('var(--color-text-subtle)')}
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-subtle)', letterSpacing: 3, fontWeight: 700 }}>···</span>
    </div>
  );
}

function LogScreen() {
  const v = useChallenge();
  const rows = [...v.bySeq.values()].filter((d) => d.state === 'done' || d.state === 'burned').filter((d) => d.cardId !== 0).sort((a, b) => (a.seq as number) - (b.seq as number));
  return (
    <div data-testid="ch-log" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <TopBar start={<button aria-label="رجوع" data-testid="ch-close" onClick={popCh} style={ib}><Icon name="arrow-right" size={20} /></button>} mid="الدفتر" />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px 30px' }}>
        {!rows.length && (
          <div style={{ padding: '40px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <b style={{ fontSize: 18 }}>الدفتر فاضي</b>
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>يمتلي مع كل يوم تسجّله.</span>
          </div>
        )}
        {rows.map((d) => {
          const c = cardOf(d.cardId as number);
          const first = d.state === 'burned' ? `محروقة — ${d.burnReason as string}` : (journalOf(d).worked ?? '').split('\n')[0] || '—';
          return (
            <button key={d.id} data-testid="ch-log-row" onClick={() => pushCh(d.state === 'done' ? { v: 'journal', dayId: d.id } : { v: 'card', dayId: d.id })}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 0', border: 'none', borderBottom: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text)', textAlign: 'right', cursor: 'pointer' }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{`اليوم ${d.seq}${c ? ` · ${c.title}` : ''}`}</span>
              <span style={{ fontSize: 13.5, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{first}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Used by the phone's back gesture / laptop Escape (kit.tsx). */
export const challengeOpen = () => getState().ch.length > 0;
export { view as challengeView };
