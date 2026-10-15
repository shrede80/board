import { useEffect, useState } from 'react';
import type { Op } from '../../../shared/schema';
import { commit, openProject } from '../app/actions';
import { uploadFile } from '../app/images';
import { getState, useApp, useEquipment, useProject } from '../app/state';
import { api } from '../data/api';
import { allShots, camLine, coverOf, eqName, moodHex, moveLine, type ShotRef } from '../data/project';
import { Button, EmptyState, Field, Icon, Select, Textarea, Toast } from '../ds/ds';
import { ORDER, STATUS, type Status } from '../lib/constants';
import { frameBg, mmss, pad2, uid } from '../lib/util';

/**
 * Phone UI (SPEC §1.5): shot list + status change + quick capture to «الوارد». No board.
 * Same engine as the laptop, so a status change here reaches the laptop on its next poll.
 */
type Tab = 'list' | 'capture';

function statusVm(s: Status) {
  const S = STATUS[s] ?? STATUS.planned;
  return {
    status: S.label, dot: S.dot, ring: S.ring,
    sBg: s === 'approved' ? 'var(--color-accent)' : s === 'shot' ? 'var(--color-inverse-bg)' : 'transparent',
    sFg: s === 'approved' ? '#141210' : s === 'shot' ? 'var(--color-inverse-text)' : 'var(--color-text)',
    sBorder: s === 'planned' ? 'var(--color-border)' : 'transparent',
  };
}

function cycle(id: string, current: Status) {
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  commit([{ op: 'update', entity: 'shots', id, fields: { status: next } }], { history: 'الحالة' });
}

export function MobileApp() {
  const p = useProject();
  const eq = useEquipment();
  const offline = useApp((s) => s.offline);
  const [tab, setTab] = useState<Tab>('list');
  const [detail, setDetail] = useState<string | null>(null);
  const [group, setGroup] = useState<'scene' | 'location'>('scene');
  const [status, setStatus] = useState<'all' | Status>('all');
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [toastMsg, setToastMsg] = useState('');
  useEffect(() => {
    api<{ id: string; name: string }[]>('/api/projects').then(setProjects).catch(() => {});
  }, [p?.id]);
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(''), 2600);
    return () => clearTimeout(t);
  }, [toastMsg]);
  if (!p) return null;
  const dimOp = offline ? 0.45 : 1;
  const projectOpts = (projects.length ? projects : [{ id: p.id, name: p.name }]).map((x) => ({ value: x.id, label: x.name }));
  const onProject = (e: React.ChangeEvent<HTMLSelectElement>) => void openProject(e.target.value);

  return (
    <div data-component="MobileApp" dir="rtl" style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', color: 'var(--color-text)', paddingTop: 'env(safe-area-inset-top)' }}>
      <div style={{ height: 10, flexShrink: 0 }} />
      {offline && (
        <div data-component="OfflineBanner" data-testid="offline-banner" style={{ margin: '0 12px 6px', padding: '10px 14px', borderRadius: 8, background: 'var(--color-danger)', color: '#fdfcfa', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="x-circle" size={16} />لا يوجد اتصال، التغييرات لن تُحفظ
        </div>
      )}
      {tab === 'list' && !detail && <ShotList p={p} eq={eq} group={group} setGroup={setGroup} status={status} setStatus={setStatus} projectOpts={projectOpts} onProject={onProject} open={setDetail} dimOp={dimOp} offline={offline} />}
      {tab === 'list' && detail && <ShotDetail id={detail} close={() => setDetail(null)} dimOp={dimOp} offline={offline} />}
      {tab === 'capture' && <Capture projectOpts={projectOpts} onProject={onProject} dimOp={dimOp} offline={offline} onSent={setToastMsg} />}
      {toastMsg && (
        <div style={{ position: 'absolute', bottom: 100, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 5 }} data-testid="toast"><Toast tone="success" message={toastMsg} /></div>
      )}
      <nav style={{ height: 84, flexShrink: 0, borderTop: '1px solid var(--color-border-subtle)', display: 'flex', padding: '6px 24px calc(22px + env(safe-area-inset-bottom) / 2)', background: 'var(--color-bg)' }}>
        {([['list', 'film', 'اللقطات'], ['capture', 'camera', 'التقاط']] as const).map(([v, icon, label]) => (
          <button key={v} data-testid={`m-tab-${v}`} onClick={() => (setTab(v), setDetail(null))} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, border: 'none', background: 'transparent', color: tab === v ? 'var(--color-text)' : 'var(--color-text-muted)', fontSize: 12, fontWeight: 700 }}>
            <Icon name={icon} size={22} />{label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function ShotList(props: {
  p: NonNullable<ReturnType<typeof useProject>>; eq: ReturnType<typeof useEquipment>; group: 'scene' | 'location'; setGroup: (g: 'scene' | 'location') => void;
  status: 'all' | Status; setStatus: (s: 'all' | Status) => void; projectOpts: { value: string; label: string }[]; onProject: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  open: (id: string) => void; dimOp: number; offline: boolean;
}) {
  const { p, eq, group, setGroup, status, setStatus, open, dimOp, offline } = props;
  const all = allShots(p);
  const shotCount = all.filter((x) => x.sh.status !== 'planned').length;
  const appr = all.filter((x) => x.sh.status === 'approved').length;
  const vis = all.filter((x) => status === 'all' || x.sh.status === status);
  let groups: { k: string; title: string; mood: string; shots: ShotRef[] }[] = [];
  if (group === 'scene') groups = p.scenes.map((sc, si) => ({ k: sc.id, title: `${pad2(si + 1)} · ${sc.name}`, mood: moodHex(sc.mood), shots: vis.filter((x) => x.sc.id === sc.id) })).filter((g) => g.shots.length);
  else {
    const locs = [...p.library.locations.map((l) => ({ id: l.id as string | null, name: l.name as string })), { id: null, name: 'بلا موقع' }];
    groups = locs.map((l) => ({ k: l.id ?? 'none', title: l.name, mood: 'var(--color-accent)', shots: vis.filter((x) => (x.sc.locationId ?? null) === l.id) })).filter((g) => g.shots.length);
  }
  const chip = (on: boolean) => ({ bg: on ? 'var(--color-inverse-bg)' : 'transparent', fg: on ? 'var(--color-inverse-text)' : 'var(--color-text)' });
  return (
    <div data-component="MobileShotList" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '6px 16px 10px', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid var(--color-border-subtle)' }}>
        <Select options={props.projectOpts} value={p.id} onChange={props.onProject} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ fontWeight: 700 }} data-testid="m-progress">{`${shotCount} من ${all.length} تصوّرت`}</span><span style={{ color: 'var(--color-text-muted)' }}>{`${appr} معتمدة`}</span></div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--color-surface-strong)', overflow: 'hidden' }}><div style={{ height: '100%', width: all.length ? Math.round((shotCount / all.length) * 100) + '%' : '0%', background: 'var(--color-accent)', borderRadius: 3, transition: 'width 200ms' }} /></div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', border: '1px solid var(--color-border)', borderRadius: 999, padding: 3, flexShrink: 0 }}>
            {([['scene', 'حسب المشهد'], ['location', 'حسب الموقع']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setGroup(v)} style={{ height: 32, padding: '0 12px', border: 'none', borderRadius: 999, background: chip(group === v).bg, color: chip(group === v).fg, fontSize: 13, fontWeight: 600 }}>{l}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
            {([['all', 'الكل'], ...ORDER.map((k) => [k, STATUS[k].label])] as [string, string][]).map(([v, l]) => (
              <button key={v} onClick={() => setStatus(v as 'all' | Status)} style={{ height: 32, padding: '0 10px', border: `1px solid ${status === v ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 999, background: status === v ? 'var(--color-accent-soft)' : 'transparent', color: 'var(--color-text)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 20px' }}>
        {groups.map((g) => (
          <div key={g.k}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '16px 4px 8px', position: 'sticky', top: 0, background: 'var(--color-bg)', zIndex: 2 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 4, height: 18, borderRadius: 2, background: g.mood }} /><span style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 16 }}>{g.title}</span></span>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{`${g.shots.length} لقطات`}</span>
            </div>
            {g.shots.map((x) => {
              const sv = statusVm(x.sh.status);
              return (
                <div key={x.sh.id} data-testid="m-shot" data-shot-id={x.sh.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 4px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <button onClick={() => open(x.sh.id)} style={{ flex: 1, minWidth: 0, display: 'flex', gap: 10, alignItems: 'center', border: 'none', background: 'transparent', padding: 0, textAlign: 'right', color: 'var(--color-text)' }}>
                    <span style={{ position: 'relative', width: 92, height: 58, borderRadius: 4, background: frameBg(coverOf(x.sh), moodHex(x.sc.mood)), flexShrink: 0 }}><span style={{ position: 'absolute', top: 4, insetInlineEnd: 6, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 16, color: '#fdfcfa', textShadow: '0 1px 5px rgba(0,0,0,.6)' }}>{x.num}</span></span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.sh.description || 'بدون وصف'}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[camLine(eq, x.sh), moveLine(eq, x.sh)].filter(Boolean).join(' · ')}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{`${x.sh.size ?? ''} · ${mmss(x.sh.durationS)}`}</span>
                    </span>
                  </button>
                  <button title="تغيير الحالة" data-testid="m-status" data-status={x.sh.status} disabled={offline} onClick={() => cycle(x.sh.id, x.sh.status)} style={{ width: 84, height: 48, flexShrink: 0, borderRadius: 999, border: `1.5px solid ${sv.sBorder}`, background: sv.sBg, color: sv.sFg, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: dimOp }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: sv.dot, border: `1.5px solid ${sv.ring}` }} />{sv.status}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
        {!groups.length && <EmptyState icon="search" title={all.length ? 'لا لقطات بهذه الحالة' : 'لا لقطات بعد'} description={all.length ? 'غيّر الفلتر لعرض لقطات أخرى.' : 'أضف المشاهد واللقطات من اللابتوب.'} />}
      </div>
    </div>
  );
}

function ShotDetail({ id, close, dimOp, offline }: { id: string; close: () => void; dimOp: number; offline: boolean }) {
  const p = useProject();
  const eq = useEquipment();
  if (!p) return null;
  const x = allShots(p).find((y) => y.sh.id === id);
  if (!x) return null;
  const loc = p.library.locations.find((l) => l.id === x.sc.locationId);
  const sv = statusVm(x.sh.status);
  const hex = moodHex(x.sc.mood);
  const imgs = x.sh.images.filter((i) => !i.uploading);
  const rows = ([
    ['camera', 'الكاميرا والعدسة', camLine(eq, x.sh)], ['repeat', 'الحركة', moveLine(eq, x.sh)], ['aperture', 'الحجم والزاوية', `${x.sh.size ?? ''} · ${x.sh.angle ?? ''}`],
    ['clock', 'المدة', mmss(x.sh.durationS)], ['map-pin', 'الموقع', loc ? (loc.name as string) : '—'],
    ['sun', 'الإضاءة', [(x.sh.lightingIds ?? []).map((i) => eqName(eq, i)).join('، '), x.sh.lightingMood].filter(Boolean).join(' — ')],
    ['mic', 'الصوت', [(x.sh.audioIds ?? []).map((i) => eqName(eq, i)).join('، '), x.sh.audioNotes].filter(Boolean).join(' — ')],
    ['message-circle', 'الحوار', x.sh.dialogue as string],
  ] as [string, string, string][]).filter((r) => r[2]);
  return (
    <div data-component="MobileShotDetail" data-testid="m-detail" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px 10px' }}>
        <button onClick={close} aria-label="رجوع" style={{ width: 44, height: 44, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text)' }}><Icon name="arrow-right" size={20} /></button>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 600 }}>{`المشهد ${pad2(x.si + 1)} · ${x.sc.name}`}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollSnapType: 'x mandatory', padding: '0 16px' }}>
        {(imgs.length ? imgs : [null]).map((im, i) => <div key={i} style={{ flex: '0 0 100%', aspectRatio: p.aspect === '2.39:1' ? '2.39 / 1' : p.aspect.replace(':', ' / '), borderRadius: 8, background: frameBg(im, hex, true), scrollSnapAlign: 'center' }} />)}
      </div>
      <div style={{ padding: '14px 18px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 40, lineHeight: 1 }}>{x.num}</span><span style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 18, lineHeight: 1.4 }}>{x.sh.description || 'بدون وصف'}</span></div>
        <button data-testid="m-detail-status" disabled={offline} onClick={() => cycle(x.sh.id, x.sh.status)} style={{ height: 52, borderRadius: 999, border: `1.5px solid ${sv.sBorder}`, background: sv.sBg, color: sv.sFg, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: dimOp }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: sv.dot, border: `1.5px solid ${sv.ring}` }} />{`${sv.status} — اضغط للتالي`}
        </button>
        {rows.map(([icon, k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingBottom: 12, borderBottom: '1px solid var(--color-border-subtle)' }}>
            <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--color-surface-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--ink-700)' }}><Icon name={icon} size={15} /></span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{k}</span><span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.6 }}>{v}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Capture({ projectOpts, onProject, dimOp, offline, onSent }: { projectOpts: { value: string; label: string }[]; onProject: (e: React.ChangeEvent<HTMLSelectElement>) => void; dimOp: number; offline: boolean; onSent: (m: string) => void }) {
  const p = useProject();
  const [note, setNote] = useState('');
  const [scene, setScene] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ k: string; text: string; bg: string }[]>([]);
  useEffect(() => setScene(''), [p?.id]);
  if (!p) return null;
  const send = (items: { imageId: string | null; text: string; localUrl?: string }[]) => {
    const pid = getState().projectId!;
    const ops: Op[] = items.map((it) => ({
      op: 'create', entity: 'inboxItems', id: uid('in'),
      fields: { projectId: pid, kind: it.imageId ? 'image' : 'note', imageId: it.imageId, text: it.text, sceneId: scene || null, isNew: true },
    }));
    if (!commit(ops, { history: false })) return;
    setSent((s) => [...items.map((it) => ({ k: uid('s'), text: it.text, bg: it.localUrl ? `center / cover no-repeat url("${it.localUrl}")` : 'var(--color-surface-strong)' })), ...s].slice(0, 4));
    setNote('');
    onSent('وصل إلى الوارد');
  };
  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      const text = note.trim() || 'صورة من الجوال';
      const items = [];
      for (const f of files) items.push({ imageId: await uploadFile(f), text, localUrl: URL.createObjectURL(f) });
      send(items);
    } catch {
      onSent('فشل رفع الصورة — أعد المحاولة');
    } finally {
      setBusy(false);
    }
  };
  const cantSend = offline || !note.trim();
  return (
    <div data-component="MobileCapture" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 18px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 30 }}>التقاط سريع</h1>
      <label style={{ height: 190, borderRadius: 14, background: '#141210', color: '#fdfcfa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, cursor: 'pointer', opacity: offline || busy ? 0.45 : dimOp }}>
        <span style={{ width: 84, height: 84, borderRadius: '50%', background: '#d2a06a', color: '#141210', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 6px rgba(210,160,106,.25)' }}><Icon name="camera" size={36} /></span>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{busy ? 'يرفع…' : 'التقط صورة'}</span>
        <input type="file" accept="image/*" capture="environment" disabled={offline || busy} onChange={(e) => void onPhoto(e)} style={{ display: 'none' }} data-testid="m-camera" />
      </label>
      <label style={{ height: 52, border: '1px solid var(--color-border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: offline || busy ? 0.45 : dimOp }}>
        <Icon name="image" size={18} />رفع من الألبوم
        <input type="file" accept="image/*" multiple disabled={offline || busy} onChange={(e) => void onPhoto(e)} style={{ display: 'none' }} data-testid="m-album" />
      </label>
      <Field label="ملاحظة نصية"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} disabled={offline} placeholder="فكرة لقطة، ملاحظة عن الموقع…" data-testid="m-note" /></Field>
      <Field label="المشروع"><Select options={projectOpts} value={p.id} onChange={onProject} /></Field>
      <Field label="ربط بمشهد (اختياري)"><Select options={[{ value: '', label: 'بدون ربط' }, ...p.scenes.map((s, i) => ({ value: s.id, label: `${pad2(i + 1)} · ${s.name}` }))]} value={scene} onChange={(e) => setScene(e.target.value)} /></Field>
      <Button variant="primary" size="lg" icon="send" onClick={() => !cantSend && send([{ imageId: null, text: note.trim() }])} disabled={cantSend} style={{ width: '100%' }} data-testid="m-send">أرسل إلى الوارد</Button>
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.6 }}>كل ما تلتقطه يصل إلى «الوارد» في مكتبة اللابتوب.</span>
      {sent.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>أُرسل مؤخراً</span>
          {sent.map((s) => <div key={s.k} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 8, border: '1px solid var(--color-border-subtle)', borderRadius: 8 }}><span style={{ width: 44, height: 44, borderRadius: 4, background: s.bg, flexShrink: 0 }} /><span style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>{s.text}</span><Icon name="check" size={16} /></div>)}
        </div>
      )}
    </div>
  );
}

/** Phones (and narrow windows) get the mobile UI. */
export function useIsMobile() {
  const q = '(max-width: 760px)';
  const [m, setM] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return m;
}

