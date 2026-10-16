import { useEffect, useRef, useState } from 'react';
import { openEditor, openProject, setMode, showHome } from '../app/actions';
import { cancelChoice } from '../app/ideas';
import { getState, setState, useApp } from '../app/state';
import { api } from '../data/api';
import { Icon } from '../ds/ds';
import { Overlay } from './Pages';

/** Ctrl+K (UPDATE-1 ب1): projects & clients, scenes, shots, ideas — grouped; Enter opens the hit. */
interface Hit { kind: 'project' | 'scene' | 'shot' | 'idea'; id: string; projectId: string | null; title: string; sub: string }
const GROUP: Record<Hit['kind'], [string, string]> = { project: ['المشاريع', 'folder'], scene: ['المشاهد', 'film'], shot: ['اللقطات', 'camera'], idea: ['الأفكار', 'sparkles'] };

async function openHit(h: Hit) {
  setState({ modal: null });
  if (h.kind === 'idea') {
    if (getState().projectId) await showHome();
    setState({ ideaEdit: h.id });
    return;
  }
  if (!h.projectId) return;
  if (getState().projectId !== h.projectId) await openProject(h.projectId);
  if (h.kind === 'scene') openEditor('scene', h.id);
  if (h.kind === 'shot') {
    setMode('storyboard');
    openEditor('shot', h.id);
  }
}

export function SearchDialog() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    if (!q.trim()) return setHits([]);
    setBusy(true);
    const t = setTimeout(() => {
      api<Hit[]>(`/api/search?q=${encodeURIComponent(q.trim())}`).then((h) => (setHits(h), setSel(0))).catch(() => setHits([])).finally(() => setBusy(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  const order = (['project', 'scene', 'shot', 'idea'] as const).flatMap((k) => hits.filter((h) => h.kind === k));
  return (
    <Overlay onClose={() => setState({ modal: null })} z={75}>
      <div data-component="SearchDialog" data-testid="search" style={{ alignSelf: 'flex-start', marginTop: 60, width: 640, maxWidth: '100%', maxHeight: 'calc(100% - 80px)', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', borderRadius: 14, boxShadow: 'var(--shadow-lift)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <Icon name="search" size={18} />
          <input ref={ref} value={q} data-testid="search-input" placeholder="ابحث في المشاريع والمشاهد والأفكار…" onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(order.length - 1, s + 1)));
              if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
              if (e.key === 'Enter' && order[sel]) (e.preventDefault(), void openHit(order[sel]));
              if (e.key === 'Escape') (e.stopPropagation(), setState({ modal: null }));
            }}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--color-text)', fontSize: 16, fontFamily: 'var(--font-sans)' }} />
          <span style={{ fontSize: 12, border: '1px solid var(--color-border)', borderRadius: 4, padding: '1px 6px', direction: 'ltr', color: 'var(--color-text-muted)' }}>Esc</span>
        </div>
        <div style={{ overflowY: 'auto', padding: 8 }}>
          {(['project', 'scene', 'shot', 'idea'] as const).map((k) => {
            const list = hits.filter((h) => h.kind === k);
            if (!list.length) return null;
            return (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', padding: '6px 10px 2px' }}>{GROUP[k][0]}</span>
                {list.map((h) => {
                  const i = order.indexOf(h);
                  return (
                    <button key={`${h.kind}${h.id}`} data-testid="search-hit" data-kind={h.kind} onMouseEnter={() => setSel(i)} onClick={() => void openHit(h)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', border: 'none', borderRadius: 6, background: i === sel ? 'var(--color-surface-strong)' : 'transparent', color: 'var(--color-text)', textAlign: 'right', cursor: 'pointer' }}>
                      <Icon name={GROUP[k][1]} size={16} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.title || 'بدون وصف'}</span>
                      {h.sub && <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{h.sub}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {q.trim() && !busy && !hits.length && <div style={{ padding: 18, fontSize: 14, color: 'var(--color-text-muted)', textAlign: 'center' }}>لا نتائج</div>}
          {!q.trim() && <div style={{ padding: 18, fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>المشاريع والمشاهد واللقطات والأفكار.</div>}
        </div>
      </div>
    </Overlay>
  );
}

/** «اختر…» list used by the idea conversions (project, scene, shot). */
export function ChoiceDialog() {
  const c = useApp((s) => s.choice);
  if (!c) return null;
  const pick = (run: () => void) => () => {
    setState({ choice: null });
    run();
  };
  const any = c.groups.some((g) => g.options.length);
  return (
    <Overlay onClose={cancelChoice} z={80}>
      <div data-component="ChoiceDialog" data-testid="choice" style={{ width: 520, maxWidth: '100%', maxHeight: '100%', overflowY: 'auto', background: 'var(--color-bg)', borderRadius: 14, boxShadow: 'var(--shadow-lift)', padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 24 }}>{c.title}</h2>
          <button title="إلغاء" onClick={cancelChoice} style={{ width: 36, height: 36, border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={18} /></button>
        </div>
        {c.groups.map((g, gi) => (
          <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {g.label && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)' }}>{g.label}</span>}
            {g.options.map((o, i) => (
              <button key={i} data-testid={o.testid ?? 'choice-option'} className="h-strong" onClick={pick(o.run)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: '1px solid var(--color-border-subtle)', borderRadius: 8, background: 'transparent', color: 'var(--color-text)', textAlign: 'right', cursor: 'pointer' }}>
                {o.bg && <span style={{ width: 52, height: 34, borderRadius: 4, flexShrink: 0, background: o.bg }} />}
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{o.label}</span>
                  {o.sub && <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.sub}</span>}
                </span>
              </button>
            ))}
          </div>
        ))}
        {!any && <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{c.empty ?? 'لا خيارات'}</span>}
      </div>
    </Overlay>
  );
}
