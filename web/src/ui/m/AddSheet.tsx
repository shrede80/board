import { useLayoutEffect, useRef, useState } from 'react';
import { positionAt } from '../../../../shared/model';
import { addScene, commit, newShotFields, openEditor, openProject, upd } from '../../app/actions';
import { addFiles } from '../../app/images';
import { queueIdea } from '../../app/queue';
import { getState, project, setState, toast, useApp, useProject } from '../../app/state';
import { Button, Field, Icon, Input, Select, Tabs, Textarea } from '../../ds/ds';
import { SIZES } from '../../lib/constants';
import { pad2, uid } from '../../lib/util';
import { useSummaries } from '../Home';
import { Sheet } from './kit';

/**
 * ＋ (UPDATE-1 ج5, mobile.html screen 5): فكرة | لقطة | مشهد. Idea is the default and is two taps
 * from opening the app: ＋, type, «احفظ الفكرة». Ideas are kept on the phone first (offline queue).
 */
type Mode = 'idea' | 'shot' | 'scene';

const btn: React.CSSProperties = { width: 52, height: 52, borderRadius: 10, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };

export function AddSheet() {
  const mode = useApp((s) => s.addSheet) ?? 'idea';
  const close = () => setState({ addSheet: null });
  return (
    <Sheet onClose={close} testid="add-sheet">
      <Tabs items={[{ value: 'idea', label: 'فكرة' }, { value: 'shot', label: 'لقطة' }, { value: 'scene', label: 'مشهد' }]} value={mode} onChange={(v) => setState({ addSheet: v as Mode })} style={{ width: '100%' }} />
      {mode === 'idea' && <IdeaForm close={close} />}
      {mode === 'shot' && <ShotForm close={close} />}
      {mode === 'scene' && <SceneForm close={close} />}
    </Sheet>
  );
}

function useProjectOptions(none?: string) {
  const list = useSummaries();
  const p = useProject();
  const opts = (list ?? []).filter((s) => !s.archived).map((s) => ({ value: s.id, label: s.name }));
  if (p && !opts.some((o) => o.value === p.id)) opts.unshift({ value: p.id, label: p.name });
  return none ? [{ value: '', label: none }, ...opts] : opts;
}

function sceneOptions(none?: string) {
  const p = project();
  const opts = (p?.scenes ?? []).map((sc, i) => ({ value: sc.id, label: `${pad2(i + 1)} · ${sc.name}` }));
  return none ? [{ value: '', label: none }, ...opts] : opts;
}

function IdeaForm({ close }: { close: () => void }) {
  const p = useProject();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<{ f: File; url: string }[]>([]);
  const [pid, setPid] = useState(p?.id ?? '');
  const [sid, setSid] = useState('');
  const [busy, setBusy] = useState(false);
  const projects = useProjectOptions('بدون مشروع');
  // focus inside the tap that opened the sheet, so the keyboard comes up at once
  useLayoutEffect(() => ref.current?.focus(), []);
  const addFilesLocal = (list: FileList | null) => {
    if (!list) return;
    // copy now: clearing the input empties its live FileList
    const added = [...list].filter((f) => /^image\//.test(f.type)).map((f) => ({ f, url: URL.createObjectURL(f) }));
    setFiles((cur) => [...cur, ...added].slice(0, 10));
  };
  const addLink = async () => {
    let link = '';
    try {
      const t = (await navigator.clipboard?.readText?.())?.trim() ?? '';
      if (/^https?:\/\/\S+$/i.test(t)) link = t;
    } catch {
      /* clipboard not allowed */
    }
    setText((v) => `${v}${v && !v.endsWith('\n') ? '\n' : ''}${link || 'https://'}`);
    ref.current?.focus();
  };
  const save = async () => {
    if (!text.trim() && !files.length) return;
    setBusy(true);
    const id = await queueIdea({ text, files: files.map((x) => x.f), projectId: pid || null, sceneId: pid && pid === p?.id ? sid || null : null });
    setBusy(false);
    if (!id) return;
    files.forEach((x) => URL.revokeObjectURL(x.url));
    close();
    toast(navigator.onLine ? 'انحفظت الفكرة' : 'انحفظت الفكرة على الجوال — تُرسل لما يرجع النت');
  };
  return (
    <div data-testid="add-idea" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Textarea ref={ref} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب الفكرة…" data-testid="m-add-text" style={{ fontSize: 17 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label aria-label="الكاميرا" style={btn}><Icon name="camera" size={20} /><input type="file" accept="image/*" capture="environment" data-testid="m-add-camera" style={{ display: 'none' }} onChange={(e) => (addFilesLocal(e.target.files), (e.target.value = ''))} /></label>
        <label aria-label="الألبوم" style={btn}><Icon name="image" size={20} /><input type="file" accept="image/*" multiple data-testid="m-add-album" style={{ display: 'none' }} onChange={(e) => (addFilesLocal(e.target.files), (e.target.value = ''))} /></label>
        <button aria-label="رابط" data-testid="m-add-link" onClick={() => void addLink()} style={btn}><Icon name="link" size={20} /></button>
        <div style={{ flex: 1, display: 'flex', gap: 6, overflowX: 'auto', justifyContent: 'flex-end' }}>
          {files.map((x, i) => (
            <span key={x.url} data-testid="m-add-thumb" style={{ position: 'relative', width: 72, height: 52, borderRadius: 6, flexShrink: 0, background: `center / cover no-repeat url("${x.url}")` }}>
              <button aria-label="إزالة" onClick={() => (URL.revokeObjectURL(x.url), setFiles((cur) => cur.filter((_, j) => j !== i)))} style={{ position: 'absolute', top: -8, insetInlineEnd: -8, width: 26, height: 26, borderRadius: '50%', border: '2px solid var(--color-bg)', background: '#141210', color: '#fdfcfa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}><Icon name="x" size={12} /></button>
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="المشروع"><Select options={projects} value={pid} onChange={(e) => (setPid(e.target.value), setSid(''))} data-testid="m-add-project" /></Field>
        <Field label="المشهد"><Select options={pid && pid === p?.id ? sceneOptions('بدون مشهد') : [{ value: '', label: '—' }]} value={sid} disabled={!pid || pid !== p?.id} onChange={(e) => setSid(e.target.value)} /></Field>
      </div>
      <Button variant="primary" size="lg" icon="check" loading={busy} disabled={!text.trim() && !files.length} onClick={() => void save()} data-testid="m-add-save" style={{ width: '100%' }}>احفظ الفكرة</Button>
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>تنحفظ على جوالك حتى لو النت ضعيف، وتُرسل أول ما يرجع.</span>
    </div>
  );
}

/** Project picker for shot / scene: choosing another project opens it (its scenes are needed). */
function ProjectSelect() {
  const p = useProject();
  const opts = useProjectOptions();
  return <Field label="المشروع"><Select options={opts} value={p?.id ?? ''} onChange={(e) => void openProject(e.target.value)} data-testid="m-add-project" /></Field>;
}

function ShotForm({ close }: { close: () => void }) {
  const p = useProject();
  const offline = useApp((s) => s.offline);
  const [sid, setSid] = useState(() => getState().editor?.type === 'scene' ? getState().editor!.id : p?.scenes[p.scenes.length - 1]?.id ?? '');
  const [desc, setDesc] = useState('');
  const [size, setSize] = useState('MS');
  const [file, setFile] = useState<{ f: File; url: string } | null>(null);
  if (!p) return <span style={{ fontSize: 14, color: 'var(--color-text-muted)', padding: 12 }}>افتح مشروعاً أولاً من الرئيسية.</span>;
  const sc = p.scenes.find((s) => s.id === sid) ?? p.scenes[p.scenes.length - 1];
  const save = () => {
    if (!sc) return;
    const id = uid('sh');
    const last = sc.shots[sc.shots.length - 1];
    const ok = commit([{ op: 'create', entity: 'shots', id, fields: { projectId: p.id, sceneId: sc.id, position: positionAt(sc.shots, sc.shots.length), ...newShotFields(last as never), description: desc.trim(), size } }], { history: 'إضافة لقطة' });
    if (!ok) return;
    if (file) addFiles({ type: 'shot', id }, [file.f]);
    close();
    const si = p.scenes.indexOf(sc);
    toast(`صارت اللقطة ${si + 1}.${sc.shots.length + 1}`, { undo: true, ms: 8000, actions: [{ label: 'فتح المحرر', testid: 'toast-open', run: () => (setState({ screen: 'app' }), openEditor('shot', id)) }] });
  };
  return (
    <div data-testid="add-shot" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <ProjectSelect />
        <Field label="المشهد"><Select options={sceneOptions()} value={sc?.id ?? ''} onChange={(e) => setSid(e.target.value)} data-testid="m-add-scene" /></Field>
      </div>
      <Field label="الوصف"><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="ماذا يحدث في اللقطة؟" data-testid="m-add-desc" /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
        <Field label="الحجم"><Select options={SIZES.map(([v, l]) => ({ value: v, label: `${l} · ${v}` }))} value={size} onChange={(e) => setSize(e.target.value)} data-testid="m-add-size" /></Field>
        <label style={{ height: 44, border: '1px solid var(--color-border)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 600, background: file ? `center / cover no-repeat url("${file.url}")` : 'transparent', color: file ? '#fdfcfa' : 'var(--color-text)' }}>
          <Icon name="camera" size={17} />{file ? 'غيّر الصورة' : 'صورة'}
          <input type="file" accept="image/*" style={{ display: 'none' }} data-testid="m-add-shot-photo" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (file) URL.revokeObjectURL(file.url); setFile(f ? { f, url: URL.createObjectURL(f) } : null); }} />
        </label>
      </div>
      <Button variant="primary" size="lg" icon="plus" disabled={offline || !sc} onClick={save} data-testid="m-add-save" style={{ width: '100%' }}>أضف اللقطة</Button>
      {!sc && <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>لا مشاهد في هذا المشروع بعد — أضف مشهداً أولاً.</span>}
      {offline && <span style={{ fontSize: 13, color: 'var(--color-danger)' }}>تحتاج اتصال — الأفكار فقط تنحفظ بدون إنترنت.</span>}
    </div>
  );
}

function SceneForm({ close }: { close: () => void }) {
  const p = useProject();
  const offline = useApp((s) => s.offline);
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  if (!p) return <span style={{ fontSize: 14, color: 'var(--color-text-muted)', padding: 12 }}>افتح مشروعاً أولاً من الرئيسية.</span>;
  const save = () => {
    const id = addScene({ name: name.trim() || undefined, open: false });
    if (!id) return;
    if (summary.trim()) upd('scene', id, { summary: summary.trim() });
    close();
    const n = (project()?.scenes.findIndex((s) => s.id === id) ?? 0) + 1;
    toast(`صار المشهد ${pad2(n)}`, { undo: true, ms: 8000, actions: [{ label: 'فتح', testid: 'toast-open', run: () => (setState({ screen: 'app' }), openEditor('scene', id)) }] });
  };
  return (
    <div data-testid="add-scene" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ProjectSelect />
      <Field label="اسم المشهد"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: الوصول" data-testid="m-add-scene-name" /></Field>
      <Field label="ملخص (اختياري)"><Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} data-testid="m-add-scene-summary" /></Field>
      <Button variant="primary" size="lg" icon="plus" disabled={offline} onClick={save} data-testid="m-add-save" style={{ width: '100%' }}>أضف المشهد</Button>
      {offline && <span style={{ fontSize: 13, color: 'var(--color-danger)' }}>تحتاج اتصال — الأفكار فقط تنحفظ بدون إنترنت.</span>}
    </div>
  );
}
