import { useEffect } from 'react';
import { boot, start as retryStart } from '../app/actions';
import { wireKeys } from '../app/keys';
import { getState, useApp } from '../app/state';
import { Alert, Skeleton } from '../ds/ds';
import { LoginScreen, SetupScreen } from './Login';
import { ConfirmDialog, Modals, Toasts } from './Modals';
import { EqSprite, EquipmentPage, PageBack, SettingsPage, TrashPage } from './Pages';
import { PresentationMode } from './Present';
import { TopBar, UpdateBanner } from './TopBar';
import { MenuLayer, PickTargetDialog } from './Menu';
import { goHome as phoneHome, MobileApp } from './m/MobileApp';
import { installBackButton } from './m/kit';
import { isPhone, useIsMobile } from '../lib/device';
import { Workspace } from './Workspace';
import { HomeScreen } from './Home';
import { IdeaEditDialog, IdeasPage } from './Ideas';
import { ChoiceDialog, SearchDialog } from './Search';
import { ChallengeLayer } from './Challenge';

function Loading({ mobile }: { mobile: boolean }) {
  if (mobile) {
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1, 2, 3, 4, 5].map((k) => <Skeleton key={k} height={84} radius="md" />)}
      </div>
    );
  }
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
  const modal = useApp((s) => s.modal);
  const bootOffline = useApp((s) => s.bootOffline);
  const mobile = useIsMobile();
  useEffect(() => {
    wireKeys();
    installBackButton(() => isPhone() && getState().auth === 'app', phoneHome);
    void boot();
  }, []);
  return (
    <div data-component="SceneBoardApp" dir="rtl" style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>
      <EqSprite />
      {auth === 'login' && <LoginScreen />}
      {auth === 'setup' && <SetupScreen />}
      {(auth === 'loading' || (auth === 'app' && !loaded)) && <Loading mobile={mobile} />}
      {auth === 'app' && loaded && mobile && <MobileApp />}
      {auth === 'app' && loaded && !mobile && bootOffline && (
        <div data-testid="offline-start" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 34 }}>ما فيه اتصال</h1>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--color-text-muted)', lineHeight: 1.8 }}>يفتح لحاله مع الاتصال.</p>
          <button onClick={() => void retryStart()} style={{ height: 44, padding: '0 20px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>جرّب الحين</button>
        </div>
      )}
      {auth === 'app' && loaded && !mobile && !bootOffline && (
        <>
          <TopBar />
          {offline && (
            <div data-component="OfflineBanner" data-testid="offline-banner" style={{ flexShrink: 0, padding: '8px 16px', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <Alert tone="danger" title="ما فيه اتصال">التعديل متوقف حتى يرجع.</Alert>
            </div>
          )}
          {screen === 'app' && <Workspace />}
          {screen === 'home' && <HomeScreen />}
          {screen === 'ideas' && <IdeasPage />}
          {(screen === 'equipment' || screen === 'trash' || screen === 'settings') && <PageBack />}
          {screen === 'equipment' && <EquipmentPage />}
          {screen === 'trash' && <TrashPage />}
          {screen === 'settings' && <SettingsPage />}
          <Modals />
          {modal === 'search' && <SearchDialog />}
          <ChoiceDialog />
          <IdeaEditDialog />
          <PresentationMode />
          <ChallengeLayer />
        </>
      )}
      <ConfirmDialog />
      <Toasts />
      {auth === 'app' && <UpdateBanner />}
      {auth === 'app' && <MenuLayer />}
      {auth === 'app' && <PickTargetDialog />}
    </div>
  );
}
