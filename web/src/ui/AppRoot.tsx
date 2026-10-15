import { useEffect } from 'react';
import { boot } from '../app/actions';
import { wireKeys } from '../app/keys';
import { useApp } from '../app/state';
import { Alert, Skeleton } from '../ds/ds';
import { LoginScreen, SetupScreen } from './Login';
import { ConfirmDialog, Modals, Toasts } from './Modals';
import { EqSprite, EquipmentPage, PageBack, SettingsPage, TrashPage } from './Pages';
import { PresentationMode } from './Present';
import { TopBar } from './TopBar';
import { Workspace } from './Workspace';

function Loading() {
  return (
    <>
      <div style={{ height: 60, borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px' }}>
        <Skeleton width="62px" height={32} />
        <Skeleton width="220px" height={18} />
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4,280px)', gap: 32, justifyContent: 'center', alignContent: 'center' }}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((k) => (
          <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 0 12px', border: '1px solid var(--color-border-subtle)', borderRadius: 14, overflow: 'hidden' }}>
            <Skeleton height={150} radius="sm" />
            <Skeleton width="70%" height={18} style={{ margin: '0 14px' }} />
            <Skeleton width="45%" height={12} style={{ margin: '0 14px' }} />
          </div>
        ))}
      </div>
    </>
  );
}

export function AppRoot() {
  const auth = useApp((s) => s.auth);
  const loaded = useApp((s) => s.loaded);
  const screen = useApp((s) => s.screen);
  const offline = useApp((s) => s.offline);
  useEffect(() => {
    wireKeys();
    void boot();
  }, []);
  return (
    <div data-component="SceneBoardApp" dir="rtl" style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>
      <EqSprite />
      {auth === 'login' && <LoginScreen />}
      {auth === 'setup' && <SetupScreen />}
      {(auth === 'loading' || (auth === 'app' && !loaded)) && <Loading />}
      {auth === 'app' && loaded && (
        <>
          <TopBar />
          {offline && (
            <div data-component="OfflineBanner" data-testid="offline-banner" style={{ flexShrink: 0, padding: '8px 16px', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <Alert tone="danger" title="لا يوجد اتصال، التغييرات لن تُحفظ">البرنامج يحتاج إنترنت. الأزرار معطّلة حتى يعود الاتصال.</Alert>
            </div>
          )}
          {screen === 'app' && <Workspace />}
          {screen !== 'app' && <PageBack />}
          {screen === 'equipment' && <EquipmentPage />}
          {screen === 'trash' && <TrashPage />}
          {screen === 'settings' && <SettingsPage />}
          <Modals />
          <PresentationMode />
        </>
      )}
      <ConfirmDialog />
      <Toasts />
    </div>
  );
}
