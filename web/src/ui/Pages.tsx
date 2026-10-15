import { useEffect, useState } from 'react';
import type { Op, Row } from '../../../shared/schema';
import { commit, setTheme } from '../app/actions';
import { fitAll } from '../app/board';
import { askConfirm, engine, setState, toast, useApp, useEquipment } from '../app/state';
import { api, ApiError } from '../data/api';
import { Badge, Button, Card, EmptyState, Field, Icon, Input, Radio, Search, Select } from '../ds/ds';
import { daysLeft, fmtDate, pad2, uid } from '../lib/util';
import sprite from '../../../assets/equipment-icons.svg?raw';

/** Equipment icon from assets/equipment-icons.svg, keyed by the item's `icon` (SPEC §7.6). */
export function EqIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <use href={`#${name}`} />
    </svg>
  );
}
export function EqSprite() {
  return <div aria-hidden style={{ display: 'none' }} dangerouslySetInnerHTML={{ __html: sprite }} />;
}

export function PageBack() {
  return (
    <div style={{ flexShrink: 0, padding: '14px 32px 0', maxWidth: 1144, width: '100%', margin: '0 auto' }}>
      <button data-testid="back-to-app" onClick={() => (setState({ screen: 'app' }), setTimeout(fitAll, 30))} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 14, fontWeight: 600, padding: '6px 0' }}>
        <Icon name="arrow-right" size={15} />العودة إلى المشروع
      </button>
    </div>
  );
}

const h1: React.CSSProperties = { margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 40, lineHeight: 1.1 };

// ---------- equipment ----------

type EqDraft = { id: string | null; name: string; brand: string; model: string; use: string; qty: number; role: string; category: string; icon: string };

export function EquipmentPage() {
  const eq = useEquipment();
  const settings = useApp((s) => s.settings);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<EqDraft | null>(null);
  const [imp, setImp] = useState<(Row & { isNew: boolean })[] | null>(null);
  const roles = settings?.equipmentRoles ?? {};
  const cats = settings?.equipmentCategories ?? [];
  const items = [...eq.values()].filter((i) => !i.deletedAt && !i.virtual).sort((a, b) => (a.position as number) - (b.position as number));
  const hit = (i: Row) => !q.trim() || [i.name, i.brand, i.model, i.use].filter(Boolean).join(' ').includes(q.trim());
  const groups = cats.map((cat) => ({ cat, items: items.filter((i) => i.category === cat && hit(i)) })).filter((g) => g.items.length);
  const orphan = items.filter((i) => !cats.includes(i.category as string) && hit(i));
  if (orphan.length) groups.push({ cat: 'أخرى', items: orphan });
  const total = items.reduce((a, i) => a + ((i.qty as number) || 1), 0);

  const save = () => {
    if (!edit || !edit.name.trim()) return;
    const fields = { name: edit.name.trim(), brand: edit.brand, model: edit.model, use: edit.use, qty: Math.max(1, edit.qty || 1), role: edit.role, category: edit.category, icon: edit.icon };
    if (edit.id) commit([{ op: 'update', entity: 'equipment', id: edit.id, fields }], { history: 'تعديل قطعة' });
    else commit([{ op: 'create', entity: 'equipment', id: uid('eq'), fields: { ...fields, position: items.length + 1 } }], { history: 'قطعة جديدة' });
    toast(edit.id ? 'حُفظت التعديلات' : 'أُضيفت القطعة');
    setEdit(null);
  };
  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    f.text().then((t) => {
      const j = JSON.parse(t);
      const list: Row[] = j.items || (j.groups || []).flatMap((g: { category: string; items: Row[] }) => g.items.map((i) => ({ ...i, category: g.category })));
      if (!list.length) throw new Error('empty');
      const key = (i: Row) => `${i.name}|${i.model || ''}`;
      const have = new Set(items.map(key));
      setImp(list.map((i) => ({ ...i, isNew: !have.has(key(i)) })));
    }).catch(() => toast('تعذّرت قراءة الملف', { tone: 'danger' }));
  };
  const confirmImport = () => {
    const add = (imp ?? []).filter((i) => i.isNew);
    const ops: Op[] = add.map((i, k) => ({
      op: 'create', entity: 'equipment', id: i.id && !eq.has(i.id) ? i.id : uid('eq'),
      fields: {
        position: items.length + k + 1, name: String(i.name ?? ''), brand: String(i.brand ?? ''), model: String(i.model ?? ''), use: String(i.use ?? ''), qty: Number(i.qty) || 1,
        role: (i.role as string) in roles ? i.role : 'other', category: cats.includes(i.category as string) ? i.category : cats[cats.length - 1] ?? '', icon: String(i.icon ?? 'box'),
        ...(i.short ? { short: String(i.short) } : {}), ...(Array.isArray(i.motions) ? { motions: i.motions } : {}),
      },
    }));
    if (ops.length) commit(ops, { history: 'استيراد معدات' });
    setImp(null);
    toast(`استُوردت ${add.length} قطعة`);
  };
  const cell: React.CSSProperties = { width: 32, height: 32, border: 'none', background: 'transparent', borderRadius: 4, cursor: 'pointer', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
  return (
    <div data-component="EquipmentPage" style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth: 1144, margin: '0 auto', padding: '12px 32px 80px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 style={h1}>معداتي</h1>
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{`${total} قطعة · مشتركة بين كل المشاريع. الدور يحدد في أي قائمة تظهر القطعة داخل بطاقة اللقطة.`}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 260 }}><Search value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في المعدات…" /></div>
            <label className="h-surface" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
              <Icon name="upload" size={16} />استيراد من ملف
              <input type="file" accept=".json,application/json" onChange={onImportFile} style={{ display: 'none' }} />
            </label>
            <Button variant="primary" size="sm" icon="plus" onClick={() => setEdit({ id: null, name: '', brand: '', model: '', use: '', qty: 1, role: 'other', category: cats[0] ?? '', icon: 'box' })}>قطعة</Button>
          </div>
        </div>
        {groups.map((g) => (
          <section key={g.cat} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: 8, marginTop: 12 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 20 }}>{g.cat}</h2>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{`${g.items.reduce((a, i) => a + ((i.qty as number) || 1), 0)} قطعة`}</span>
            </div>
            {g.items.map((it) => (
              <div key={it.id} data-testid="eq-row" className="h-surface" style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1.4fr) minmax(0,1.2fr) 48px 120px 76px', alignItems: 'center', gap: 16, padding: '10px 8px', borderBottom: '1px solid var(--color-border-subtle)', borderRadius: 4 }}>
                <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--color-surface-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-700)' }}><EqIcon name={(it.icon as string) || 'box'} /></span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{it.name as string}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[it.brand, it.model].filter(Boolean).join(' · ') || '—'}</span>
                </div>
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{(it.use as string) || ''}</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{`×${(it.qty as number) || 1}`}</span>
                <span><Badge tone="accent">{roles[it.role as string] ?? (it.role as string)}</Badge></span>
                <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                  <button title="تعديل" className="h-strong" style={cell} onClick={() => setEdit({ id: it.id, name: it.name as string, brand: (it.brand as string) || '', model: (it.model as string) || '', use: (it.use as string) || '', qty: (it.qty as number) || 1, role: it.role as string, category: it.category as string, icon: (it.icon as string) || 'box' })}><Icon name="edit" size={15} /></button>
                  <button title="حذف" className="h-strong" style={cell} onClick={() => askConfirm({ title: 'حذف القطعة؟', msg: `ستُحذف «${it.name}» من معداتي ولن تظهر في قوائم اللقطات.`, ok: 'حذف', danger: true, onOk: () => commit([{ op: 'delete', entity: 'equipment', id: it.id }], { history: 'حذف قطعة' }) })}><Icon name="trash" size={15} /></button>
                </div>
              </div>
            ))}
          </section>
        ))}
        {!groups.length && <EmptyState icon="search" title="لا نتائج" description="جرّب كلمة أخرى، مثل اسم الشركة أو الموديل." />}
      </div>
      {edit && (
        <Overlay z={62}>
          <div data-component="EquipmentEditDialog" style={{ width: 520, maxWidth: '100%', background: 'var(--color-bg)', borderRadius: 14, boxShadow: 'var(--shadow-lift)', padding: 26, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26 }}>{edit.id ? 'تعديل قطعة' : 'قطعة جديدة'}</h2>
            <Field label="الاسم"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="الشركة"><Input value={edit.brand} onChange={(e) => setEdit({ ...edit, brand: e.target.value })} /></Field>
              <Field label="الموديل"><Input value={edit.model} onChange={(e) => setEdit({ ...edit, model: e.target.value })} /></Field>
            </div>
            <Field label="الاستخدام"><Input value={edit.use} onChange={(e) => setEdit({ ...edit, use: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: 12 }}>
              <Field label="العدد"><Input type="number" value={edit.qty} onChange={(e) => setEdit({ ...edit, qty: Number(e.target.value) || 1 })} /></Field>
              <Field label="الدور"><Select options={Object.keys(roles).map((k) => ({ value: k, label: roles[k] }))} value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} /></Field>
              <Field label="الفئة"><Select options={cats.map((c) => ({ value: c, label: c }))} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <Button variant="primary" onClick={save}>حفظ</Button>
              <Button variant="ghost" onClick={() => setEdit(null)}>إلغاء</Button>
            </div>
          </div>
        </Overlay>
      )}
      {imp && (
        <Overlay z={62}>
          <div data-component="EquipmentImportPreview" style={{ width: 620, maxWidth: '100%', maxHeight: '100%', background: 'var(--color-bg)', borderRadius: 14, boxShadow: 'var(--shadow-lift)', padding: 26, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26 }}>معاينة الاستيراد</h2>
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{`${imp.length} قطعة في الملف — ستُضاف ${imp.filter((i) => i.isNew).length} جديدة، والموجودة تُتجاهل.`}</span>
            <div style={{ flex: 1, minHeight: 0, maxHeight: 380, overflowY: 'auto', border: '1px solid var(--color-border-subtle)', borderRadius: 8 }}>
              {imp.map((r, k) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 14, fontWeight: 700 }}>{r.name as string}</span><span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{[r.brand, r.model].filter(Boolean).join(' · ')}</span></div>
                  <Badge tone={r.isNew ? 'accent' : 'outline'}>{r.isNew ? 'جديدة' : 'موجودة'}</Badge>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="primary" onClick={confirmImport}>تأكيد الاستيراد</Button>
              <Button variant="ghost" onClick={() => setImp(null)}>إلغاء</Button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

export function Overlay({ children, z = 60, onClose }: { children: React.ReactNode; z?: number; onClose?: () => void }) {
  return (
    <div data-print-scroll="1" onClick={(e) => { if (onClose && e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: z, background: 'rgba(20,18,16,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
      {children}
    </div>
  );
}

// ---------- trash ----------

interface TrashItem { id: string; projectId: string | null; kind: string; refId: string; label: string; deletedAt: number; extra: number; projectName: string }
const KIND: Record<string, string> = { scenes: 'مشهد', shots: 'لقطة', notes: 'ملاحظة', projects: 'مشروع', characters: 'شخصية', locations: 'موقع', moodboards: 'لوحة مزاج' };

export function TrashPage() {
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const load = () => api<TrashItem[]>('/api/trash').then(setItems).catch(() => setItems([]));
  useEffect(() => {
    void load();
  }, []);
  const restore = (t: TrashItem) => {
    const ok = commit([{ op: 'restore', trashId: t.id }], { history: 'استعادة', inverse: [{ op: 'delete', entity: t.kind as Op extends { entity: infer E } ? E : never, id: t.refId, label: t.label }] });
    if (!ok) return;
    toast('استُعيد العنصر');
    void engine.idle().then(load);
  };
  const purge = (t: TrashItem) =>
    askConfirm({
      title: 'حذف نهائي؟', msg: 'لا يمكن التراجع عن الحذف النهائي.', ok: 'حذف نهائي', danger: true,
      onOk: async () => {
        try {
          await api(`/api/trash/${encodeURIComponent(t.id)}`, { method: 'DELETE' });
          toast('حُذف نهائياً');
        } catch {
          toast('تعذّر الحذف', { tone: 'danger' });
        }
        void load();
      },
    });
  return (
    <div data-component="TrashPage" style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '12px 32px 80px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={h1}>سلة المحذوفات</h1>
          <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>تبقى العناصر 30 يوماً ثم تُحذف نهائياً. المشهد يُستعاد بلقطاته.</span>
        </div>
        {(items ?? []).map((t) => {
          const left = daysLeft(t.deletedAt);
          return (
            <div key={t.id} data-testid="trash-item" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', border: '1px solid var(--color-border-subtle)', borderRadius: 8, background: 'var(--color-bg)' }}>
              <Badge tone="outline">{KIND[t.kind] ?? t.kind}</Badge>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 16 }}>{t.label}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{`${t.projectName} · حُذف ${fmtDate(t.deletedAt)}`}</span>
                {t.extra > 0 && <span style={{ fontSize: 12, color: 'var(--tan-600)' }}>{`يُستعاد مع ${t.extra} ${t.extra === 1 ? 'لقطة' : 'لقطات'}`}</span>}
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: left <= 5 ? 'var(--color-danger)' : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{`باقي ${left} يوماً`}</span>
              <Button variant="outline" size="sm" icon="repeat" onClick={() => restore(t)} data-testid="trash-restore">استعادة</Button>
              <Button variant="ghost" size="sm" icon="trash" onClick={() => purge(t)}>حذف نهائي</Button>
            </div>
          );
        })}
        {items && !items.length && <EmptyState icon="trash" title="السلة فارغة" description="العناصر المحذوفة تظهر هنا لمدة 30 يوماً." />}
      </div>
    </div>
  );
}

// ---------- settings ----------

export function SettingsPage() {
  const theme = useApp((s) => s.theme);
  const settings = useApp((s) => s.settings);
  const [pw, setPw] = useState({ cur: '', next: '', conf: '', err: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!pw.cur) return setPw({ ...pw, err: 'أدخل كلمة السر الحالية' });
    if (pw.next.length < 8) return setPw({ ...pw, err: 'كلمة السر الجديدة 8 أحرف على الأقل' });
    if (pw.next !== pw.conf) return setPw({ ...pw, err: 'التأكيد لا يطابق كلمة السر الجديدة' });
    setBusy(true);
    try {
      await api('/api/auth/password', { method: 'POST', json: { current: pw.cur, next: pw.next } });
      setPw({ cur: '', next: '', conf: '', err: '' });
      toast('تغيّرت كلمة السر — خرجت الأجهزة الأخرى');
    } catch (e) {
      setPw({ ...pw, err: e instanceof ApiError && e.status === 401 ? 'كلمة السر الحالية غير صحيحة' : 'تعذّر الحفظ، حاول مرة أخرى' });
    } finally {
      setBusy(false);
    }
  };
  const bk = settings?.lastBackupAt ? new Date(settings.lastBackupAt) : null;
  let backup = 'لم تُؤخذ نسخة احتياطية بعد';
  if (bk) {
    const today = new Date().toDateString() === bk.toDateString();
    const h = bk.getHours(), hh = h % 12 || 12;
    backup = `آخر نسخة احتياطية: ${today ? 'اليوم' : fmtDate(bk.getTime())} ${hh}:${pad2(bk.getMinutes())} ${h < 12 ? 'ص' : 'م'}`;
  }
  const on = (k: 'cur' | 'next' | 'conf') => (e: React.ChangeEvent<HTMLInputElement>) => setPw({ ...pw, [k]: e.target.value, err: '' });
  return (
    <div data-component="SettingsPage" style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '12px 32px 80px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <h1 style={h1}>الإعدادات</h1>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 20 }}>تغيير كلمة السر</h2>
            <Field label="كلمة السر الحالية"><Input type="password" value={pw.cur} onChange={on('cur')} autoComplete="current-password" /></Field>
            <Field label="كلمة السر الجديدة"><Input type="password" value={pw.next} onChange={on('next')} autoComplete="new-password" /></Field>
            <Field label="تأكيد كلمة السر"><Input type="password" value={pw.conf} onChange={on('conf')} autoComplete="new-password" /></Field>
            {pw.err && <span style={{ fontSize: 13, color: 'var(--color-danger)', fontWeight: 600 }}>{pw.err}</span>}
            <div style={{ display: 'flex' }}><Button variant="primary" size="sm" onClick={() => void save()} loading={busy}>حفظ كلمة السر</Button></div>
          </div>
        </Card>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 20 }}>المظهر</h2>
            <div style={{ display: 'flex', gap: 24 }}>
              <Radio checked={theme === 'light'} onChange={() => void setTheme('light')} label="فاتح" />
              <Radio checked={theme === 'dark'} onChange={() => void setTheme('dark')} label="داكن" />
            </div>
          </div>
        </Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--color-text-muted)' }}><Icon name="clock" size={16} />{`${backup} · يتم النسخ يومياً على الخادم`}</div>
      </div>
    </div>
  );
}
