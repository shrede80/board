import { useEffect, useState } from 'react';
import { createProject, openProject, undo } from '../app/actions';
import { exportProjectZip, exportXlsx, importProjectZip, printPdf, readProjectZip, shotCols, shotRows, type ImportPreview } from '../app/exporters';
import { dismissToast, setState, useApp, useEquipment, useProject } from '../app/state';
import { api } from '../data/api';
import { allShots, camLine, coverOf, eqName, moodHex, moveLine, sceneDur } from '../data/project';
import { Badge, Button, Card, Checkbox, Field, Icon, Input, Radio, Table, Toast } from '../ds/ds';
import { TEMPLATES } from '../lib/constants';
import { fmtDate, frameBg, imageUrl, mmss, pad2, type Img } from '../lib/util';
import { Overlay } from './Pages';
import { AspectPicker, DuplicateProjectDialog, ProjectSettingsDialog, ShortcutsDialog, StagePicker } from './ProjectDialogs';
import { STAGE_LABEL } from '../lib/constants';

const close = () => setState({ modal: null });
const dialog: React.CSSProperties = { maxWidth: '100%', maxHeight: '100%', overflowY: 'auto', background: 'var(--color-bg)', borderRadius: 14, boxShadow: 'var(--shadow-lift)', padding: 28 };
const xBtn: React.CSSProperties = { width: 36, height: 36, border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' };

export function Modals() {
  const modal = useApp((s) => s.modal);
  if (!modal) return null;
  return (
    <Overlay onClose={close}>
      {modal === 'projects' && <ProjectSwitcher />}
      {modal === 'newProject' && <NewProjectDialog />}
      {modal === 'export' && <ExportDialog />}
      {modal === 'projectSettings' && <ProjectSettingsDialog />}
      {modal === 'duplicateProject' && <DuplicateProjectDialog />}
      {modal === 'shortcuts' && <ShortcutsDialog />}
    </Overlay>
  );
}

interface Summary { id: string; name: string; aspect: string; updatedAt: number; scenes: number; shots: number; durationS: number; coverImageId: string | null; coverPlaceholder: Img['placeholder']; coverMood: string | null; client: string; stage: string; archived: boolean }

function ProjectSwitcher() {
  const pid = useApp((s) => s.projectId);
  const [list, setList] = useState<Summary[] | null>(null);
  useEffect(() => {
    api<Summary[]>('/api/projects').then(setList).catch(() => setList([]));
  }, []);
  return (
    <div data-component="ProjectSwitcher" style={{ ...dialog, width: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 30 }}>المشاريع</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button variant="primary" size="sm" icon="plus" onClick={() => setState({ modal: 'newProject' })} data-testid="new-project">مشروع جديد</Button>
          <button title="إغلاق" onClick={close} style={xBtn}><Icon name="x" size={18} /></button>
        </div>
      </div>
      {[false, true].map((arch) => {
        const items = (list ?? []).filter((x) => !!x.archived === arch);
        if (arch && !items.length) return null;
        return (
      <div key={String(arch)}>
      {arch && <h3 style={{ margin: '26px 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--color-text-muted)' }}>{`المؤرشفة (${items.length})`}</h3>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 16, opacity: arch ? 0.75 : 1 }}>
        {items.map((pj) => {
          const cur = pj.id === pid;
          const cover: Img | null = pj.coverImageId ? { imageId: pj.coverImageId, placeholder: pj.coverPlaceholder } : null;
          return (
            <button key={pj.id} data-testid="project-card" onClick={() => (cur ? close() : void openProject(pj.id))} style={{ display: 'flex', flexDirection: 'column', textAlign: 'right', padding: 0, border: `1px solid ${cur ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`, borderRadius: 14, overflow: 'hidden', background: 'var(--color-bg)', cursor: 'pointer', color: 'var(--color-text)', boxShadow: 'var(--shadow-card)' }}>
              <div style={{ height: 130, width: '100%', background: frameBg(cover, cover ? moodHex(pj.coverMood) : '#3a342c'), position: 'relative' }}>
                {cur && <span style={{ position: 'absolute', top: 10, insetInlineStart: 10 }}><Badge tone="accent">مفتوح الآن</Badge></span>}
                <span style={{ position: 'absolute', top: 10, insetInlineEnd: 10 }}><Badge tone="dark">{STAGE_LABEL[pj.stage] ?? ''}</Badge></span>
              </div>
              <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 17, lineHeight: 1.35 }}>{pj.name}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{[pj.client, `${pj.scenes} مشاهد`, mmss(pj.durationS), pj.aspect].filter(Boolean).join(' · ')}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{`آخر تعديل ${fmtDate(pj.updatedAt)}`}</span>
              </div>
            </button>
          );
        })}
      </div>
      </div>
        );
      })}
    </div>
  );
}

function NewProjectDialog() {
  const [np, setNp] = useState({ name: '', aspect: '16:9', template: 'ad', client: '', shootDate: '', shootTime: '', stage: 'prep' });
  return (
    <div data-component="NewProjectDialog" style={{ ...dialog, width: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 30 }}>مشروع جديد</h2>
      <Field label="اسم المشروع"><Input value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} placeholder="مثلاً: إعلان مطعم — الرياض" data-testid="np-name" /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.8fr', gap: 12 }}>
        <Field label="العميل (اختياري)"><Input value={np.client} onChange={(e) => setNp({ ...np, client: e.target.value })} placeholder="اسم العميل" data-testid="np-client" /></Field>
        <Field label="يوم التصوير (اختياري)"><Input type="date" value={np.shootDate} onChange={(e) => setNp({ ...np, shootDate: e.target.value })} data-testid="np-date" /></Field>
        <Field label="الوقت"><Input type="time" value={np.shootTime} disabled={!np.shootDate} onChange={(e) => setNp({ ...np, shootTime: e.target.value })} /></Field>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)' }}>المرحلة</span>
        <StagePicker value={np.stage} onChange={(v) => setNp({ ...np, stage: v })} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)' }}>نسبة الإطار</span>
        <AspectPicker value={np.aspect} onChange={(a) => setNp({ ...np, aspect: a })} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)' }}>قالب البداية — مشاهد هيكلية فارغة يمكن حذفها</span>
        {TEMPLATES.map((t) => {
          const on = np.template === t.id;
          return (
            <button key={t.id} data-testid={`tpl-${t.id}`} onClick={() => setNp({ ...np, template: t.id })} style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'right', padding: '12px 14px', border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border)'}`, background: on ? 'var(--color-accent-soft)' : 'transparent', borderRadius: 8, cursor: 'pointer', color: 'var(--color-text)' }}>
              <span style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 16 }}>{t.label}</span>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{t.scenes.length ? t.scenes.join(' · ') : 'بدون مشاهد'}</span>
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="primary" onClick={() => createProject(np)} data-testid="np-create">إنشاء المشروع</Button>
        <Button variant="ghost" onClick={close}>إلغاء</Button>
      </div>
    </div>
  );
}

function ExportDialog() {
  const p = useProject();
  const eq = useEquipment();
  const tab = useApp((s) => s.exportTab);
  const scope = useApp((s) => s.exportScope);
  const sel = useApp((s) => s.exportSel);
  const [busy, setBusy] = useState('');
  const [pre, setPre] = useState<ImportPreview | null>(null);
  const [impErr, setImpErr] = useState('');
  if (!p) return null;
  const shots = allShots(p).filter((x) => scope === 'all' || sel.includes(x.sc.id));
  const pages: (typeof shots)[] = [];
  for (let i = 0; i < shots.length; i += 4) pages.push(shots.slice(i, i + 4));
  const nScenes = new Set(shots.map((x) => x.sc.id)).size;
  const allIds = p.scenes.map((s) => s.id);
  const opts = [['pdf', 'ستوري بورد PDF', 'A4 أفقي بأسلوب لوحة القصة المرئية', 'film'], ['table', 'قائمة اللقطات', 'جدول — PDF أو Excel', 'file'], ['project', 'نسخة المشروع كاملة', 'ملف واحد بكل البيانات والصور', 'folder']] as const;
  const imgCount = p.scenes.reduce((a, s) => a + s.shots.reduce((b, h) => b + h.images.length, 0), 0) + p.library.locations.reduce((a, l) => a + l.images.length, 0) + p.library.moodboards.reduce((a, m) => a + m.images.length, 0) + p.library.characters.reduce((a, c) => a + c.images.length, 0);
  const nShots = allShots(p).length;
  const summary = [['المشاهد', p.scenes.length], ['اللقطات', nShots], ['الصور', imgCount], ['عناصر المكتبة', p.library.characters.length + p.library.locations.length + p.library.moodboards.length], ['المدة', mmss(p.scenes.reduce((a, s) => a + sceneDur(s), 0))]];
  const run = async (label: string, f: () => Promise<void>) => {
    setBusy(label);
    try {
      await f();
    } catch (e) {
      setImpErr(e instanceof Error && /[؀-ۿ]/.test(e.message) ? e.message : 'تعذّرت العملية، حاول مرة أخرى.');
    } finally {
      setBusy('');
    }
  };
  return (
    <div data-component="ExportDialog" data-print-scroll="1" style={{ width: 1180, maxWidth: '100%', height: '100%', maxHeight: 820, background: 'var(--color-bg)', borderRadius: 14, boxShadow: 'var(--shadow-lift)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--color-border-subtle)' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28 }}>تصدير</h2>
        <button title="إغلاق" onClick={close} style={xBtn}><Icon name="x" size={18} /></button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ width: 290, flexShrink: 0, borderInlineEnd: '1px solid var(--color-border-subtle)', padding: 18, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          {opts.map(([v, t, d, ic]) => (
            <button key={v} data-testid={`export-tab-${v}`} onClick={() => setState({ exportTab: v })} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'right', padding: 14, border: `1px solid ${tab === v ? 'var(--color-accent)' : 'var(--color-border)'}`, background: tab === v ? 'var(--color-accent-soft)' : 'var(--color-bg)', borderRadius: 8, cursor: 'pointer', color: 'var(--color-text)' }}>
              <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--color-surface-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--ink-700)' }}><Icon name={ic} size={17} /></span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: 15, fontWeight: 700 }}>{t}</span><span style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{d}</span></span>
            </button>
          ))}
          {tab === 'pdf' && (
            <div style={{ borderTop: '1px solid var(--color-border-subtle)', marginTop: 6, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Radio checked={scope === 'all'} onChange={() => setState({ exportScope: 'all' })} label="كل المشاهد" />
              <Radio checked={scope !== 'all'} onChange={() => setState({ exportScope: 'some', exportSel: sel.length ? sel : allIds })} label="مشاهد محددة" />
              {scope !== 'all' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingInlineStart: 26 }}>
                  {p.scenes.map((s, i) => (
                    <Checkbox key={s.id} checked={sel.includes(s.id)} label={`${pad2(i + 1)} · ${s.name}`} onChange={(v) => setState({ exportSel: v ? [...new Set([...sel, s.id])] : sel.filter((x) => x !== s.id) })} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div data-print-scroll="1" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-surface)' }}>
          {tab === 'pdf' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{`معاينة · A4 أفقي · ${pages.length} صفحات`}</span>
                <Button variant="primary" size="sm" icon="download" onClick={printPdf} data-testid="export-pdf">تصدير PDF</Button>
              </div>
              <div data-print-scroll="1" style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                <div data-print-root="1" data-print-zoom="1" style={{ zoom: 0.62 }}>
                  {pages.map((pg, pi) => (
                    <div key={pi} data-print-page="1" style={{ width: 1123, height: 794, background: '#fdfcfa', color: '#141210', position: 'relative', boxShadow: '0 6px 24px rgba(0,0,0,.18)', margin: '0 auto 28px', padding: '44px 52px 0', display: 'flex', flexDirection: 'column', direction: 'rtl', overflow: 'hidden', fontFamily: 'var(--font-sans)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div><h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 44, margin: 0, lineHeight: 1.1 }}>لوحة القصة المرئية</h1><p style={{ fontFamily: 'var(--font-serif-text)', color: '#6b6255', fontSize: 17, margin: '8px 0 0' }}>{p.name}</p></div>
                        <div style={{ background: '#d2a06a', borderRadius: 8, padding: '10px 22px', textAlign: 'center', minWidth: 120 }}><div style={{ fontSize: 12, fontWeight: 700 }}>عدد المشاهد</div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26 }}>{pad2(nScenes)}</div></div>
                      </div>
                      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 44, marginTop: 18, alignContent: 'start' }}>
                        {pg.map((x) => {
                          const cov = coverOf(x.sh);
                          const row = (icon: string, text: string) => (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}><span style={{ width: 30, height: 30, borderRadius: '50%', background: '#eee5d3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={icon} size={14} color="#3a342c" /></span>{text}</div>
                          );
                          return (
                            <div key={x.sh.id} style={{ display: 'grid', gridTemplateColumns: '210px minmax(0,1fr)', gap: 18, padding: '18px 0', borderBottom: '1px solid #d3bf94' }}>
                              <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: frameBg(cov && cov.placeholder ? cov : null, moodHex(x.sc.mood)), height: 126 }}>
                                {cov && !cov.placeholder && <img src={imageUrl(cov.imageId, false)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                                {cov?.placeholder && <div style={{ position: 'absolute', inset: 0, background: frameBg(cov, moodHex(x.sc.mood)) }} />}
                                <span style={{ position: 'absolute', top: 10, insetInlineEnd: 10, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, color: '#fdfcfa', textShadow: '0 2px 8px rgba(0,0,0,.5)' }}>{x.num}</span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#a97c49' }}>{`المشهد ${pad2(x.si + 1)} · ${x.sc.name} · ${mmss(x.sh.durationS)}`}</span>
                                <span style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 18, lineHeight: 1.4 }}>{x.sh.description || 'بدون وصف'}</span>
                                {row('camera', camLine(eq, x.sh) || '—')}
                                {row('repeat', moveLine(eq, x.sh) || '—')}
                                {row('sun', (x.sh.lightingMood as string) || (x.sh.lightingIds ?? []).map((i) => eqName(eq, i)).join('، ') || 'ضوء متاح')}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ background: '#d2a06a', margin: '0 -52px', padding: '18px 52px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}><div>0500710624</div><div>shrede80@gmail.com</div></div>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{`${pi + 1} / ${pages.length}`}</span>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, margin: 0 }}>لوحة القصة المرئية</h2>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          {tab === 'table' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{`قائمة اللقطات · ${p.scenes.length} مشاهد · ${nShots} لقطة`}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="outline" size="sm" icon="file" onClick={printPdf} data-testid="export-table-pdf">PDF</Button>
                  <Button variant="primary" size="sm" icon="download" loading={busy === 'xlsx'} onClick={() => void run('xlsx', () => exportXlsx(p))} data-testid="export-xlsx">Excel</Button>
                </div>
              </div>
              <div data-print-scroll="1" style={{ flex: 1, overflow: 'auto', padding: 20 }}>
                <div data-print-root="1" style={{ background: 'var(--color-bg)', fontSize: 13 }}>
                  <Table columns={shotCols} rows={shotRows(p, eq)} style={{ fontSize: 13 }} />
                </div>
              </div>
            </>
          )}
          {tab === 'project' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 32, display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 620 }}>
              <Card>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Icon name="folder" size={20} /><span style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 17 }}>{`${p.name}.zip`}</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
                    {summary.map(([k, v]) => <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 10, background: 'var(--color-surface-strong)', borderRadius: 8 }}><span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22 }}>{String(v)}</span><span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{k}</span></div>)}
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>ملف واحد فيه كل المشاهد واللقطات والمكتبة والصور الأصلية، يُحفظ على جهازك.</span>
                  <div style={{ display: 'flex' }}><Button variant="primary" icon="download" loading={busy === 'zip'} onClick={() => void run('zip', () => exportProjectZip(p))} data-testid="export-zip">حفظ نسخة المشروع</Button></div>
                </div>
              </Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>استيراد مشروع من ملف</span>
                {!pre ? (
                  <label className="h-accent" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 80, border: '1.5px dashed var(--color-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 14, fontWeight: 600 }}>
                    <Icon name="upload" size={18} />اختر ملف ‎.zip
                    <input type="file" accept=".zip,application/zip" data-testid="import-input" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; setImpErr(''); if (f) void readProjectZip(f).then(setPre).catch((x: Error) => setImpErr(x.message)); }} />
                  </label>
                ) : (
                  <Card>
                    <div data-testid="import-preview" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <span style={{ fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 17 }}>{pre.name}</span>
                      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{`${pre.counts.scenes} مشاهد · ${pre.counts.shots} لقطة · ${pre.counts.images} صورة · ${pre.counts.library} عناصر مكتبة`}</span>
                      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>سيُنشأ مشروع جديد باسم «{pre.name} (مستورد)» — لن يتغيّر أي مشروع موجود.</span>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <Button variant="primary" loading={busy === 'import'} onClick={() => void run('import', () => importProjectZip(pre))} data-testid="import-confirm">تأكيد الاستيراد</Button>
                        <Button variant="ghost" onClick={() => setPre(null)}>إلغاء</Button>
                      </div>
                    </div>
                  </Card>
                )}
                {impErr && <span data-testid="import-error" style={{ fontSize: 13, color: 'var(--color-danger)', fontWeight: 600 }}>{impErr}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConfirmDialog() {
  const cf = useApp((s) => s.confirm);
  if (!cf) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(20,18,16,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div data-component="ConfirmDialog" style={{ width: 420, maxWidth: 'calc(100% - 32px)', background: 'var(--color-bg)', borderRadius: 14, boxShadow: 'var(--shadow-lift)', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-serif-text)', fontWeight: 700, fontSize: 20 }}>{cf.title}</h3>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: 'var(--color-text-muted)' }}>{cf.msg}</p>
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <Button variant={cf.danger ? 'dark' : 'primary'} onClick={() => (setState({ confirm: null }), cf.onOk())} data-testid="confirm-ok">{cf.ok}</Button>
          <Button variant="ghost" onClick={() => setState({ confirm: null })}>إلغاء</Button>
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const theme = useApp((s) => s.theme);
  return (
    <div style={{ position: 'fixed', bottom: 104, left: '50%', transform: 'translateX(-50%)', zIndex: 95, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: 'auto' }} data-testid="toast">
          <Toast tone={t.tone} onDismiss={() => dismissToast(t.id)} message={t.undo || t.actions?.length ? (
            <span style={{ display: 'inline-flex', gap: 14, alignItems: 'center' }}>
              {t.msg}
              {t.actions?.map((a) => (
                <button key={a.label} data-testid={a.testid ?? 'toast-action'} onClick={() => (a.run(), dismissToast(t.id))} style={{ background: 'none', border: 'none', color: theme === 'dark' ? '#a97c49' : '#e0bb8f', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, padding: 0 }}>{a.label}</button>
              ))}
              {t.undo && <button data-testid="toast-undo" onClick={() => (void undo(), dismissToast(t.id))} style={{ background: 'none', border: 'none', color: theme === 'dark' ? '#a97c49' : '#e0bb8f', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, padding: 0 }}>تراجع</button>}
            </span>
          ) : t.msg} />
        </div>
      ))}
    </div>
  );
}
