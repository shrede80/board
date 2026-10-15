import { redo, setMode, setTheme, undo } from '../app/actions';
import { openPresent } from '../app/present';
import { engine, setState, useApp, useProject } from '../app/state';
import { fitAll } from '../app/board';
import { sceneDur } from '../data/project';
import { Button, Icon, Tabs } from '../ds/ds';
import { mmss } from '../lib/util';

const iconBtn: React.CSSProperties = {
  width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent',
  borderRadius: 8, cursor: 'pointer', color: 'var(--color-text)',
};

/** Undo / redo arrows (SPEC §7.1: clear ↶ ↷ instead of the prototype's swap arrows). */
function UndoIcon({ flip }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={19} height={19} style={{ transform: flip ? 'scaleX(-1)' : undefined }} aria-hidden="true">
      <path d="M9 14 4 9l5-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function TopBar() {
  const p = useProject();
  const screen = useApp((s) => s.screen);
  const mode = useApp((s) => s.mode);
  const theme = useApp((s) => s.theme);
  const save = useApp((s) => s.save);
  const offline = useApp((s) => s.offline);
  const menu = useApp((s) => s.menu);
  const canUndo = useApp((s) => s.canUndo);
  const canRedo = useApp((s) => s.canRedo);
  const isDark = theme === 'dark';
  const total = p ? p.scenes.reduce((a, s) => a + sceneDur(s), 0) : 0;
  const nShots = p ? p.scenes.reduce((a, s) => a + s.shots.length, 0) : 0;
  const saveMap = { saved: ['محفوظ', 'var(--color-text-muted)'], saving: ['يحفظ…', 'var(--color-text-muted)'], error: ['فشل الحفظ — إعادة المحاولة', 'var(--color-danger)'] }[save];
  const saveLabel = offline ? 'غير متصل' : saveMap[0];
  const saveColor = offline ? 'var(--color-danger)' : saveMap[1];
  const go = (s: 'equipment' | 'trash' | 'settings') => () => setState({ screen: s, menu: false, editor: null });
  const menuItems = [
    { label: 'معداتي', icon: 'camera', onClick: go('equipment') },
    { label: 'سلة المحذوفات', icon: 'trash', onClick: go('trash') },
    { label: 'الإعدادات', icon: 'settings', onClick: go('settings') },
  ];
  return (
    <header data-component="TopBar" style={{ height: 60, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg)', position: 'relative', zIndex: 30 }}>
      <img src={isDark ? '/img/logo-white.png' : '/img/logo-black.png'} alt="إبراهيم الشريدي" style={{ width: 62, height: 38, objectFit: 'cover', mixBlendMode: isDark ? 'normal' : 'multiply' }} />
      <button data-component="ProjectSwitcherTrigger" className="h-strong" onClick={() => setState({ modal: 'projects', menu: false })} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text)', padding: '6px 10px', borderRadius: 8, fontFamily: 'var(--font-serif-text)', fontSize: 16, fontWeight: 700, maxWidth: 330 }}>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p?.name ?? ''}</span>
        <Icon name="chevron-down" size={16} />
      </button>
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
      <button title={isDark ? 'الوضع الفاتح' : 'الوضع الداكن'} className="h-strong" onClick={() => void setTheme(isDark ? 'light' : 'dark')} style={{ ...iconBtn, border: '1px solid var(--color-border)', borderRadius: '50%' }}>
        {isDark ? <Icon name="sun" size={17} /> : <span style={{ width: 15, height: 15, borderRadius: '50%', boxShadow: 'inset -5px -2px 0 0 var(--color-text)', transform: 'rotate(-20deg)' }} />}
      </button>
      <div data-menu="1" style={{ position: 'relative' }}>
        <button title="القائمة" data-testid="menu" className="h-strong" onClick={() => setState({ menu: !menu })} style={{ ...iconBtn, flexDirection: 'column', gap: 4 }}>
          {[0, 1, 2].map((k) => <span key={k} style={{ width: 16, height: 1.75, background: 'var(--color-text)', borderRadius: 2 }} />)}
        </button>
        {menu && (
          <div style={{ position: 'absolute', top: 44, insetInlineEnd: 0, width: 220, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, boxShadow: 'var(--shadow-lift)', padding: 6, display: 'flex', flexDirection: 'column' }}>
            {menuItems.map((m) => (
              <button key={m.label} className="h-strong" onClick={m.onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: 'none', background: 'transparent', borderRadius: 4, cursor: 'pointer', color: 'var(--color-text)', fontSize: 15, textAlign: 'right' }}>
                <Icon name={m.icon} size={17} />
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
