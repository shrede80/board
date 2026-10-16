/**
 * The app-shell service worker (UPDATE-1 ج8). Production builds only: dev and the E2E server
 * never register it. A new version installs in the background and waits; «تحديث» on the
 * new-version banner activates it and reloads, so no tab keeps running an old shell.
 */
export function registerShell() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

/** Activates a waiting new version (if any), then reloads. */
export async function activateNewShell() {
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined;
  if (reg) await reg.update().catch(() => {});
  const waiting = reg?.waiting ?? reg?.installing;
  if (waiting) {
    const changed = new Promise<void>((r) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => r(), { once: true });
      setTimeout(r, 3000);
    });
    waiting.postMessage('skipWaiting');
    await changed;
  }
  location.reload();
}
