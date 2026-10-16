import { useEffect, useRef, useState } from 'react';
import { redo, setMode, setTheme, undo } from '../app/actions';
import { archiveProject, askDuplicate, askLogout, deleteProject, goHome, reloadForUpdate, renameProject } from '../app/projects';
import { openPresent } from '../app/present';
import { engine, getState, setState, useApp, useProject } from '../app/state';
import { fitAll } from '../app/board';
import { sceneDur } from '../data/project';
import { Button, Icon, Tabs } from '../ds/ds';
import { mmss } from '../lib/util';

const iconBtn: React.CSSProperties = {
  width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent',
  borderRadius: 8, cursor: 'pointer', color: 'var(--color-text)',
};

/** Undo / redo arrows (SPEC §7.1: clear ↶ ↷ instead of the prototype's swap arrows). */
export function UndoIcon({ flip }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={19} height={19} style={{ transform: flip ? 'scaleX(-1)' : undefined }} aria-hidden="true">
      <path d="M9 14 4 9l5-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function TopBar() {
  const p = useProject();
  if (!p) return <HomeTopBar />;
  return <ProjectTopBar />;
}

/** Home and pages without an open project (UPDATE-1 ب1): logo · «الرئيسية» · search · theme · menu. */
function HomeTopBar() {
  const theme = useApp((s) => s.theme);
  const screen = useApp((s) => s.screen);
  const isDark = theme === 'dark';
  return (
    <header data-component="TopBar" style={{ height: 60, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg)', position: 'relative', zIndex: 30 }}>
      <button title="الرئيسية" onClick={goHome} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex' }}>
        <img src={isDark ? '/img/logo-white.png' : '/img/logo-black.png'} alt="إبراهيم الشريدي" style={{ width: 62, height: 38, objectFit: 'cover', mixBlendMode: isDark ? 'normal' : 'multiply' }} />
      </button>
      {screen === 'home'
        ? <span data-testid="crumb-home-title" style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 17 }}>الرئيسية</span>
        : <button data-testid="crumb-home" className="h-strong" onClick={goHome} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'var(--color-surface)', color: 'var(--color-text-muted)', fontSize: 14, fontWeight: 600, padding: '6px 10px', borderRadius: 8, cursor: 'pointer' }}><Icon name="home" size={15} />الرئيسية</button>}
      <button data-testid="open-search" onClick={() => setState({ modal: 'search' })}
        style={{ flex: '0 1 460px', margin: '0 auto', height: 40, border: '1px solid var(--color-border)', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', color: 'var(--color-text-muted)', fontSize: 14, background: 'var(--color-surface)', cursor: 'text', fontFamily: 'var(--font-sans)' }}>
        <Icon name="search" size={17} />ابحث في المشاريع والمشاهد والأفكار…
        <span style={{ marginInlineStart: 'auto', fontSize: 12, border: '1px solid var(--color-border)', borderRadius: 4, padding: '1px 6px', direction: 'ltr' }}>Ctrl K</span>
      </button>
      <ThemeButton />
      <MainMenu />
    </header>
  );
}

function ThemeButton() {
  const theme = useApp((s) => s.theme);
  const isDark = theme === 'dark';
  return (
    <button title={isDark ? 'الوضع الفاتح' : 'الوضع الداكن'} className="h-strong" onClick={() => void setTheme(isDark ? 'light' : 'dark')} style={{ ...iconBtn, border: '1px solid var(--color-border)', borderRadius: '50%' }}>
      {isDark ? <Icon name="sun" size={17} /> : <span style={{ width: 15, height: 15, borderRadius: '50%', boxShadow: 'inset -5px -2px 0 0 var(--color-text)', transform: 'rotate(-20deg)' }} />}
    </button>
  );
}

/** ☰ معداتي · السلة · الإعدادات · تسجيل الخروج */
function MainMenu() {
  const menu = useApp((s) => s.menu);
  const go = (s: 'equipment' | 'trash' | 'settings') => () => setState({ screen: s, menu: false, editor: null });
  const menuItems: { label: string; icon: string; onClick: () => void; testid?: string }[] = [
    { label: 'معداتي', icon: 'camera', onClick: go('equipment') },
    { label: 'سلة المحذوفات', icon: 'trash', onClick: go('trash') },
    { label: 'الإعدادات', icon: 'settings', onClick: go('settings') },
    { label: 'تسجيل الخروج', icon: 'log-out', onClick: askLogout, testid: 'menu-logout' },
  ];
  return (
    <div data-menu="1" style={{ position: 'relative' }}>
      <button title="القائمة" data-testid="menu" className="h-strong" onClick={() => setState({ menu: !menu })} style={{ ...iconBtn, flexDirection: 'column', gap: 4 }}>
        {[0, 1, 2].map((k) => <span key={k} style={{ width: 16, height: 1.75, background: 'var(--color-text)', borderRadius: 2 }} />)}
      </button>
      {menu && (
        <div style={{ position: 'absolute', top: 44, insetInlineEnd: 0, width: 220, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, boxShadow: 'var(--shadow-lift)', padding: 6, display: 'flex', flexDirection: 'column' }}>
          {menuItems.map((m) => (
            <button key={m.label} className="h-strong" data-testid={m.testid} onClick={m.onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: 'none', background: 'transparent', borderRadius: 4, cursor: 'pointer', color: 'var(--color-text)', fontSize: 15, textAlign: 'right' }}>
              <Icon name={m.icon} size={17} />
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectTopBar() {
  const p = useProject();
  const screen = useApp((s) => s.screen);
  const mode = useApp((s) => s.mode);
  const theme = useApp((s) => s.theme);
  const save = useApp((s) => s.save);
  const offline = useApp((s) => s.offline);
  const canUndo = useApp((s) => s.canUndo);
  const canRedo = useApp((s) => s.canRedo);
  const isDark = theme === 'dark';
  const total = p ? p.scenes.reduce((a, s) => a + sceneDur(s), 0) : 0;
  const nShots = p ? p.scenes.reduce((a, s) => a + s.shots.length, 0) : 0;
  const saveMap = { saved: ['محفوظ', 'var(--color-text-muted)'], saving: ['يحفظ…', 'var(--color-text-muted)'], error: ['فشل الحفظ — إعادة المحاولة', 'var(--color-danger)'] }[save];
  const saveLabel = offline ? 'غير متصل' : saveMap[0];
  const saveColor = offline ? 'var(--color-danger)' : saveMap[1];
  return (
    <header data-component="TopBar" style={{ height: 60, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg)', position: 'relative', zIndex: 30 }}>
      <button title="الرئيسية" onClick={goHome} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex' }}>
        <img src={isDark ? '/img/logo-white.png' : '/img/logo-black.png'} alt="إبراهيم الشريدي" style={{ width: 62, height: 38, objectFit: 'cover', mixBlendMode: isDark ? 'normal' : 'multiply' }} />
      </button>
      <Breadcrumb />
      <div style={{ flex: 1 }} />
      <div data-component="ModeSwitch" style={{ flexShrink: 0 }}>
        <Tabs
          items={[{ value: 'board', label: 'لوحة الأفكار' }, { value: 'storyboard', label: 'الستوري بورد' }]}
          value={screen === 'app' ? mode : ''}
          onChange={(m) => {
            if (screen !== 'app') {
              setState({ screen: 'app', mode: m as 'board' | 'storyboard' });
              setTimeout(fitAll, 30);
            } else setMode(m as 'board' | 'storyboard');
          }}
          style={{ flexWrap: 'nowrap' }}
        />
      </div>
      <div style={{ flex: 1 }} />
      <div title="مجموع مدد اللقطات" style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
        <span data-testid="total-dur" style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20, color: 'var(--color-text)' }}>{mmss(total)}</span>
        <span>{`${p?.scenes.length ?? 0} مشاهد · ${nShots} لقطة`}</span>
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        <button title={canUndo ? 'تراجع (Ctrl+Z)' : 'لا يوجد ما يُتراجع عنه'} aria-label="تراجع" data-testid="undo" className="h-strong" disabled={!canUndo || offline} onClick={() => void undo()} style={{ ...iconBtn, opacity: canUndo ? 1 : 0.35 }}>
          <UndoIcon />
        </button>
        <button title={canRedo ? 'إعادة (Ctrl+Shift+Z)' : 'لا يوجد ما يُعاد'} aria-label="إعادة" data-testid="redo" className="h-strong" disabled={!canRedo || offline} onClick={() => void redo()} style={{ ...iconBtn, opacity: canRedo ? 1 : 0.35 }}>
          <UndoIcon flip />
        </button>
      </div>
      <button data-component="SaveIndicator" data-testid="save-indicator" onClick={() => save === 'error' && engine.retry()} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', fontSize: 13, fontWeight: 600, color: saveColor, cursor: save === 'error' ? 'pointer' : 'default', whiteSpace: 'nowrap', padding: '4px 6px' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: saveColor }} />
        {saveLabel}
      </button>
      <Button variant="outline" size="sm" icon="play" onClick={() => openPresent(0)} disabled={offline}>عرض</Button>
      <Button variant="primary" size="sm" icon="download" onClick={() => setState({ modal: 'export' })} disabled={offline} data-testid="open-export">تصدير</Button>
      <ThemeButton />
      <MainMenu />
    </header>
  );
}

const menuItem: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, height: 38, padding: '0 10px', border: 'none', background: 'transparent', borderRadius: 4, cursor: 'pointer', color: 'var(--color-text)', fontSize: 14, fontWeight: 700, textAlign: 'right', width: '100%' };

/** «⌂ الرئيسية ‹ اسم المشروع ▾» with the project menu (UPDATE-1 أ1). */
function Breadcrumb() {
  const p = useProject();
  const open = useApp((s) => s.projMenu);
  const renaming = useApp((s) => s.renaming?.kind === 'project');
  const offline = useApp((s) => s.offline);
  if (!p) return null;
  const pick = (f: () => void) => () => (setState({ projMenu: false }), f());
  const items: { label: string; icon: string; key?: string; run: () => void; danger?: boolean; testid: string }[] = [
    { label: 'إعادة التسمية', icon: 'edit', key: 'F2', run: () => setState({ renaming: { kind: 'project', id: p.id } }), testid: 'pm-rename' },
    { label: 'إعدادات المشروع…', icon: 'settings', run: () => setState({ modal: 'projectSettings' }), testid: 'pm-settings' },
    { label: 'تكرار المشروع', icon: 'repeat', run: () => askDuplicate(p.id, p.name), testid: 'pm-duplicate' },
    { label: 'تصدير…', icon: 'download', run: () => setState({ modal: 'export' }), testid: 'pm-export' },
    { label: p.archived ? 'إلغاء الأرشفة' : 'أرشفة', icon: 'folder', run: () => archiveProject(!p.archived), testid: 'pm-archive' },
  ];
  return (
    <div data-component="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <button data-testid="crumb-home" className="h-strong" onClick={goHome} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'var(--color-surface)', color: 'var(--color-text-muted)', fontSize: 14, fontWeight: 600, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}>
        <Icon name="home" size={15} />الرئيسية
      </button>
      <span style={{ color: 'var(--color-text-muted)' }}>‹</span>
      {renaming ? <ProjectNameInput name={p.name} /> : (
        <div data-menu="1" style={{ position: 'relative', minWidth: 0 }}>
          <button data-component="ProjectMenuTrigger" data-testid="project-menu" className="h-strong" disabled={offline} onClick={() => setState({ projMenu: !open, menu: false })}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text)', padding: '6px 10px', borderRadius: 8, fontFamily: 'var(--font-serif-text)', fontSize: 16, fontWeight: 700, maxWidth: 330 }}>
            <span data-testid="project-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
            {p.archived && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: 999, padding: '1px 8px' }}>مؤرشف</span>}
            <Icon name="chevron-down" size={16} />
          </button>
          {open && (
            <div data-testid="project-menu-list" style={{ position: 'absolute', top: 44, insetInlineStart: 0, width: 250, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, boxShadow: 'var(--shadow-lift)', padding: 6, zIndex: 40 }}>
              {items.map((m) => (
                <button key={m.label} data-testid={m.testid} className="h-strong" onClick={pick(m.run)} style={menuItem}>
                  <Icon name={m.icon} size={16} />{m.label}
                  {m.key && <span style={{ marginInlineStart: 'auto', fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 400, direction: 'ltr' }}>{m.key}</span>}
                </button>
              ))}
              <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '5px 4px' }} />
              <button data-testid="pm-delete" className="h-strong" onClick={pick(() => deleteProject(p.id, p.name))} style={{ ...menuItem, color: 'var(--color-danger)' }}>
                <Icon name="trash" size={16} />حذف (يبقى في السلة 30 يوماً)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Rename in place: Enter saves, Esc cancels. */
function ProjectNameInput({ name }: { name: string }) {
  const [v, setV] = useState(name);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const done = (save: boolean) => {
    if (getState().renaming?.kind !== 'project') return;
    setState({ renaming: null });
    if (save) renameProject(v);
  };
  return (
    <input ref={ref} data-testid="project-name-input" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => done(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done(true);
        if (e.key === 'Escape') (e.stopPropagation(), done(false));
      }}
      style={{ width: 300, height: 34, padding: '0 10px', border: '1px solid var(--color-accent)', borderRadius: 8, background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-serif-text)', fontSize: 16, fontWeight: 700, outline: 'none' }} />
  );
}

/** «نسخة جديدة من البرنامج جاهزة — تحديث» (UPDATE-1 أ10). */
export function UpdateBanner() {
  const on = useApp((s) => s.newVersion);
  const [busy, setBusy] = useState(false);
  if (!on) return null;
  return (
    <div data-component="UpdateBanner" data-testid="update-banner" style={{ position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 96, display: 'flex', alignItems: 'center', gap: 14, background: 'var(--color-inverse-bg)', color: 'var(--color-inverse-text)', padding: '8px 10px 8px 16px', borderRadius: 999, boxShadow: 'var(--shadow-lift)', fontSize: 14, fontWeight: 600 }}>
      <span style={{ paddingInlineStart: 6 }}>نسخة جديدة من البرنامج جاهزة</span>
      <button data-testid="update-now" disabled={busy} onClick={() => (setBusy(true), void reloadForUpdate())} style={{ border: 'none', borderRadius: 999, background: 'var(--color-accent)', color: '#141210', fontWeight: 700, fontSize: 13, padding: '6px 14px', cursor: 'pointer' }}>{busy ? 'يحفظ…' : 'تحديث'}</button>
      <button title="لاحقاً" onClick={() => setState({ newVersion: false })} style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(128,128,128,.25)', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="x" size={14} /></button>
    </div>
  );
}
