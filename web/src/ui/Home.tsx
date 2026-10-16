import { ChallengeHomeCard } from './Challenge';
import { useEffect, useRef, useState } from 'react';
import { countdown, greeting, isoDay, lastEdit, longDate, shootAt } from '../../../shared/time';
import { openProject, setMode } from '../app/actions';
import { ideaProject, liveIdeas } from '../app/ideas';
import { archiveProject, askDuplicate, deleteProject, openWith, renameProject } from '../app/projects';
import { engine, openMenu, setState, useApp, type MenuEntry } from '../app/state';
import { api } from '../data/api';
import { moodHex } from '../data/project';
import { Button, Icon } from '../ds/ds';
import { STAGE_LABEL, STAGE_ORDER } from '../lib/constants';
import { frameBg, mmss, type Img } from '../lib/util';
import { IdeaCard, IdeaQuickAdd } from './Ideas';

/**
 * «الرئيسية» on the laptop (UPDATE-1 ب1, home.html): greeting, «كمّل من حيث وقفت», «التصوير
 * القادم», «مشاريعي» with filters and a ⋯ menu per project, and the ideas box.
 */

export interface Summary {
  id: string; name: string; aspect: string; updatedAt: number; scenes: number; shots: number; durationS: number;
  coverImageId: string | null; coverPlaceholder: Img['placeholder']; coverMood: string | null; locations: number;
  client: string; shootDate: string | null; shootTime: string | null; stage: string; archived: boolean; shotsShot: number; shotsApproved: number;
}

/** Project summaries (counts from the server) with the latest local edits of each project row on top. */
export function useSummaries(): Summary[] | null {
  const dv = useApp((s) => s.dataVersion);
  const [list, setList] = useState<Summary[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => api<Summary[]>('/api/projects').then(setList).catch(() => {}), list ? 600 : 0);
    return () => clearTimeout(t);
  }, [dv]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list) return null;
  return list
    .map((s) => {
      const r = engine.store.projects.get(s.id);
      if (!r) return s;
      if (r.deletedAt) return null;
      return { ...s, name: r.name as string, client: (r.client as string) ?? '', stage: (r.stage as string) ?? 'prep', archived: !!r.archived, shootDate: (r.shootDate as string) ?? null, shootTime: (r.shootTime as string) ?? null, aspect: r.aspect as string, updatedAt: Math.max(s.updatedAt, r.updatedAt) };
    })
    .filter((s): s is Summary => !!s);
}

export const cover = (s: Summary) => frameBg(s.coverImageId ? { imageId: s.coverImageId, placeholder: s.coverPlaceholder } : null, moodHex(s.coverMood));

/** Thin progress bar: approved (accent) then shot (ink). */
export function Progress({ s, h = 6 }: { s: Summary; h?: number }) {
  const t = Math.max(1, s.shots);
  return (
    <div style={{ height: h, borderRadius: h / 2, background: 'var(--color-surface-strong)', overflow: 'hidden', display: 'flex' }}>
      <i style={{ display: 'block', height: '100%', width: `${(100 * s.shotsApproved) / t}%`, background: 'var(--color-accent)' }} />
      <i style={{ display: 'block', height: '100%', width: `${(100 * s.shotsShot) / t}%`, background: 'var(--color-text)' }} />
    </div>
  );
}

const today = () => isoDay(new Date());
export const upcoming = (list: Summary[]) =>
  list.filter((s) => !s.archived && s.stage !== 'done' && s.shootDate && s.shootDate >= today())
    .sort((a, b) => shootAt(a.shootDate!, a.shootTime).getTime() - shootAt(b.shootDate!, b.shootTime).getTime())[0] ?? null;

export function projectMenu(s: Summary, startRename: () => void): MenuEntry[] {
  return [
    { label: 'فتح', icon: 'arrow-left', run: () => void openProject(s.id), testid: 'hm-open' },
    { label: 'إعادة التسمية', icon: 'edit', keys: 'F2', run: startRename, testid: 'hm-rename' },
    { label: 'إعدادات المشروع…', icon: 'settings', run: () => void openWith(s.id, 'projectSettings'), testid: 'hm-settings' },
    { label: 'تكرار المشروع', icon: 'repeat', run: () => askDuplicate(s.id, s.name), testid: 'hm-duplicate' },
    { label: 'تصدير نسخة ‎.zip', icon: 'download', run: () => void openWith(s.id, 'export'), testid: 'hm-export' },
    { label: s.archived ? 'إلغاء الأرشفة' : 'أرشفة', icon: 'folder', run: () => archiveProject(!s.archived, s.id), testid: 'hm-archive' },
    'sep',
    { label: 'حذف', icon: 'trash', danger: true, run: () => deleteProject(s.id, s.name), testid: 'hm-delete' },
  ];
}

export function HomeScreen() {
  const list = useSummaries();
  const settings = useApp((s) => s.settings);
  useApp((s) => s.dataVersion);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000); // the countdown moves every minute
    return () => clearInterval(t);
  }, []);
  const quickRef = useRef<HTMLTextAreaElement>(null);
  const ideas = liveIdeas();
  const nNew = ideas.filter((i) => i.isNew).length;
  if (!list) return <div style={{ flex: 1 }} />;
  const active = list.filter((s) => !s.archived && s.stage !== 'done').length;
  const last = list.find((s) => s.id === settings?.lastProjectId && !s.archived) ?? null;
  const next = upcoming(list);
  const first = !list.length;
  return (
    <div data-component="HomeScreen" data-testid="home" style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '30px 40px 48px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <section style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 data-testid="greeting" style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 44, lineHeight: 1.1 }}>{`${greeting(now)} يا إبراهيم`}</h1>
            <p style={{ margin: '8px 0 0', fontSize: 15, color: 'var(--color-text-muted)' }}>
              {[longDate(now, now), `${active} ${active === 1 ? 'مشروع نشط' : active === 2 ? 'مشروعان نشطان' : 'مشاريع نشطة'}`, nNew ? `${nNew} ${nNew === 1 ? 'فكرة جديدة تنتظرك' : 'أفكار جديدة تنتظرك'}` : ''].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="outline" icon="upload" onClick={() => setState({ modal: 'import' })} data-testid="home-import">استيراد مشروع</Button>
            <Button variant="outline" icon="sparkles" onClick={() => quickRef.current?.focus()} data-testid="home-quick-idea">فكرة سريعة</Button>
            <Button variant="primary" icon="plus" onClick={() => setState({ modal: 'newProject' })} data-testid="new-project">مشروع جديد</Button>
          </div>
        </section>

        <ChallengeHomeCard laptop />

        {first && (
          <section data-testid="home-welcome" style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 14, background: 'var(--color-surface)', padding: '48px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
            <span style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tan-600)' }}><Icon name="film" size={28} /></span>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 30 }}>ابدأ مشروعك</h2>
            <p style={{ margin: 0, fontSize: 15, color: 'var(--color-text-muted)', lineHeight: 1.7 }}>من قالب أو فارغ، أو استورد نسخة.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="primary" icon="plus" onClick={() => setState({ modal: 'newProject' })} data-testid="home-first">ابدأ أول مشروع</Button>
              <Button variant="outline" icon="upload" onClick={() => setState({ modal: 'import' })}>استيراد</Button>
            </div>
          </section>
        )}

        {(last || next) && (
          <section style={{ display: 'grid', gridTemplateColumns: last && next ? '2fr 1fr' : '1fr', gap: 20 }}>
            {last && <ContinueCard s={last} now={now} />}
            {next && <UpcomingCard s={next} now={now} />}
          </section>
        )}

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: 28, alignItems: 'start' }}>
          {!first ? <MyProjects list={list} now={now} /> : <div />}
          <aside data-component="IdeasBox" data-testid="ideas-box" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 24 }}>صندوق الأفكار</h3>
              {nNew > 0 && <span data-testid="ideas-new-count" style={{ height: 24, padding: '0 10px', borderRadius: 999, background: 'var(--color-accent)', color: '#141210', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>{`${nNew} جديدة`}</span>}
              <button data-testid="ideas-all" onClick={() => setState({ screen: 'ideas' })} style={{ marginInlineStart: 'auto', border: 'none', background: 'transparent', color: 'var(--color-text-muted)', fontSize: 13, cursor: 'pointer' }}>الكل ›</button>
            </div>
            <IdeaQuickAdd inputRef={quickRef} />
            {ideas.slice(0, 8).map((i) => <IdeaCard key={i.id} idea={i} />)}
            {!ideas.length && <span style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.7 }}>أي فكرة: لقطة، مرجع، رابط.</span>}
            {ideas.length > 8 && <button onClick={() => setState({ screen: 'ideas' })} style={{ border: 'none', background: 'transparent', color: 'var(--tan-600)', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>{`عرض كل الأفكار (${ideas.length})`}</button>}
          </aside>
        </section>
      </div>
    </div>
  );
}

function ContinueCard({ s, now }: { s: Summary; now: Date }) {
  const open = (mode: 'board' | 'storyboard') => () => void openProject(s.id).then(() => setMode(mode));
  return (
    <div data-testid="continue-card" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,400px) 1fr', background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: 14, boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
      <div style={{ minHeight: 236, background: cover(s), position: 'relative' }}>
        <span style={{ position: 'absolute', top: 14, insetInlineStart: 14, height: 24, padding: '0 10px', borderRadius: 999, background: 'rgba(20,18,16,.62)', color: '#fdfcfa', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>آخر مشروع فتحته</span>
      </div>
      <div style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tan-600)' }}>كمّل من حيث وقفت</span>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 26, lineHeight: 1.3 }}>{s.name}</h2>
        <div style={{ display: 'flex', gap: 14, fontSize: 13, color: 'var(--color-text-muted)', alignItems: 'center', flexWrap: 'wrap' }}>
          {s.client && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="user" size={14} />{s.client}</span>}
          <StageBadge stage={s.stage} />
          <span>{`آخر تعديل ${lastEdit(s.updatedAt, now)}`}</span>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 13, color: 'var(--color-text-muted)', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="film" size={14} />{`${s.scenes} مشاهد · ${s.shots} لقطة`}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="clock" size={14} />{mmss(s.durationS)}</span>
          <span>{s.aspect}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><b>{`${s.shotsShot + s.shotsApproved} من ${s.shots} تصوّرت`}</b><span style={{ color: 'var(--color-text-muted)' }}>{`${s.shotsApproved} معتمدة`}</span></div>
          <Progress s={s} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <Button variant="primary" size="sm" onClick={open('board')} data-testid="continue-board">فتح لوحة الأفكار</Button>
          <Button variant="outline" size="sm" onClick={open('storyboard')} data-testid="continue-storyboard">الستوري بورد</Button>
        </div>
      </div>
    </div>
  );
}

/** «التصوير القادم»: the signature moment of Home — a big tan number on ink. */
function UpcomingCard({ s, now }: { s: Summary; now: Date }) {
  const c = countdown(s.shootDate!, s.shootTime, now);
  const planned = Math.max(0, s.shots - s.shotsShot - s.shotsApproved);
  return (
    <div data-testid="upcoming-card" style={{ background: '#141210', color: '#fdfcfa', border: '1px solid #3a342c', borderRadius: 14, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', insetInlineStart: 'auto', insetInlineEnd: -60, bottom: -90, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle,rgba(210,160,106,.45),transparent 65%)', pointerEvents: 'none' }} />
      <span style={{ fontSize: 13, fontWeight: 700, color: '#d2a06a' }}>التصوير القادم</span>
      <span style={{ fontFamily: 'var(--font-serif-text)', fontSize: 19, fontWeight: 700 }}>{s.name}</span>
      <div data-testid="countdown" style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        {c.big.n !== null && <b style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 84, lineHeight: 0.95, color: '#d2a06a' }}>{c.big.n}</b>}
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: c.big.n === null ? 900 : 700, fontSize: c.big.n === null ? 64 : 28, color: c.big.n === null ? '#d2a06a' : undefined, lineHeight: 1 }}>{c.big.word}</span>
      </div>
      <div style={{ display: 'flex', gap: 18, fontSize: 13, color: '#b9b9c2', flexWrap: 'wrap', alignItems: 'baseline' }}>
        {c.units.map((u) => <span key={u.word}><b style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: '#fdfcfa', marginInlineEnd: 4 }}>{u.n}</b>{u.word}</span>)}
        <span>{`· ${longDate(shootAt(s.shootDate!, s.shootTime), now)}${s.shootTime ? ` · ${s.shootTime}` : ''}`}</span>
      </div>
      <span style={{ fontSize: 13, color: '#b9b9c2' }}>{`${planned} لقطة مخططة · ${s.locations} ${s.locations === 1 ? 'موقع' : 'مواقع'}`}</span>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, position: 'relative' }}>
        <button data-testid="upcoming-shots" onClick={() => void openProject(s.id).then(() => setMode('storyboard'))} style={{ height: 32, padding: '0 12px', borderRadius: 4, border: 'none', background: '#d2a06a', color: '#141210', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>قائمة اللقطات</button>
        <button onClick={() => void openProject(s.id)} style={{ height: 32, padding: '0 12px', borderRadius: 4, border: '1px solid #3a342c', background: 'transparent', color: '#fdfcfa', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>فتح المشروع</button>
      </div>
    </div>
  );
}

export function StageBadge({ stage, glass }: { stage: string; glass?: boolean }) {
  return (
    <span data-testid="stage-badge" style={{ height: 24, padding: '0 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', ...(glass ? { background: 'rgba(20,18,16,.62)', color: '#fdfcfa' } : { background: 'var(--color-accent-soft)', color: 'var(--tan-600)' }) }}>{STAGE_LABEL[stage] ?? ''}</span>
  );
}

type Sort = 'updated' | 'name' | 'shoot';
const SORT_LABEL: Record<Sort, string> = { updated: 'آخر تعديل', name: 'الاسم', shoot: 'يوم التصوير' };

function MyProjects({ list, now }: { list: Summary[]; now: Date }) {
  const [f, setF] = useState<'all' | 'archived' | string>('all');
  const [sort, setSort] = useState<Sort>('updated');
  const [renaming, setRenaming] = useState<string | null>(null);
  const live = list.filter((s) => !s.archived);
  const shown = (f === 'archived' ? list.filter((s) => s.archived) : f === 'all' ? live : live.filter((s) => s.stage === f)).sort((a, b) =>
    sort === 'name' ? a.name.localeCompare(b.name, 'ar') : sort === 'shoot' ? (a.shootDate ?? '9999').localeCompare(b.shootDate ?? '9999') : b.updatedAt - a.updatedAt);
  const nArch = list.length - live.length;
  const chip = (v: string, label: string, muted = false) => (
    <button key={v} onClick={() => setF(v)} data-testid={`pf-${v}`} style={{ height: 32, padding: '0 12px', borderRadius: 999, border: `1px solid ${f === v ? 'transparent' : 'var(--color-border)'}`, background: f === v ? 'var(--color-inverse-bg)' : 'transparent', color: f === v ? 'var(--color-inverse-text)' : muted ? 'var(--color-text-muted)' : 'var(--color-text)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>
  );
  return (
    <div data-testid="my-projects">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26 }}>مشاريعي</h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {chip('all', `الكل ${live.length}`)}
          {STAGE_ORDER.map((st) => chip(st, STAGE_LABEL[st]))}
          {nArch > 0 && chip('archived', `المؤرشفة ${nArch}`, true)}
        </div>
        <button data-testid="sort" onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          openMenu(r.right, r.bottom + 4, (['updated', 'name', 'shoot'] as Sort[]).map((k) => ({ label: SORT_LABEL[k], icon: sort === k ? 'check' : undefined, run: () => setSort(k) })));
        }} style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', fontSize: 13, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
          ترتيب: <b style={{ color: 'var(--color-text)' }}>{SORT_LABEL[sort]}</b><Icon name="chevron-down" size={14} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
        {shown.map((s) => <ProjectCard key={s.id} s={s} now={now} renaming={renaming === s.id} onRename={() => setRenaming(s.id)} onRenamed={() => setRenaming(null)} />)}
        {f !== 'archived' && (
          <button data-testid="new-project-card" onClick={() => setState({ modal: 'newProject' })} style={{ minHeight: 250, border: '1.5px dashed var(--color-border)', borderRadius: 14, background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--color-text-muted)', fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>
            <span style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--color-surface-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text)' }}><Icon name="plus" size={22} /></span>
            مشروع جديد<span style={{ fontSize: 12, fontWeight: 400 }}>من قالب أو فارغ</span>
          </button>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ s, now, renaming, onRename, onRenamed }: { s: Summary; now: Date; renaming: boolean; onRename: () => void; onRenamed: () => void }) {
  const offline = useApp((st) => st.offline);
  const future = !s.archived && s.stage !== 'done' && s.shootDate && s.shootDate >= isoDay(now);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renaming) setTimeout(() => (ref.current?.focus(), ref.current?.select()), 0);
  }, [renaming]);
  const nIdeas = liveIdeas().filter((i) => ideaProject(i) === s.id).length;
  return (
    <div data-testid="project-card" data-project-id={s.id} onClick={() => !renaming && void openProject(s.id)}
      style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: 14, boxShadow: 'var(--shadow-card)', overflow: 'hidden', cursor: 'pointer' }}>
      <div style={{ height: 138, background: cover(s), position: 'relative' }}>
        <div style={{ position: 'absolute', top: 10, insetInlineStart: 10, insetInlineEnd: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <StageBadge stage={s.stage} glass />
          <button title="خيارات" data-testid="project-dots" disabled={offline} onClick={(e) => {
            e.stopPropagation();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            openMenu(r.right, r.bottom + 4, projectMenu(s, onRename), 'project-card-menu');
          }} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(20,18,16,.55)', color: '#fdfcfa', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="more" size={16} /></button>
        </div>
      </div>
      <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {renaming ? (
          <input ref={ref} defaultValue={s.name} data-testid="project-card-name-input" onClick={(e) => e.stopPropagation()}
            onBlur={(e) => (renameProject(e.currentTarget.value, s.id), onRenamed())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
              if (e.key === 'Escape') (e.stopPropagation(), (e.currentTarget.value = s.name), onRenamed());
            }}
            style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 16, padding: '2px 6px', border: '1px solid var(--color-accent)', borderRadius: 6, background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none' }} />
        ) : <span data-testid="project-card-name" style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 17, lineHeight: 1.35 }}>{s.name}</span>}
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{[s.client || 'بدون عميل', `${s.scenes} ${s.scenes === 1 ? 'مشهد' : 'مشاهد'}`, mmss(s.durationS), s.aspect].join(' · ')}</span>
        <div style={{ marginTop: 4 }}><Progress s={s} h={4} /></div>
        <span style={{ fontSize: 12, fontWeight: future ? 700 : 400, color: future ? 'var(--tan-600)' : 'var(--color-text-muted)' }}>
          {future ? `التصوير ${countdown(s.shootDate!, null, now).phrase}` : `آخر تعديل ${lastEdit(s.updatedAt, now)}`}
          {nIdeas > 0 && <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>{` · ${nIdeas} ${nIdeas === 1 ? 'فكرة' : 'أفكار'}`}</span>}
        </span>
      </div>
    </div>
  );
}
