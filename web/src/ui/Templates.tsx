import { useEffect, useRef, useState } from 'react';
import { openProject } from '../app/actions';
import { deleteProject, renameProject } from '../app/projects';
import { saveTemplate, templateCounts, type TemplateSummary } from '../app/templates';
import { openMenu, setState, useApp, type MenuEntry } from '../app/state';
import { moodHex } from '../data/project';
import { Button, Icon, Input } from '../ds/ds';
import { frameBg } from '../lib/util';

/**
 * Saved templates on screen (UPDATE-3 §7, templates.html): the «قالب» badge, «قوالبي» on Home
 * (project templates as dashed cards, scene templates as small buttons), and «احفظ كقالب».
 */

export function TemplateBadge() {
  return <span data-testid="tpl-badge" style={{ height: 20, padding: '0 8px', borderRadius: 999, background: 'var(--color-accent-soft)', color: 'var(--tan-600)', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', flexShrink: 0 }}>قالب</span>;
}

const tplCover = (t: TemplateSummary) => frameBg(t.coverImageId ? { imageId: t.coverImageId, placeholder: t.coverPlaceholder } : null, moodHex(t.coverMood));

/** ⋯ of a template: open (it edits like any project), a new project from it, rename, delete to the trash. */
function templateMenu(t: TemplateSummary, rename: () => void): MenuEntry[] {
  return [
    { label: 'فتح وتعديل', icon: 'edit', run: () => void openProject(t.id), testid: 'tm-open' },
    ...(t.templateKind === 'project' ? [{ label: 'مشروع جديد من القالب', icon: 'plus', run: () => setState({ modal: 'newProject', npTemplate: t.id }), testid: 'tm-new' }] : []),
    { label: 'إعادة التسمية', icon: 'edit', run: rename, testid: 'tm-rename' },
    'sep',
    { label: 'حذف', icon: 'trash', danger: true, run: () => deleteProject(t.id, t.name), testid: 'tm-delete' },
  ];
}

function RenameInput({ name, id, done, style }: { name: string; id: string; done: () => void; style?: React.CSSProperties }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTimeout(() => (ref.current?.focus(), ref.current?.select()), 0);
  }, []);
  return (
    <input ref={ref} defaultValue={name} data-testid="tpl-name-input" onClick={(e) => e.stopPropagation()}
      onBlur={(e) => (renameProject(e.currentTarget.value, id), done())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        if (e.key === 'Escape') (e.stopPropagation(), (e.currentTarget.value = name), done());
      }}
      style={{ fontWeight: 700, fontSize: 15, padding: '2px 6px', border: '1px solid var(--color-accent)', borderRadius: 6, background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', minWidth: 0, ...style }} />
  );
}

const dots = (e: React.MouseEvent, items: MenuEntry[]) => {
  e.stopPropagation();
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  openMenu(r.right, r.bottom + 4, items, 'template-menu');
};

/** «قوالبي» on Home, under «مشاريعي»; hidden while there are no templates (§7.1). */
export function MyTemplates({ list, mobile }: { list: TemplateSummary[]; mobile?: boolean }) {
  const offline = useApp((s) => s.offline);
  const [renaming, setRenaming] = useState<string | null>(null);
  const projects = list.filter((t) => t.templateKind === 'project');
  const scenes = list.filter((t) => t.templateKind === 'scene');
  if (!list.length) return null;
  const head = (title: string, sub: string, small = false) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
      <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: small ? 22 : mobile ? 22 : 26 }}>{title}</h3>
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{sub}</span>
    </div>
  );
  return (
    <div data-testid="my-templates" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {projects.length > 0 && (
        <section>
          {head('قوالبي', 'ابدأ مشروع من شغل سويته قبل')}
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(auto-fill,minmax(260px,1fr))', gap: mobile ? 10 : 16 }}>
            {projects.map((t) => (
              <div key={t.id} data-testid="template-card" data-project-id={t.id} onClick={() => renaming !== t.id && void openProject(t.id)}
                style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', border: '1px dashed var(--color-accent)', borderRadius: 14, boxShadow: 'var(--shadow-card)', overflow: 'hidden', cursor: 'pointer', position: 'relative' }}>
                <div style={{ height: mobile ? 84 : 120, background: tplCover(t), opacity: 0.85, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 10, insetInlineStart: 10, insetInlineEnd: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <TemplateBadge />
                    <button title="خيارات" aria-label="خيارات" data-testid="template-dots" disabled={offline} onClick={(e) => dots(e, templateMenu(t, () => setRenaming(t.id)))}
                      style={{ width: mobile ? 44 : 30, height: mobile ? 44 : 30, margin: mobile ? -7 : 0, borderRadius: '50%', border: 'none', background: 'rgba(20,18,16,.55)', color: '#fdfcfa', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="more" size={16} /></button>
                  </div>
                </div>
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {renaming === t.id ? <RenameInput name={t.name} id={t.id} done={() => setRenaming(null)} />
                    : <b data-testid="template-name" style={{ fontSize: mobile ? 14 : 16, lineHeight: 1.35 }}>{t.name}</b>}
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{templateCounts(t)}</span>
                </div>
              </div>
            ))}
            {!mobile && (
              <div style={{ minHeight: 186, border: '1px dashed var(--color-border)', borderRadius: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--color-text-muted)', fontWeight: 700, fontSize: 15 }}>
                <Icon name="bookmark" size={22} />احفظ أي مشروع كقالب<span style={{ fontWeight: 400, fontSize: 13 }}>من ⋯ على المشروع</span>
              </div>
            )}
          </div>
        </section>
      )}
      {scenes.length > 0 && (
        <section>
          {head('قوالب المشاهد', 'تضيفها لأي مشروع من «+ مشهد»', true)}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {scenes.map((t) => (
              <div key={t.id} data-testid="scene-template" data-project-id={t.id} onClick={() => renaming !== t.id && void openProject(t.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '6px 6px 6px 14px', paddingInlineStart: 8, border: '1px solid var(--color-border-subtle)', borderRadius: 12, background: 'var(--color-surface)', fontWeight: 700, fontSize: 14, cursor: 'pointer', maxWidth: '100%' }}>
                <i style={{ width: 42, height: 30, borderRadius: 6, display: 'block', background: tplCover(t), flexShrink: 0 }} />
                {renaming === t.id ? <RenameInput name={t.name} id={t.id} done={() => setRenaming(null)} style={{ fontSize: 14 }} />
                  : <span data-testid="template-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>}
                <button title="خيارات" aria-label="خيارات" data-testid="template-dots" disabled={offline} onClick={(e) => dots(e, templateMenu(t, () => setRenaming(t.id)))}
                  style={{ width: mobile ? 44 : 32, height: mobile ? 44 : 32, border: 'none', borderRadius: 8, background: 'transparent', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><Icon name="more" size={16} /></button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** «احفظ كقالب» (templates.html #state=save): the name, and what is kept and what isn't. */
export function SaveTemplateDialog() {
  const t = useApp((s) => s.tplSave);
  const offline = useApp((s) => s.offline);
  const [name, setName] = useState(t?.name ?? '');
  if (!t) return null;
  const scene = !!t.sceneId;
  const yes = scene
    ? ['المشهد ولقطاته بكل تفاصيلها', 'مخطط التصوير والصور', 'الشخصيات والموقع المربوطة به']
    : ['المشاهد واللقطات بكل تفاصيلها', 'المخططات واللوحة الحرة', 'الشخصيات والمواقع ولوحات المزاج والصور'];
  const no = scene ? ['حالة اللقطات ترجع «مخططة»'] : ['العميل وتاريخ التصوير ما ينحفظون', 'حالة اللقطات ترجع «مخططة»'];
  const mark = (on: boolean) => on
    ? <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--color-accent)', color: '#141210', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="check" size={12} /></span>
    : <span style={{ width: 20, height: 20, borderRadius: '50%', border: '1.5px solid var(--color-border)', display: 'inline-flex', flexShrink: 0 }} />;
  const close = () => setState({ modal: null, tplSave: null });
  return (
    <div data-component="SaveTemplateDialog" data-testid="save-template" style={{ width: 560, maxWidth: '100%', maxHeight: '100%', overflowY: 'auto', background: 'var(--color-bg)', borderRadius: 16, boxShadow: 'var(--shadow-lift)', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 900 }}>{scene ? 'احفظ المشهد كقالب' : 'احفظ كقالب'}</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
          {scene ? `نسخة من المشهد «${t.name}» تضيفها لأي مشروع من «+ مشهد». المشهد الأصلي ما يتغيّر.` : `نسخة من «${t.name.replace(/^قالب: /, '')}» تبدأ منها مشاريع جديدة. المشروع الأصلي ما يتغيّر.`}
        </p>
      </div>
      <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="tpl-name" aria-label="اسم القالب" autoFocus
        onKeyDown={(e) => e.key === 'Enter' && name.trim() && void saveTemplate(name)} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
        {yes.map((l) => <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{mark(true)}{l}</div>)}
        {no.map((l) => <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{mark(false)}{l}</div>)}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" icon="bookmark" disabled={offline || !name.trim()} onClick={() => void saveTemplate(name)} data-testid="tpl-save">احفظ القالب</Button>
        <Button variant="ghost" onClick={close}>إلغاء</Button>
      </div>
    </div>
  );
}
