import { APP_VERSION } from '../../../../shared/version';
import { askLogout } from '../../app/projects';
import { setState, useApp } from '../../app/state';
import { Icon } from '../../ds/ds';
import { EquipmentPage, SettingsPage, TrashPage } from '../Pages';
import { iconBtn } from './kit';

/** «المزيد» (UPDATE-1 ج7): equipment, trash, settings, sign out, version. */
export function MMore() {
  const screen = useApp((s) => s.screen);
  const bootOffline = useApp((s) => s.bootOffline);
  if (screen === 'equipment' || screen === 'trash' || screen === 'settings') {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '4px 6px 0' }}>
          <button data-testid="back-to-more" onClick={() => setState({ screen: 'more' })} style={{ ...iconBtn, width: 'auto', padding: '0 10px', gap: 6, fontSize: 15, fontWeight: 600, color: 'var(--color-text-muted)' }}>
            <Icon name="arrow-right" size={17} />المزيد
          </button>
        </div>
        {bootOffline ? <span style={{ padding: 20, fontSize: 14, color: 'var(--color-text-muted)' }}>هذه الصفحة تحتاج اتصال بالإنترنت.</span>
          : screen === 'equipment' ? <EquipmentPage /> : screen === 'trash' ? <TrashPage /> : <SettingsPage />}
      </div>
    );
  }
  const row = (icon: string, label: string, onClick: () => void, testid: string, danger = false) => (
    <button data-testid={testid} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 60, padding: '0 4px', border: 'none', borderBottom: '1px solid var(--color-border-subtle)', background: 'transparent', color: danger ? 'var(--color-danger)' : 'var(--color-text)', fontSize: 17, fontWeight: 700, textAlign: 'right' }}>
      <span style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--color-surface-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={icon} size={18} /></span>
      <span style={{ flex: 1 }}>{label}</span>
      {!danger && <Icon name="chevron-down" size={15} style={{ transform: 'rotate(90deg)', color: 'var(--color-text-muted)' }} />}
    </button>
  );
  return (
    <div data-component="MobileMore" data-testid="m-more" style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 24px', display: 'flex', flexDirection: 'column' }}>
      <h1 style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 36 }}>المزيد</h1>
      {row('camera', 'معداتي', () => setState({ screen: 'equipment' }), 'more-equipment')}
      {row('trash', 'سلة المحذوفات', () => setState({ screen: 'trash' }), 'more-trash')}
      {row('settings', 'الإعدادات', () => setState({ screen: 'settings' }), 'more-settings')}
      {row('log-out', 'تسجيل الخروج', askLogout, 'menu-logout', true)}
      <span style={{ marginTop: 18, fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center' }}>لوحة المشاهد · النسخة <bdi data-testid="app-version" dir="ltr">{APP_VERSION}</bdi></span>
    </div>
  );
}
