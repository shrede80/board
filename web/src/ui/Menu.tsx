import { useLayoutEffect, useRef, useState } from 'react';
import { imageToMoodboard, imageToShot } from '../app/boardActions';
import { closeMenu, setState, useApp, useProject, type MenuEntry, type MenuItem } from '../app/state';
import { coverOf, moodHex } from '../data/project';
import { Icon } from '../ds/ds';
import { frameBg, pad2 } from '../lib/util';
import { Overlay } from './Pages';

/**
 * The one pop-up menu (right click, ⋯, long press — UPDATE-1 أ3). It stays inside the window:
 * flips up / to the other side when it would overflow. Nested lists open in place.
 */
export function MenuLayer() {
  const m = useApp((s) => s.popMenu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useLayoutEffect(() => {
    setOpen(null);
  }, [m]);
  useLayoutEffect(() => {
    if (!m || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    const pad = 8;
    let x = m.x - r.width; // RTL: the menu grows to the left of the pointer
    if (x < pad) x = Math.min(m.x, window.innerWidth - r.width - pad);
    let y = m.y;
    if (y + r.height > window.innerHeight - pad) y = Math.max(pad, m.y - r.height);
    setPos({ x: Math.max(pad, x), y });
  }, [m, open]);
  if (!m) return null;
  const run = (it: MenuItem) => () => {
    if (it.disabled) return;
    if (it.children) return setOpen(open === it.label ? null : it.label);
    closeMenu();
    it.run?.();
  };
  const row = (it: MenuItem, nested = false) => (
    <button key={it.label} data-testid={it.testid} disabled={it.disabled} className="h-strong" onClick={run(it)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 38, padding: nested ? '0 10px 0 10px' : '0 10px', paddingInlineStart: nested ? 36 : 10, border: 'none', borderRadius: 4, background: open === it.label ? 'var(--color-surface-strong)' : 'transparent', color: it.danger ? 'var(--color-danger)' : 'var(--color-text)', fontSize: 14, fontWeight: 700, textAlign: 'right', cursor: it.disabled ? 'default' : 'pointer', opacity: it.disabled ? 0.4 : 1 }}>
      {it.icon && <Icon name={it.icon} size={16} />}
      <span style={{ flex: 1 }}>{it.label}</span>
      {it.keys && <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 400, direction: 'ltr' }}>{it.keys}</span>}
      {it.children && <Icon name="chevron-down" size={14} style={{ transform: open === it.label ? 'rotate(180deg)' : undefined }} />}
    </button>
  );
  return (
    <>
      <div onPointerDown={closeMenu} onContextMenu={(e) => (e.preventDefault(), closeMenu())} style={{ position: 'fixed', inset: 0, zIndex: 88 }} />
      <div ref={ref} role="menu" data-testid={m.testid ?? 'menu'} data-menu="1"
        onKeyDown={(e) => e.key === 'Escape' && closeMenu()}
        style={{ position: 'fixed', left: pos?.x ?? -9999, top: pos?.y ?? -9999, zIndex: 89, minWidth: 240, maxWidth: 320, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, boxShadow: 'var(--shadow-lift)', padding: 6 }}>
        {m.items.map((it: MenuEntry, i) => {
          if (it === 'sep') return <div key={`s${i}`} style={{ height: 1, background: 'var(--color-border-subtle)', margin: '5px 4px' }} />;
          if (it.swatches) {
            return (
              <div key={it.label} data-testid={it.testid ?? 'm-swatches'} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 10px 8px' }}>
                {it.swatches.map((s) => (
                  <button key={String(s.key)} title={s.label} aria-pressed={s.on} data-testid={`swatch-${s.key ?? 'none'}`} onClick={() => (closeMenu(), s.run())}
                    style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid var(--color-border-subtle)', background: s.hex, cursor: 'pointer', padding: 0, boxShadow: s.on ? '0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent)' : 'none' }} />
                ))}
              </div>
            );
          }
          return (
            <div key={it.label}>
              {row(it)}
              {it.children && open === it.label && it.children.map((c) => row(c, true))}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** «اجعلها مرجعاً للقطة…» / «أضفها للوحة مزاج…» for an image card. */
export function PickTargetDialog() {
  const t = useApp((s) => s.pickTarget);
  const p = useProject();
  if (!t || !p) return null;
  const close = () => setState({ pickTarget: null });
  const pick = (f: () => void) => () => (close(), f());
  return (
    <Overlay onClose={close} z={70}>
      <div data-testid="pick-target" style={{ width: 560, maxWidth: '100%', maxHeight: '100%', overflowY: 'auto', background: 'var(--color-bg)', borderRadius: 14, boxShadow: 'var(--shadow-lift)', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 24 }}>{t.kind === 'shot' ? 'اختر اللقطة' : 'اختر لوحة المزاج'}</h2>
          <button title="إغلاق" onClick={close} style={{ width: 36, height: 36, border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={18} /></button>
        </div>
        {t.kind === 'shot' && p.scenes.map((sc, si) => (
          <div key={sc.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)' }}>{`${pad2(si + 1)} · ${sc.name}`}</span>
            {!sc.shots.length && <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>ما فيه لقطات</span>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {sc.shots.map((sh, hi) => (
                <button key={sh.id} data-testid="pick-shot" onClick={pick(() => imageToShot(t.cardId, sh.id))} title={sh.description || 'بدون وصف'}
                  style={{ position: 'relative', height: 64, border: 'none', borderRadius: 6, cursor: 'pointer', background: frameBg(coverOf(sh), moodHex(sc.mood)) }}>
                  <span style={{ position: 'absolute', top: 4, insetInlineEnd: 6, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18, color: '#fdfcfa', textShadow: '0 1px 5px rgba(0,0,0,.6)' }}>{`${si + 1}.${hi + 1}`}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {t.kind === 'moodboard' && (
          <>
            {p.library.moodboards.map((m) => (
              <button key={m.id} data-testid="pick-moodboard" className="h-strong" onClick={pick(() => imageToMoodboard(t.cardId, m.id))}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: '1px solid var(--color-border-subtle)', borderRadius: 8, background: 'transparent', cursor: 'pointer', color: 'var(--color-text)', fontSize: 15, fontWeight: 700, textAlign: 'right' }}>
                <span style={{ width: 58, height: 40, borderRadius: 4, background: frameBg(coverOf(m), ((m.swatches as string[]) ?? [])[0] || '#d2a06a') }} />
                {m.title as string}
              </button>
            ))}
            <button data-testid="pick-new-moodboard" className="h-strong" onClick={pick(() => imageToMoodboard(t.cardId, null))}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, border: '1.5px dashed var(--color-border)', borderRadius: 8, background: 'transparent', cursor: 'pointer', color: 'var(--color-text)', fontSize: 15, fontWeight: 700 }}>
              <Icon name="plus" size={16} />لوحة مزاج جديدة
            </button>
          </>
        )}
      </div>
    </Overlay>
  );
}
