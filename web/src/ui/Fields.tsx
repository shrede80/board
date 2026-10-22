import { useEffect, useRef, useState } from 'react';
import { FIELD_GROUPS, shownFields, toggleField, type FieldGroupId, type FieldPreset, type FieldsPref } from '../../../shared/fields';
import { setPref, usePref } from '../app/prefs';
import { setState, useApp } from '../app/state';
import { Icon } from '../ds/ds';
import { useIsMobile } from '../lib/device';

/**
 * «وش يظهر لك؟» (UPDATE-3 §4.3, mockups/simple.html): presets «بسيط · كامل · مخصص» and one
 * switch per field, in the editor and on the card. Changes apply at once everywhere and sync.
 */
export function useFields() {
  const p = usePref<FieldsPref>('fields');
  return { pref: p, shown: shownFields(p) };
}

function Toggle({ on, fixed, onClick, testid }: { on: boolean; fixed?: boolean; onClick: () => void; testid: string }) {
  return (
    <button role="switch" aria-checked={on} disabled={fixed} data-testid={testid} onClick={onClick} className={`fd-sw${on ? ' on' : ''}${fixed ? ' lock' : ''}`} title={fixed ? 'ثابت' : undefined}>
      <i />
    </button>
  );
}

export function FieldsBody({ kind }: { kind: 'shot' | 'scene' }) {
  const { pref, shown } = useFields();
  const offline = useApp((s) => s.offline);
  const preset: FieldPreset = pref?.preset ?? 'simple';
  const cols: FieldGroupId[] = kind === 'shot' ? ['shotEditor', 'shotCard'] : ['sceneEditor', 'sceneCard'];
  const setPreset = (p: FieldPreset) => {
    if (p === 'custom') {
      // «مخصص» starts from what shows now
      const s: Partial<Record<FieldGroupId, string[]>> = {};
      for (const g of Object.keys(FIELD_GROUPS) as FieldGroupId[]) s[g] = [...shown[g]];
      setPref('fields', { preset: 'custom', shown: s });
    } else setPref('fields', { preset: p });
  };
  return (
    <div data-component="FieldsPanel" data-testid="fields-panel">
      <h4 className="fd-title">وش يظهر لك؟</h4>
      <div className="fd-sub">{`يتطبّق على كل ${kind === 'shot' ? 'اللقطات' : 'المشاهد'}، في اللابتوب والجوال.`}</div>
      <div className="fd-presets">
        {(['simple', 'full', 'custom'] as const).map((p) => (
          <button key={p} disabled={offline} data-testid={`fields-preset-${p}`} aria-pressed={preset === p} className={`fd-chip${preset === p ? ' on' : ''}`} onClick={() => setPreset(p)}>
            {{ simple: 'بسيط', full: 'كامل', custom: 'مخصص' }[p]}
          </button>
        ))}
      </div>
      <div className="fd-cols">
        {cols.map((g) => (
          <div key={g}>
            <h5>{g.endsWith('Editor') ? 'في المحرر' : 'على الكرت'}</h5>
            {FIELD_GROUPS[g].fields.map((f) => (
              <div key={f.id} className="fd-row">
                <span>{f.label}</span>
                <Toggle on={shown[g].has(f.id)} fixed={f.fixed || offline} testid={`field-${g}-${f.id}`} onClick={() => setPref('fields', toggleField(pref, g, f.id))} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="fd-note">المخفي ما ينحذف: يظهر ملخصه في «تفاصيل التصوير».</div>
    </div>
  );
}

/** The «الحقول» button of an editor header: a small window under it on the laptop, a sheet on the phone. */
export function FieldsButton({ kind }: { kind: 'shot' | 'scene' }) {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', esc, true);
    };
  }, [open]);
  return (
    <div ref={ref} style={{ position: mobile ? 'static' : 'relative' }}>
      <button title="الحقول اللي تظهر" aria-label="الحقول" aria-expanded={open} data-testid="fields-btn" className="h-strong"
        onClick={() => setOpen(!open)}
        style={{ width: mobile ? 44 : 32, height: mobile ? 44 : 32, border: 'none', borderRadius: 8, background: open ? 'var(--color-surface-strong)' : 'transparent', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <Icon name="settings" size={mobile ? 20 : 17} />
      </button>
      {open && (mobile ? (
        <>
          <div className="fd-scrim" onClick={() => setOpen(false)} />
          <div className="fd-sheet anim-sheet"><FieldsBody kind={kind} /></div>
        </>
      ) : (
        <div className="fd-pop anim-rise"><FieldsBody kind={kind} /></div>
      ))}
    </div>
  );
}

/** From «الإعدادات»: both, with a switch between the shot and the scene. */
export function FieldsSettings() {
  const [kind, setKind] = useState<'shot' | 'scene'>('shot');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="fd-presets" style={{ margin: 0 }}>
        <button className={`fd-chip${kind === 'shot' ? ' on' : ''}`} onClick={() => setKind('shot')} data-testid="fields-kind-shot">اللقطة</button>
        <button className={`fd-chip${kind === 'scene' ? ' on' : ''}`} onClick={() => setKind('scene')} data-testid="fields-kind-scene">المشهد</button>
      </div>
      <FieldsBody kind={kind} />
    </div>
  );
}

export const openShortcuts = () => setState({ modal: 'shortcuts', menu: false });
