import { useState } from 'react';
import { duplicateProject, updateProject } from '../app/projects';
import { setState, useApp, useProject } from '../app/state';
import { coverOf, moodHex, type PProject } from '../data/project';
import { Button, Checkbox, Field, Icon, Input } from '../ds/ds';
import { AR, ASPECTS, STAGE_LABEL, STAGE_ORDER } from '../lib/constants';
import { frameBg, type Img } from '../lib/util';

const close = () => setState({ modal: null });
const dialog: React.CSSProperties = { maxWidth: '100%', maxHeight: '100%', overflowY: 'auto', background: 'var(--color-bg)', borderRadius: 14, boxShadow: 'var(--shadow-lift)', padding: 28 };
const xBtn: React.CSSProperties = { width: 36, height: 36, border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const lbl: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)' };

/** Stage chips (فكرة، تحضير، تصوير، مونتاج، منتهي). */
export function StagePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {STAGE_ORDER.map((s) => {
        const on = value === s;
        return (
          <button key={s} type="button" data-testid={`stage-${s}`} aria-pressed={on} onClick={() => onChange(s)}
            style={{ height: 34, padding: '0 14px', borderRadius: 999, border: `1px solid ${on ? 'transparent' : 'var(--color-border)'}`, background: on ? 'var(--color-inverse-bg)' : 'transparent', color: on ? 'var(--color-inverse-text)' : 'var(--color-text)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {STAGE_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}

export function AspectPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
      {ASPECTS.map((a) => {
        const r = AR[a], on = value === a;
        return (
          <button key={a} type="button" data-testid={`aspect-${a}`} onClick={() => onChange(a)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 8, height: 84, padding: 10, border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border)'}`, background: on ? 'var(--color-accent-soft)' : 'transparent', borderRadius: 8, cursor: 'pointer', color: 'var(--color-text)', fontSize: 13, fontWeight: 600 }}>
            <span style={{ width: r >= 1 ? 46 : Math.round(34 * r), height: r >= 1 ? Math.round(46 / r) : 34, border: '1.5px solid var(--color-text)', borderRadius: 2 }} />
            {a}
          </button>
        );
      })}
    </div>
  );
}

/** Every image of the project, once (cover candidates). */
function projectImages(p: PProject): { img: Img; hex: string }[] {
  const seen = new Set<string>();
  const out: { img: Img; hex: string }[] = [];
  const add = (img: Img | null | undefined, hex: string) => {
    if (!img || !img.linkId || seen.has(img.imageId)) return;
    seen.add(img.imageId);
    out.push({ img, hex });
  };
  for (const sc of p.scenes) for (const sh of sc.shots) for (const i of sh.images) add(i, moodHex(sc.mood));
  for (const l of [...p.library.locations, ...p.library.characters, ...p.library.moodboards]) for (const i of l.images) add(i, '#d2a06a');
  return out;
}

/** «إعدادات المشروع…» (UPDATE-1 أ1). Every change saves at once and is undoable. */
export function ProjectSettingsDialog() {
  const p = useProject();
  const [name, setName] = useState(p?.name ?? '');
  if (!p) return null;
  const imgs = projectImages(p);
  const auto = p.scenes.flatMap((s) => s.shots).find((s) => s.images.length);
  const autoImg = auto ? coverOf(auto) : null;
  const tile = (on: boolean): React.CSSProperties => ({ position: 'relative', aspectRatio: '16 / 10', borderRadius: 6, border: 'none', cursor: 'pointer', boxShadow: on ? '0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent)' : 'none', padding: 0 });
  return (
    <div data-component="ProjectSettingsDialog" data-testid="project-settings" style={{ ...dialog, width: 640, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 30 }}>إعدادات المشروع</h2>
        <button title="إغلاق" onClick={close} style={xBtn}><Icon name="x" size={18} /></button>
      </div>
      <Field label="الاسم">
        <Input value={name} data-testid="ps-name" onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name.trim() !== p.name && updateProject({ name: name.trim() }, 'إعادة تسمية المشروع')}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      </Field>
      <Field label="العميل">
        <Input value={p.client} data-testid="ps-client" placeholder="اسم العميل" onChange={(e) => updateProject({ client: e.target.value }, 'تعديل المشروع', 'client')} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="يوم التصوير (اختياري)">
          <div style={{ display: 'flex', gap: 6 }}>
            <Input type="date" value={p.shootDate ?? ''} data-testid="ps-date" onChange={(e) => updateProject(e.target.value ? { shootDate: e.target.value } : { shootDate: null, shootTime: null })} style={{ flex: 1 }} />
            {p.shootDate && <button title="بدون يوم" onClick={() => updateProject({ shootDate: null, shootTime: null })} style={xBtn}><Icon name="x" size={15} /></button>}
          </div>
        </Field>
        <Field label="وقت البداية (اختياري)">
          <Input type="time" value={p.shootTime ?? ''} disabled={!p.shootDate} data-testid="ps-time" onChange={(e) => updateProject({ shootTime: e.target.value || null })} />
        </Field>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={lbl}>المرحلة</span>
        <StagePicker value={p.stage} onChange={(v) => updateProject({ stage: v })} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={lbl}>نسبة الإطار — الصور تُقص للعرض فقط، الأصلية لا تتغيّر</span>
        <AspectPicker value={p.aspect} onChange={(v) => updateProject({ aspect: v })} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={lbl}>صورة الغلاف</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
          <button data-testid="cover-auto" title="تلقائي: أول صورة في أول لقطة" onClick={() => updateProject({ coverImageId: null }, 'صورة الغلاف')} style={{ ...tile(!p.coverImageId), background: frameBg(autoImg, '#d2a06a') }}>
            <span style={{ position: 'absolute', inset: 'auto 0 0 0', padding: '3px 0', fontSize: 11, fontWeight: 700, background: 'rgba(20,18,16,.7)', color: '#fdfcfa', borderRadius: '0 0 6px 6px' }}>تلقائي</span>
          </button>
          {imgs.map(({ img, hex }) => (
            <button key={img.imageId} data-testid="cover-option" onClick={() => updateProject({ coverImageId: img.imageId }, 'صورة الغلاف')} style={{ ...tile(p.coverImageId === img.imageId), background: frameBg(img, hex) }} />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex' }}><Button variant="primary" onClick={close} data-testid="ps-done">تم</Button></div>
    </div>
  );
}

export function DuplicateProjectDialog() {
  const p = useProject();
  const [keep, setKeep] = useState(false);
  const busy = useApp((s) => s.offline);
  if (!p) return null;
  return (
    <div data-component="DuplicateProjectDialog" style={{ ...dialog, width: 460, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26 }}>تكرار المشروع</h2>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: 'var(--color-text-muted)' }}>{`نسخة كاملة باسم «${p.name} (نسخة)»: المشاهد واللقطات والمكتبة واللوحة. الصور نفسها بدون نسخ، والمرحلة «تحضير» بدون يوم تصوير.`}</p>
      <Checkbox checked={keep} onChange={setKeep} label="إبقاء حالات اللقطات (وإلا ترجع كلها «مخططة»)" />
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <Button variant="primary" disabled={busy} onClick={() => void duplicateProject(p.id, keep)} data-testid="dup-confirm">تكرار</Button>
        <Button variant="ghost" onClick={close}>إلغاء</Button>
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ['تراجع / إعادة', 'Ctrl Z · Ctrl Shift Z'],
  ['نسخ · قص · لصق', 'Ctrl C · Ctrl X · Ctrl V'],
  ['تكرار', 'Ctrl D'],
  ['تحديد الكل', 'Ctrl A'],
  ['إطار حول المحدد', 'Ctrl G'],
  ['للأمام · للخلف', '] · ['],
  ['للأعلى · للأسفل', 'Ctrl ] · Ctrl ['],
  ['تحريك 1px · 24px', 'الأسهم · Shift + الأسهم'],
  ['فتح المحدد', 'Enter'],
  ['إعادة التسمية', 'F2'],
  ['حذف', 'Delete'],
  ['تحريك اللوحة', 'مسافة + سحب'],
  ['إيقاف المحاذاة مؤقتاً', 'Alt أثناء السحب'],
  ['ورقة الاختصارات', '?'],
];

export function ShortcutsDialog() {
  return (
    <div data-component="ShortcutsDialog" data-testid="shortcuts" style={{ ...dialog, width: 520, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26 }}>اختصارات لوحة المفاتيح</h2>
        <button title="إغلاق" onClick={close} style={xBtn}><Icon name="x" size={18} /></button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {SHORTCUTS.map(([a, k]) => (
          <div key={a} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 2px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: 14 }}>
            <span style={{ fontWeight: 600 }}>{a}</span>
            <span style={{ direction: 'ltr', color: 'var(--color-text-muted)', fontSize: 13 }}>{k}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
