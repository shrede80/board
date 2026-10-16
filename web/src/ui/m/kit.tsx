import { closeEditor } from '../../app/actions';
import { cancelChoice } from '../../app/ideas';
import { closePresent } from '../../app/present';
import { closeMenu, getState, setState, subscribe, type UIState } from '../../app/state';
import { Icon } from '../../ds/ds';
import { PHONE_QUERY } from '../../lib/device';

/** Phone building blocks (UPDATE-1 ج1): every target ≥ 44 px, nothing depends on hover. */

export const SUBPAGES = ['equipment', 'trash', 'settings'] as const;

export const iconBtn: React.CSSProperties = { width: 44, height: 44, flexShrink: 0, border: 'none', borderRadius: 10, background: 'transparent', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 };

export function chipStyle(on: boolean): React.CSSProperties {
  return { height: 38, padding: '0 16px', flexShrink: 0, borderRadius: 999, border: `1px solid ${on ? 'transparent' : 'var(--color-border)'}`, background: on ? 'var(--color-inverse-bg)' : 'transparent', color: on ? 'var(--color-inverse-text)' : 'var(--color-text)', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' };
}

export function Chips<T extends string>({ items, value, onChange, testid }: { items: [T, string][]; value: T; onChange: (v: T) => void; testid?: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
      {items.map(([v, l]) => <button key={v} data-testid={testid ? `${testid}-${v}` : undefined} aria-pressed={value === v} onClick={() => onChange(v)} style={chipStyle(value === v)}>{l}</button>)}
    </div>
  );
}

/** Bottom sheet with a grab handle; tapping outside closes it. */
export function Sheet({ onClose, children, testid, title }: { onClose: () => void; children: React.ReactNode; testid?: string; title?: string }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 72, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(20,18,16,.45)' }} />
      <div data-testid={testid} role="dialog" style={{ position: 'relative', background: 'var(--color-bg)', borderRadius: '20px 20px 0 0', maxHeight: '92%', overflowY: 'auto', padding: '8px 18px calc(18px + env(safe-area-inset-bottom))', boxShadow: 'var(--shadow-lift)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, background: 'var(--color-border)', flexShrink: 0 }} />
        {title && <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26 }}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function SheetRow({ icon, label, sub, onClick, testid, danger, disabled }: { icon: string; label: string; sub?: string; onClick: () => void; testid?: string; danger?: boolean; disabled?: boolean }) {
  return (
    <button data-testid={testid} disabled={disabled} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 64, padding: '8px 0', border: 'none', borderBottom: '1px solid var(--color-border-subtle)', background: 'transparent', color: danger ? 'var(--color-danger)' : 'var(--color-text)', textAlign: 'right', opacity: disabled ? 0.4 : 1 }}>
      <span style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--color-surface-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={icon} size={19} /></span>
      <span style={{ flex: 1, fontSize: 17, fontWeight: 700 }}>{label}</span>
      {sub && <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{sub}</span>}
    </button>
  );
}

// ---------- back button / back swipe (UPDATE-1 ج1) ----------

/** Open layers, innermost last. The phone's back gesture closes them one by one, never the app. */
function layers(s: UIState): number {
  return [
    s.screen !== 'home',
    (SUBPAGES as readonly string[]).includes(s.screen),
    s.present.open, s.editor, s.addSheet, s.ideaSheet, s.modal, s.pick, s.ideaEdit, s.choice, s.popMenu, s.confirm,
    ...s.ch.map(() => true),
  ].filter(Boolean).length;
}

function closeTop(goHome: () => void) {
  const s = getState();
  if (s.confirm) return setState({ confirm: null });
  if (s.popMenu) return closeMenu();
  if (s.choice) return cancelChoice();
  if (s.ideaEdit) return setState({ ideaEdit: null });
  if (s.pick) return setState({ pick: null, custom: null });
  if (s.modal) return setState({ modal: null });
  if (s.ideaSheet) return setState({ ideaSheet: null });
  if (s.addSheet) return setState({ addSheet: null });
  if (s.ch.length) return setState({ ch: s.ch.slice(0, -1) });
  if (s.editor) return closeEditor();
  if (s.present.open) return closePresent();
  if ((SUBPAGES as readonly string[]).includes(s.screen)) return setState({ screen: 'more' });
  if (s.screen !== 'home') goHome();
}

let installed = false;

/**
 * Mirrors the open layers into browser history: one entry per layer. Installed once for the
 * app's lifetime (loading screens and sign-out don't reset it); off the phone UI the layer
 * count is 0, so leaving the phone UI drops its entries and no back press is ever dead.
 */
export function installBackButton(active: () => boolean, goHome: () => void) {
  if (installed) return;
  installed = true;
  let pushed = 0;
  let ignore = 0;
  const sync = () => {
    const d = active() ? layers(getState()) : 0;
    if (d > pushed) {
      while (pushed < d) history.pushState({ layer: ++pushed }, '');
    } else if (d < pushed) {
      // closed from the UI: drop the extra history entries without reacting to them
      const n = pushed - d;
      pushed = d;
      ignore++;
      history.go(-n);
    }
  };
  window.addEventListener('popstate', () => {
    if (ignore) return void ignore--;
    if (pushed === 0) return;
    pushed--;
    closeTop(goHome);
  });
  subscribe(sync);
  matchMedia(PHONE_QUERY).addEventListener('change', sync);
  sync();
}
