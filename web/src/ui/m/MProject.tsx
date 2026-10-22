import { useFields } from '../Fields';
import { openPlan } from '../../app/plan';
import { useEffect, useRef, useState } from 'react';
import { addScene, addShot, commit, createFromTemplate, deleteScene, moveScene, moveShot, openEditor, openProject, undo } from '../../app/actions';
import { duplicateSelection, libMenu, shotMenu } from '../../app/boardActions';
import { openPresent } from '../../app/present';
import { archiveProject, askDuplicate, deleteProject, renameProject } from '../../app/projects';
import { openMenu, setState, toast, useApp, useEquipment, useProject, type MenuEntry } from '../../app/state';
import { allShots, camLine, coverOf, moodHex, moveLine, sceneDur, type PLib, type PProject, type PScene, type ShotRef } from '../../data/project';
import { EmptyState, Icon, Tabs } from '../../ds/ds';
import { ORDER, STATUS, type Status } from '../../lib/constants';
import { frameBg, mmss, pad2 } from '../../lib/util';
import { useSummaries } from '../Home';
import { avatar } from '../Library';
import { UndoIcon } from '../TopBar';
import { Chips, iconBtn } from './kit';

/** Phone project (UPDATE-1 ج3, mobile.html screen 2): scenes | shots | library, full control. */

const at = (e: React.MouseEvent) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: r.right, y: r.bottom + 4 };
};

export function MProject() {
  const p = useProject();
  const tab = useApp((s) => s.mTab);
  const offline = useApp((s) => s.offline);
  const canUndo = useApp((s) => s.canUndo);
  const bootOffline = useApp((s) => s.bootOffline);
  const list = useSummaries();
  const [renaming, setRenaming] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renaming) setTimeout(() => (ref.current?.focus(), ref.current?.select()), 0);
  }, [renaming]);
  if (bootOffline || !p) {
    return <EmptyState icon="x-circle" title={bootOffline ? 'المشروع يحتاج اتصال' : 'لا مشروع مفتوح'} description={bootOffline ? 'يفتح مع الاتصال. الأفكار من ＋.' : 'افتح مشروعاً من الرئيسية.'} />;
  }
  const all = allShots(p);
  const done = all.filter((x) => x.sh.status !== 'planned').length;
  const total = p.scenes.reduce((a, s) => a + sceneDur(s), 0);
  const switchMenu: MenuEntry[] = [
    ...(list ?? []).filter((s) => !s.archived).map((s) => ({ label: s.name, icon: s.id === p.id ? 'check' : 'folder', disabled: s.id === p.id, run: () => void openProject(s.id), testid: 'm-switch-project' })),
    'sep',
    { label: 'إعدادات المشروع…', icon: 'settings', run: () => setState({ modal: 'projectSettings' }), testid: 'pm-settings' },
  ];
  const moreMenu: MenuEntry[] = [
    { label: 'إعادة التسمية', icon: 'edit', run: () => setRenaming(true), testid: 'pm-rename' },
    { label: 'إعدادات المشروع…', icon: 'settings', run: () => setState({ modal: 'projectSettings' }), testid: 'pm-settings' },
    { label: 'تكرار المشروع', icon: 'repeat', run: () => askDuplicate(p.id, p.name), testid: 'pm-duplicate' },
    { label: 'عرض المشروع', icon: 'play', run: () => openPresent(0), testid: 'pm-present' },
    { label: p.archived ? 'إلغاء الأرشفة' : 'أرشفة', icon: 'folder', run: () => archiveProject(!p.archived), testid: 'pm-archive' },
    'sep',
    { label: 'حذف', icon: 'trash', danger: true, run: () => deleteProject(p.id, p.name), testid: 'pm-delete' },
  ];
  const finish = (save: boolean) => {
    const v = ref.current?.value.trim() ?? '';
    if (save && v && v !== p.name) renameProject(v);
    setRenaming(false);
  };
  return (
    <div data-component="MobileProject" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 10px 6px 6px' }}>
        {renaming ? (
          <input ref={ref} defaultValue={p.name} data-testid="project-name-input" onBlur={() => finish(true)} onKeyDown={(e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); }}
            style={{ flex: 1, minWidth: 0, height: 44, font: 'inherit', fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 19, border: '1px solid var(--color-focus-ring)', borderRadius: 6, padding: '0 10px', background: 'var(--field-bg)', color: 'var(--color-text)', outline: 'none' }} />
        ) : (
          <button data-testid="project-menu" onClick={(e) => openMenu(at(e).x, at(e).y, switchMenu, 'project-menu-list')} style={{ flex: 1, minWidth: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', color: 'var(--color-text)', padding: '0 6px', textAlign: 'right' }}>
            <span data-testid="project-name" style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 20, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
            <Icon name="chevron-down" size={16} />
          </button>
        )}
        <button aria-label="تراجع" data-testid="m-undo" disabled={!canUndo || offline} onClick={() => void undo()} style={{ ...iconBtn, opacity: canUndo ? 1 : 0.35 }}><UndoIcon /></button>
        <button aria-label="خيارات المشروع" data-testid="m-project-more" disabled={offline} onClick={(e) => openMenu(at(e).x, at(e).y, moreMenu, 'project-more')} style={iconBtn}><Icon name="more" size={20} /></button>
      </header>
      <div style={{ padding: '0 14px 8px' }}>
        <Tabs items={[{ value: 'scenes', label: 'المشاهد' }, { value: 'shots', label: 'اللقطات' }, { value: 'library', label: 'المكتبة' }]} value={tab} onChange={(v) => setState({ mTab: v as 'scenes' | 'shots' | 'library' })} style={{ width: '100%' }} />
      </div>
      {tab === 'scenes' && (
        <div data-testid="m-scenes" style={{ flex: 1, overflowY: 'auto', padding: '0 14px 28px', overscrollBehavior: 'contain' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--color-text-muted)', padding: '6px 2px 4px' }}>
            <span><b style={{ color: 'var(--color-text)' }}>{`${p.scenes.length} مشاهد · ${all.length} لقطة`}</b>{` · ${mmss(total)}`}</span>
            <span>{`${done} تصوّرت`}</span>
          </div>
          {p.scenes.map((sc, si) => <SceneBlock key={sc.id} p={p} sc={sc} si={si} />)}
          <button data-testid="m-add-scene" disabled={offline} onClick={() => addScene({ open: true })} style={{ width: '100%', height: 52, marginTop: 14, border: '1.5px dashed var(--color-border)', borderRadius: 10, background: 'transparent', color: 'var(--color-text)', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="plus" size={17} />مشهد جديد
          </button>
        </div>
      )}
      {tab === 'shots' && <ShotList p={p} />}
      {tab === 'library' && <LibraryTab p={p} />}
    </div>
  );
}

// ---------- scenes ----------

function sceneMenu(p: PProject, sc: PScene, si: number): MenuEntry[] {
  const n = p.scenes.length;
  const move = (to: number, label: string) => () => {
    moveScene(sc.id, to);
    toast(label, { undo: true });
  };
  return [
    { label: 'تعديل المشهد', icon: 'edit', run: () => openEditor('scene', sc.id), testid: 'm-open' },
    { label: 'لقطة جديدة', icon: 'plus', run: () => addShot(sc.id), testid: 'm-add-shot' },
    { label: 'المخطط', icon: 'grid', run: () => openPlan(sc.id), testid: 'm-plan' },
    { label: 'تكرار المشهد', icon: 'repeat', run: () => duplicateSelection([sc.id]), testid: 'm-duplicate' },
    { label: 'نقل لأعلى', icon: 'chevron-up', disabled: si === 0, run: move(si - 1, `انتقل المشهد إلى ${pad2(si)}`), testid: 'm-up' },
    { label: 'نقل لأسفل', icon: 'chevron-down', disabled: si === n - 1, run: move(si + 2, `انتقل المشهد إلى ${pad2(si + 2)}`), testid: 'm-down' },
    'sep',
    { label: 'حذف المشهد', icon: 'trash', danger: true, run: () => deleteScene(sc.id), testid: 'm-delete' },
  ];
}

function SceneBlock({ p, sc, si }: { p: PProject; sc: PScene; si: number }) {
  const offline = useApp((s) => s.offline);
  return (
    <section data-testid="m-scene" data-scene-id={sc.id} style={{ paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button data-testid="m-scene-head" onClick={() => openEditor('scene', sc.id)} style={{ flex: 1, minWidth: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', padding: 0, color: 'var(--color-text)', textAlign: 'right' }}>
          <span style={{ width: 4, height: 22, borderRadius: 2, background: moodHex(sc.mood), flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 18, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{`${pad2(si + 1)} · ${sc.name}`}</span>
        </button>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{`${sc.shots.length} لقطة · ${mmss(sceneDur(sc))}`}</span>
        <button aria-label="خيارات المشهد" data-testid="m-scene-dots" disabled={offline} onClick={(e) => openMenu(at(e).x, at(e).y, sceneMenu(p, sc, si), 'scene-menu')} style={{ ...iconBtn, color: 'var(--color-text-muted)' }}><Icon name="more" size={19} /></button>
      </div>
      <ShotStrip p={p} sc={sc} si={si} />
    </section>
  );
}

/** On photos: hollow white = planned, white = shot, tan = approved. */
const statusDot = (s: Status) => (
  <span data-testid="m-strip-status" style={{ position: 'absolute', bottom: 6, insetInlineEnd: 6, width: 12, height: 12, borderRadius: '50%', boxSizing: 'border-box', border: '2px solid #fdfcfa', background: s === 'approved' ? 'var(--color-accent)' : s === 'shot' ? '#fdfcfa' : 'transparent', boxShadow: '0 0 4px rgba(0,0,0,.55)' }} />
);

/**
 * One scene's shots, right to left. Tap = editor. Press and hold = pick the shot up and slide it
 * to a new place in the strip; holding without moving opens its menu («نقل إلى مشهد…» etc.).
 */
function ShotStrip({ p, sc, si }: { p: PProject; sc: PScene; si: number }) {
  const offline = useApp((s) => s.offline);
  const [drag, setDrag] = useState<{ id: string; from: number; over: number } | null>(null);
  const g = useRef<{ x: number; y: number; id: string; from: number; timer: ReturnType<typeof setTimeout> | null; on: boolean; moved: boolean; over: number } | null>(null);
  const suppress = useRef(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const ar = p.aspect === '2.39:1' ? 2.39 : (() => { const [a, b] = p.aspect.split(':').map(Number); return a / b || 16 / 9; })();
  const h = ar >= 1 ? Math.round(132 / ar) : 120;
  const w = ar >= 1 ? 132 : Math.round(120 * ar);
  useEffect(() => {
    // while a shot is held, the strip must not scroll under the finger
    const stop = (e: TouchEvent) => { if (g.current?.on) e.preventDefault(); };
    window.addEventListener('touchmove', stop, { passive: false });
    return () => window.removeEventListener('touchmove', stop);
  }, []);
  const end = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s) return;
    if (s.timer) clearTimeout(s.timer);
    g.current = null;
    if (!s.on) return;
    suppress.current = true;
    setDrag(null);
    if (s.moved && s.over !== s.from) {
      moveShot(s.id, sc.id, s.over > s.from ? s.over + 1 : s.over);
      toast(`انتقلت اللقطة إلى ${si + 1}.${s.over + 1}`, { undo: true });
    } else if (!s.moved) openMenu(e.clientX, e.clientY, shotMenu(s.id), 'shot-menu');
  };
  return (
    <div ref={stripRef} data-testid="m-strip" style={{ display: 'flex', gap: 8, overflowX: drag ? 'hidden' : 'auto', padding: '6px 0 4px', scrollbarWidth: 'none', touchAction: drag ? 'none' : 'pan-x pan-y' }}>
      {sc.shots.map((sh, hi) => {
        const lifted = drag?.id === sh.id;
        const target = drag && !lifted && drag.over === hi;
        return (
          <button key={sh.id} data-testid="m-strip-shot" data-shot-id={sh.id} data-strip-i={hi} data-status={sh.status}
            onClick={() => { if (suppress.current) return void (suppress.current = false); openEditor('shot', sh.id); }}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              if (offline || e.button > 0) return;
              const s = { x: e.clientX, y: e.clientY, id: sh.id, from: hi, timer: null as ReturnType<typeof setTimeout> | null, on: false, moved: false, over: hi };
              s.timer = setTimeout(() => {
                s.on = true;
                navigator.vibrate?.(12);
                setDrag({ id: sh.id, from: hi, over: hi });
              }, 420);
              g.current = s;
            }}
            onPointerMove={(e) => {
              const s = g.current;
              if (!s) return;
              if (!s.on) {
                if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8 && s.timer) (clearTimeout(s.timer), (g.current = null));
                return;
              }
              if (Math.abs(e.clientX - s.x) > 6) s.moved = true;
              const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-strip-i]') as HTMLElement | null;
              if (el && stripRef.current?.contains(el)) {
                s.over = Number(el.dataset.stripI);
                setDrag({ id: s.id, from: s.from, over: s.over });
              }
            }}
            onPointerUp={end}
            onPointerCancel={() => { if (g.current?.timer) clearTimeout(g.current.timer); g.current = null; setDrag(null); }}
            style={{ position: 'relative', width: w, height: h, flexShrink: 0, borderRadius: 6, border: 'none', padding: 0, background: frameBg(coverOf(sh), moodHex(sc.mood)), WebkitTouchCallout: 'none', userSelect: 'none', opacity: lifted ? 0.45 : 1, transform: lifted ? 'scale(.94)' : undefined, boxShadow: target ? '0 0 0 3px var(--color-accent)' : undefined, transition: 'transform 120ms, box-shadow 120ms' } as React.CSSProperties}>
            <span data-testid="shot-num" style={{ position: 'absolute', top: 5, insetInlineStart: 8, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20, color: '#fdfcfa', textShadow: '0 1px 5px rgba(0,0,0,.6)' }}>{`${si + 1}.${hi + 1}`}</span>
            {statusDot(sh.status)}
          </button>
        );
      })}
      <button data-testid="m-strip-add" disabled={offline} onClick={() => addShot(sc.id)} style={{ width: Math.round(w * 0.6), height: h, flexShrink: 0, borderRadius: 6, border: '1.5px dashed var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, fontSize: 12, fontWeight: 700 }}>
        <Icon name="plus" size={18} />لقطة
      </button>
    </div>
  );
}

// ---------- shots list ----------

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

/** The shot list from before (status in one tap, by scene/location, status filter) — description on two lines. */
function ShotList({ p }: { p: PProject }) {
  const eq = useEquipment();
  const cf = useFields().shown.shotCard;
  const offline = useApp((s) => s.offline);
  const [group, setGroup] = useState<'scene' | 'location'>('scene');
  const [status, setStatus] = useState<'all' | Status>('all');
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
  return (
    <div data-component="MobileShotList" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '2px 14px 10px', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid var(--color-border-subtle)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ fontWeight: 700 }} data-testid="m-progress">{`${shotCount} من ${all.length} تصوّرت`}</span><span style={{ color: 'var(--color-text-muted)' }}>{`${appr} معتمدة`}</span></div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--color-surface-strong)', overflow: 'hidden' }}><div style={{ height: '100%', width: all.length ? Math.round((shotCount / all.length) * 100) + '%' : '0%', background: 'var(--color-accent)', borderRadius: 3, transition: 'width 200ms' }} /></div>
        </div>
        <Chips value={group} onChange={setGroup} items={[['scene', 'حسب المشهد'], ['location', 'حسب الموقع']]} />
        <Chips value={status} onChange={setStatus} items={[['all', 'الكل'], ...ORDER.map((k) => [k, STATUS[k].label] as [Status, string])]} />
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
                  <button onClick={() => openEditor('shot', x.sh.id)} style={{ flex: 1, minWidth: 0, display: 'flex', gap: 10, alignItems: 'center', border: 'none', background: 'transparent', padding: 0, textAlign: 'right', color: 'var(--color-text)' }}>
                    <span style={{ position: 'relative', width: 92, height: 58, borderRadius: 4, background: frameBg(coverOf(x.sh), moodHex(x.sc.mood)), flexShrink: 0 }}><span style={{ position: 'absolute', top: 4, insetInlineEnd: 6, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 16, color: '#fdfcfa', textShadow: '0 1px 5px rgba(0,0,0,.6)' }}>{x.num}</span></span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span data-testid="m-shot-desc" style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{x.sh.description || 'بدون وصف'}</span>
                      {/* the card fields of «الحقول» (UPDATE-3 §4.4) */}
                      {(cf.has('camera') || cf.has('motion')) && <span style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[cf.has('camera') && camLine(eq, x.sh), cf.has('motion') && moveLine(eq, x.sh)].filter(Boolean).join(' · ')}</span>}
                      {(cf.has('size') || cf.has('dur')) && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{[cf.has('size') && (x.sh.size ?? ''), cf.has('dur') && mmss(x.sh.durationS)].filter(Boolean).join(' · ')}</span>}
                    </span>
                  </button>
                  <button title="تغيير الحالة" data-testid="m-status" data-status={x.sh.status} disabled={offline} onClick={() => cycle(x.sh.id, x.sh.status)} style={{ width: 84, height: 48, flexShrink: 0, borderRadius: 999, border: `1.5px solid ${sv.sBorder}`, background: sv.sBg, color: sv.sFg, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: offline ? 0.45 : 1 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: sv.dot, border: `1.5px solid ${sv.ring}` }} />{sv.status}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
        {!groups.length && <EmptyState icon="search" title={all.length ? 'ما فيه لقطات بهالحالة' : 'ما فيه لقطات بعد'} description={all.length ? 'غيّر الفلتر لعرض لقطات أخرى.' : 'أضف لقطة من ＋.'} />}
      </div>
    </div>
  );
}

// ---------- library ----------

type LibTab = 'character' | 'location' | 'moodboard';
const LIB: Record<LibTab, { list: (p: PProject) => PLib[]; add: string; empty: string }> = {
  character: { list: (p) => p.library.characters, add: 'شخصية', empty: 'ما فيه شخصيات بعد' },
  location: { list: (p) => p.library.locations, add: 'موقع', empty: 'ما فيه مواقع بعد' },
  moodboard: { list: (p) => p.library.moodboards, add: 'لوحة مزاج', empty: 'ما فيه لوحات مزاج بعد' },
};

function LibraryTab({ p }: { p: PProject }) {
  const offline = useApp((s) => s.offline);
  const [t, setT] = useState<LibTab>('character');
  const items = LIB[t].list(p);
  const used = (e: PLib) => p.scenes.filter((s) => (t === 'character' ? s.characterIds.includes(e.id) : t === 'location' ? s.locationId === e.id : s.moodboardIds.includes(e.id))).length;
  return (
    <div data-testid="m-library" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 14px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Chips testid="m-lib" value={t} onChange={setT} items={[['character', 'الشخصيات'], ['location', 'المواقع'], ['moodboard', 'لوحات المزاج']]} />
      {items.map((e) => {
        const av = t === 'character' ? avatar(e) : null;
        const title = ((e.name ?? e.title) as string) || LIB[t].add;
        const sub = t === 'character' ? [e.role, e.description].filter(Boolean).join(' — ') : t === 'location' ? (e.address as string) || '' : `${e.images.length} صور`;
        return (
          <div key={e.id} data-testid="m-lib-item" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <button onClick={() => openEditor(t, e.id)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, border: 'none', background: 'transparent', padding: 0, textAlign: 'right', color: 'var(--color-text)' }}>
              {av
                ? <span data-testid="char-avatar" data-where="m-library" style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, background: av.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 21, color: '#141210' }}>{av.init}</span>
                : <span style={{ width: 72, height: 52, borderRadius: 6, flexShrink: 0, background: frameBg(coverOf(e), ((e.swatches as string[]) ?? [])[0] || '#d2a06a') }} />}
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
                {sub && <span style={{ fontSize: 13, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>}
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{`${used(e)} مشاهد`}</span>
              </span>
            </button>
            <button aria-label="خيارات" data-testid="m-lib-dots" disabled={offline} onClick={(ev) => openMenu(at(ev).x, at(ev).y, libMenu(t, e.id), 'lib-menu')} style={{ ...iconBtn, color: 'var(--color-text-muted)' }}><Icon name="more" size={19} /></button>
          </div>
        );
      })}
      {!items.length && <span style={{ padding: '14px 0', fontSize: 14, color: 'var(--color-text-muted)' }}>{LIB[t].empty}</span>}
      <button data-testid="m-lib-add" disabled={offline} onClick={() => createFromTemplate(t, { where: 'library' })} style={{ height: 50, border: '1.5px dashed var(--color-border)', borderRadius: 10, background: 'transparent', color: 'var(--color-text)', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Icon name="plus" size={17} />{`${LIB[t].add} جديدة`.replace('موقع جديدة', 'موقع جديد')}
      </button>
    </div>
  );
}
