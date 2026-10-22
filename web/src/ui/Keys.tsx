import { useEffect, useRef, useState } from 'react';
import { comboOf, COMMAND_BY_ID, COMMANDS, effectiveKeys, isChanged, keyCaps, KEY_GROUPS, type AssignResult } from '../../../shared/keys';
import { isMac, keyOverrides, resetKeys, saveKeys, setKey } from '../app/commands';
import { setState, useApp } from '../app/state';
import { Button, Icon } from '../ds/ds';

/**
 * «اختصاراتك» (UPDATE-3 §3.3, mockups/keys.html): the shortcuts sheet, now editable. A click on a
 * key records the next one; Esc cancels, Delete removes it. A key used in the same screen asks
 * to swap; browser/system keys are refused. Saved in prefs 'keys' (synced, applied at once).
 */
export function ShortcutsDialog() {
  useApp((s) => s.dataVersion);
  const offline = useApp((s) => s.offline);
  const mac = isMac();
  const over = keyOverrides();
  const eff = effectiveKeys(over);
  const [q, setQ] = useState('');
  const [rec, setRec] = useState<string | null>(null);
  const [warn, setWarn] = useState<{ id: string; res: Exclude<AssignResult, { ok: true }> } | null>(null);
  const [active, setActive] = useState('general');
  const listRef = useRef<HTMLDivElement>(null);

  // recording: this listener runs before the app's own keys and stops them
  useEffect(() => {
    if (!rec) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') return setRec(null);
      if (e.key === 'Delete' || e.key === 'Backspace') {
        saveKeys(setKey(rec, null));
        return setRec(null);
      }
      const combo = comboOf(e);
      if (!combo) return; // a modifier alone: wait for the real key
      const r = setKey(rec, combo);
      setRec(null);
      if (r.ok) saveKeys(r);
      else setWarn({ id: rec, res: r });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [rec]);

  const f = q.trim().toLowerCase();
  const caps = (combo: string) => keyCaps(combo, mac);
  const matches = (id: string) => {
    if (!f) return true;
    const c = COMMAND_BY_ID[id];
    return c.label.includes(q.trim()) || eff[id].some((k) => caps(k).join(' ').toLowerCase().includes(f));
  };
  const nChanged = COMMANDS.filter((c) => isChanged(over, c.id)).length;
  const kbds = (combo: string) => caps(combo).map((p, i) => <kbd key={i} className="kd-kbd">{p}</kbd>);
  const groups = KEY_GROUPS.map((g) => ({ ...g, rows: COMMANDS.filter((c) => c.group === g.id && matches(c.id)) })).filter((g) => g.rows.length);

  return (
    <div data-component="ShortcutsDialog" data-testid="shortcuts" className="kd-dlg" onPointerDown={(e) => e.stopPropagation()}>
      <div className="kd-hd">
        <h2>اختصاراتك</h2>
        <span className="kd-badge" data-testid="keys-count">{nChanged ? `${nChanged} معدّل` : 'الافتراضي'}</span>
        <span style={{ flex: 1 }} />
        <button title="إغلاق" className="kd-x h-strong" onClick={() => setState({ modal: null })}><Icon name="x" size={18} /></button>
      </div>
      <div className="kd-tools">
        <label className="kd-search"><Icon name="search" size={16} /><input data-testid="keys-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن أمر أو زر… مثل «تكرار» أو D" /></label>
        <span className="kd-os">{mac ? 'الأزرار معروضة لماك' : 'الأزرار معروضة لويندوز'}</span>
      </div>
      <div className="kd-body">
        <nav className="kd-nav">
          {KEY_GROUPS.map((g) => {
            const ch = COMMANDS.filter((c) => c.group === g.id && isChanged(over, c.id)).length;
            return (
              <a key={g.id} className={g.id === active ? 'on' : ''} onClick={() => { setActive(g.id); listRef.current?.querySelector(`#kd-${g.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                {g.title}{ch ? <small>{`${ch} معدّل`}</small> : null}
              </a>
            );
          })}
        </nav>
        <div className="kd-list" ref={listRef}>
          {!groups.length && <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>ما فيه أمر بهالاسم</div>}
          {groups.map((g) => (
            <div key={g.id} className="kd-grp" id={`kd-${g.id}`}>
              <h3>{g.title}</h3>
              {g.rows.map((c) => {
                const changed = isChanged(over, c.id);
                const key = eff[c.id][0];
                const w = warn?.id === c.id ? warn.res : null;
                return (
                  <div key={c.id} className="kd-row" data-testid="keys-row" data-cmd={c.id}>
                    <span className="nm">
                      {changed && <i className="dot" data-testid="keys-changed" />}
                      {c.label}
                      {c.hint && <span className="hint">{c.hint}</span>}
                    </span>
                    <span className="keys">
                      {rec === c.id ? (
                        <span className="kd-rec" data-testid="keys-recording">اضغط الاختصار الجديد…</span>
                      ) : c.fixed ? (
                        <>
                          <span className="kd-chip lock" title="ثابت">{kbds(key)}</span>
                          <span className="kd-lock" title="ثابت ما يتغيّر"><Icon name="lock" size={14} /></span>
                        </>
                      ) : key ? (
                        <button className="kd-chip" data-testid="keys-edit" disabled={offline} onClick={() => { setWarn(null); setRec(c.id); }}>{kbds(key)}</button>
                      ) : (
                        <button className="kd-chip none" data-testid="keys-edit" disabled={offline} onClick={() => { setWarn(null); setRec(c.id); }}>+ أضف اختصار</button>
                      )}
                    </span>
                    {changed ? <button className="kd-reset" title="الافتراضي" data-testid="keys-reset" onClick={() => void resetKeys(c.id)}>↺</button> : <span style={{ width: 30 }} />}
                    {w && (
                      <div className={`kd-warn${w.reason !== 'conflict' || w.otherFixed ? ' red' : ''}`} data-testid="keys-warn">
                        {w.reason === 'conflict' && !w.otherFixed ? (
                          <>
                            <span className="kd-inline">{kbds(w.combo)}</span>{` مستخدم لـ «${COMMAND_BY_ID[w.other].label}». تبي تبدّلهم؟`}
                            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{`«${COMMAND_BY_ID[w.other].label}» ياخذ ${key ? 'الاختصار القديم' : 'بدون اختصار'}.`}</div>
                            <div className="acts">
                              <Button variant="primary" size="sm" data-testid="keys-swap" onClick={() => { saveKeys(setKey(c.id, w.combo, true)); setWarn(null); }}>بدّل</Button>
                              <Button variant="ghost" size="sm" onClick={() => setWarn(null)}>ألغِ</Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="kd-inline">{kbds(w.combo)}</span>
                            {w.reason === 'conflict' ? ` ثابت لـ «${COMMAND_BY_ID[w.other].label}». اختر غيره.` : ' محجوز للمتصفح أو النظام. اختر غيره.'}
                            <div className="acts"><Button variant="outline" size="sm" data-testid="keys-ok" onClick={() => setWarn(null)}>تمام</Button></div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="kd-ft">
        <span>اضغط على أي اختصار عشان تغيّره · <b>Esc</b> يلغي · <b>Delete</b> يشيل الاختصار</span>
        <span style={{ flex: 1 }} />
        <Button variant="outline" size="sm" data-testid="keys-reset-all" disabled={!nChanged || offline} onClick={() => void resetKeys()}>رجّع الكل للافتراضي</Button>
      </div>
    </div>
  );
}
