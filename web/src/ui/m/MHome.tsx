import { useEffect, useRef, useState } from 'react';
import { countdown, greeting, lastEdit, longDate, shootAt } from '../../../../shared/time';
import { openProject } from '../../app/actions';
import { renameProject } from '../../app/projects';
import { openMenu, setState, useApp } from '../../app/state';
import { Icon } from '../../ds/ds';
import { STAGE_LABEL, STAGE_ORDER } from '../../lib/constants';
import { cover, Progress, projectMenu, upcoming, useSummaries, type Summary } from '../Home';
import { Chips, iconBtn } from './kit';

/** Phone Home (UPDATE-1 ج2, mobile.html screen 1). */
export function MHome() {
  const list = useSummaries();
  const settings = useApp((s) => s.settings);
  const theme = useApp((s) => s.theme);
  const bootOffline = useApp((s) => s.bootOffline);
  const [now, setNow] = useState(() => new Date());
  const [f, setF] = useState<string>('all');
  const [renaming, setRenaming] = useState<string | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const live = (list ?? []).filter((s) => !s.archived);
  const shown = (f === 'all' ? live : f === 'archived' ? (list ?? []).filter((s) => s.archived) : live.filter((s) => s.stage === f)).sort((a, b) => b.updatedAt - a.updatedAt);
  const last = list?.find((s) => s.id === settings?.lastProjectId && !s.archived) ?? null;
  const next = list ? upcoming(list) : null;
  const nArch = (list?.length ?? 0) - live.length;
  return (
    <div data-component="MobileHome" data-testid="m-home" style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <span style={{ fontSize: 14, color: 'var(--color-text-muted)', fontWeight: 600 }}>{greeting(now)}</span>
          <h1 data-testid="greeting" style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 40, lineHeight: 1.1 }}>إبراهيم</h1>
        </div>
        <img src={theme === 'dark' ? '/img/logo-white.png' : '/img/logo-black.png'} alt="إبراهيم الشريدي" style={{ width: 76, height: 46, objectFit: 'cover', mixBlendMode: theme === 'dark' ? 'normal' : 'multiply' }} />
      </header>

      {bootOffline && (
        <div data-testid="m-offline-home" style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 14, background: 'var(--color-surface)', padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <b style={{ fontSize: 17 }}>لا يوجد اتصال بالإنترنت</b>
          <span style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--color-text-muted)' }}>المشاريع تظهر لما يرجع الاتصال. تقدر الآن تكتب فكرة أو تصوّرها بزر ＋، وتنحفظ على جوالك وتُرسل لحالها.</span>
          <button onClick={() => setState({ addSheet: 'idea' })} style={{ alignSelf: 'flex-start', height: 44, padding: '0 18px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#141210', fontSize: 15, fontWeight: 700 }}>＋ فكرة</button>
        </div>
      )}

      {next && <UpcomingMini s={next} now={now} />}
      {last && (
        <button data-testid="continue-card" onClick={() => void openProject(last.id)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, border: '1px solid var(--color-border-subtle)', borderRadius: 14, background: 'var(--color-bg)', boxShadow: 'var(--shadow-card)', textAlign: 'right', color: 'var(--color-text)' }}>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tan-600)' }}>كمّل من حيث وقفت</span>
            <span style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 18, lineHeight: 1.35 }}>{last.name}</span>
            <Progress s={last} h={5} />
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{`${last.shotsShot + last.shotsApproved} من ${last.shots} تصوّرت`}</span>
          </span>
          <span style={{ width: 120, height: 82, borderRadius: 8, background: cover(last), flexShrink: 0 }} />
        </button>
      )}

      {list && (
        <section data-testid="my-projects" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28 }}>مشاريعي</h2>
            <button data-testid="new-project" disabled={bootOffline} onClick={() => setState({ modal: 'newProject' })} style={{ height: 44, padding: '0 6px', border: 'none', background: 'transparent', color: 'var(--color-text-muted)', fontSize: 14, fontWeight: 600 }}>+ مشروع</button>
          </div>
          <Chips testid="pf" value={f} onChange={setF} items={[['all', `الكل ${live.length}`], ...STAGE_ORDER.map((s) => [s, STAGE_LABEL[s]] as [string, string]), ...(nArch ? [['archived', `المؤرشفة ${nArch}`] as [string, string]] : [])]} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {shown.map((s) => <ProjectRow key={s.id} s={s} now={now} renaming={renaming === s.id} onRename={() => setRenaming(s.id)} onRenamed={() => setRenaming(null)} />)}
            {!shown.length && <span style={{ padding: '18px 0', fontSize: 14, color: 'var(--color-text-muted)' }}>{live.length ? 'لا مشاريع بهذه المرحلة.' : 'لا مشاريع بعد — ابدأ بـ «+ مشروع».'}</span>}
          </div>
        </section>
      )}
    </div>
  );
}

function UpcomingMini({ s, now }: { s: Summary; now: Date }) {
  const c = countdown(s.shootDate!, s.shootTime, now);
  const planned = Math.max(0, s.shots - s.shotsShot - s.shotsApproved);
  return (
    <button data-testid="upcoming-card" onClick={() => void openProject(s.id)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 14, border: '1px solid #3a342c', background: 'linear-gradient(90deg,#141210 55%,#2b2117)', color: '#fdfcfa', textAlign: 'right' }}>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#d2a06a' }}>التصوير القادم</span>
        <span style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 18 }}>{s.name}</span>
        <span style={{ fontSize: 12, color: '#b9b9c2' }}>{`${longDate(shootAt(s.shootDate!, s.shootTime), now)} · ${planned} لقطة مخططة`}</span>
      </span>
      <span data-testid="countdown" style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0 }}>
        {c.big.n !== null && <b style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 64, lineHeight: 0.9, color: '#d2a06a' }}>{c.big.n}</b>}
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: c.big.n === null ? 30 : 20, color: c.big.n === null ? '#d2a06a' : undefined }}>{c.big.word}</span>
      </span>
    </button>
  );
}

function ProjectRow({ s, now, renaming, onRename, onRenamed }: { s: Summary; now: Date; renaming: boolean; onRename: () => void; onRenamed: () => void }) {
  const offline = useApp((st) => st.offline);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renaming) setTimeout(() => (ref.current?.focus(), ref.current?.select()), 0);
  }, [renaming]);
  const done = (save: boolean) => {
    const v = ref.current?.value.trim() ?? '';
    if (save && v && v !== s.name) renameProject(v, s.id);
    onRenamed();
  };
  return (
    <div data-testid="project-card" data-project-id={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
      <button onClick={() => !renaming && void openProject(s.id)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, border: 'none', background: 'transparent', padding: 0, textAlign: 'right', color: 'var(--color-text)' }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {renaming ? (
            <input ref={ref} defaultValue={s.name} data-testid="project-card-name-input" onClick={(e) => e.stopPropagation()} onBlur={() => done(true)}
              onKeyDown={(e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); }}
              style={{ font: 'inherit', fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 17, border: '1px solid var(--color-focus-ring)', borderRadius: 4, padding: '6px 8px', background: 'var(--field-bg)', color: 'var(--color-text)', outline: 'none' }} />
          ) : <span data-testid="project-card-name" style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 17, lineHeight: 1.35 }}>{s.name}</span>}
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{[STAGE_LABEL[s.stage], `${s.scenes} مشاهد`, lastEdit(s.updatedAt, now)].filter(Boolean).join(' · ')}</span>
        </span>
        <span style={{ width: 112, height: 72, borderRadius: 8, background: cover(s), flexShrink: 0 }} />
      </button>
      <button aria-label="خيارات المشروع" data-testid="project-dots" disabled={offline} onClick={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        openMenu(r.right, r.bottom, projectMenu(s, onRename), 'project-card-menu');
      }} style={{ ...iconBtn, color: 'var(--color-text-muted)' }}><Icon name="more" size={20} /></button>
    </div>
  );
}
