import { useEffect, useRef, useState } from 'react';
import { linkify, shortUrl } from '../../../shared/ideas';
import { MAX_IDEA_IMAGES, type Row } from '../../../shared/schema';
import { ideaTime } from '../../../shared/time';
import { dragEnd, dragStart } from '../app/dnd';
import { addIdea, CONVERT_LABEL, convertIdea, deleteIdea, ideaProject, liveIdeas, markRead, moveIdea, updateIdea } from '../app/ideas';
import { uploadFile } from '../app/images';
import { engine, openMenu, setState, toast, useApp, useProject, type MenuEntry } from '../app/state';
import { api } from '../data/api';
import { Button, Field, Icon, Select, Textarea } from '../ds/ds';
import { frameBg, imageUrl, pad2 } from '../lib/util';
import { Overlay } from './Pages';
import type { ConvertKind } from '../../../shared/ideas';

const CONVERT_ICON: Record<ConvertKind, string> = { shot: 'film', scene: 'plus', refs: 'image', note: 'file', moodboard: 'sparkles' };

/** Project name for an idea's badge (Home keeps every project row; the open project otherwise). */
function useIdeaBadge(idea: Row): { label: string; none: boolean } {
  useApp((s) => s.dataVersion);
  const p = useProject();
  const pid = ideaProject(idea);
  if (!pid) return { label: 'بدون مشروع', none: true };
  const name = (engine.store.projects.get(pid)?.name as string) ?? (p?.id === pid ? p.name : 'مشروع');
  let scene = '';
  if (idea.sceneId) {
    const n = p && p.id === pid ? p.scenes.findIndex((s) => s.id === idea.sceneId) + 1 : engine.sceneNums.get(idea.sceneId as string) ?? 0;
    if (n > 0) scene = ` · المشهد ${pad2(n)}`;
  }
  return { label: `${name}${scene}`, none: false };
}

export function IdeaText({ text, size = 15 }: { text: string; size?: number }) {
  const segs = linkify(text);
  const plain = segs.filter((s) => !s.href).map((s) => s.text).join('').trim();
  const links = segs.filter((s) => s.href);
  return (
    <>
      {plain && <span style={{ fontFamily: 'var(--font-serif-text)', fontSize: size, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{plain}</span>}
      {links.map((l, i) => (
        <a key={i} href={l.href} target="_blank" rel="noopener noreferrer" data-testid="idea-link" onClick={(e) => e.stopPropagation()}
          style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', fontSize: 13, fontWeight: 700, color: 'var(--tan-600)', border: '1px solid var(--color-border-subtle)', borderRadius: 999, padding: '3px 10px', background: 'var(--color-surface)', textDecoration: 'none', direction: 'ltr', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <Icon name="link" size={13} />{shortUrl(l.href!)}
        </a>
      ))}
    </>
  );
}

function convertMenu(id: string): MenuEntry[] {
  return (['shot', 'scene', 'refs', 'note', 'moodboard'] as ConvertKind[]).map((k) => ({ label: CONVERT_LABEL[k], icon: CONVERT_ICON[k], run: () => void convertIdea(id, k), testid: `convert-${k}` }));
}

interface Summary { id: string; name: string; archived?: boolean }
export async function moveMenu(id: string, x: number, y: number) {
  const list = await api<Summary[]>('/api/projects').catch(() => [] as Summary[]);
  openMenu(x, y, [
    { label: 'بدون مشروع', icon: 'x', run: () => moveIdea(id, null), testid: 'move-none' },
    'sep',
    ...list.filter((p) => !p.archived).map((p) => ({ label: p.name, icon: 'folder', run: () => moveIdea(id, p.id), testid: 'move-project' })),
  ], 'move-menu');
}

const at = (e: React.MouseEvent) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: r.right, y: r.bottom + 4 };
};

/** One idea (UPDATE-1 ب1 column, ب2): photos, text and links, «جديدة», source and time, project badge, actions. */
export function IdeaCard({ idea, draggable, moveHere, readOnView = true, mobile }: { idea: Row; draggable?: boolean; moveHere?: string; readOnView?: boolean; mobile?: boolean }) {
  const offline = useApp((s) => s.offline);
  const badge = useIdeaBadge(idea);
  const ref = useRef<HTMLDivElement>(null);
  const images = (idea.imageIds as string[]) ?? [];
  // «جديدة» stays until it has been on screen for 1.5 s on the laptop
  useEffect(() => {
    if (!idea.isNew || !readOnView || !ref.current || typeof IntersectionObserver === 'undefined') return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(([en]) => {
      if (en.isIntersecting) t = setTimeout(() => markRead(idea.id), 1500);
      else if (t) clearTimeout(t);
    }, { threshold: 0.6 });
    io.observe(ref.current);
    return () => {
      io.disconnect();
      if (t) clearTimeout(t);
    };
  }, [idea.id, idea.isNew, readOnView]);
  const btn: React.CSSProperties = { width: 30, height: 30, border: 'none', borderRadius: 8, background: 'transparent', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
  return (
    <div ref={ref} data-testid="idea-card" data-idea-id={idea.id} draggable={draggable}
      onDragStart={draggable ? (e) => dragStart(e, { kind: 'idea', id: idea.id }) : undefined} onDragEnd={draggable ? dragEnd : undefined}
      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border-subtle)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, cursor: draggable ? 'grab' : 'default' }}>
      {images.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {images.slice(0, 4).map((im) => <i key={im} style={{ display: 'block', width: mobile ? 96 : 64, height: mobile ? 64 : 42, borderRadius: 4, background: frameBg({ imageId: im, placeholder: engine.images.get(im)?.placeholder ?? null }, '#c27a32') }} />)}
          {images.length > 4 && <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--color-text-muted)' }}>{`+${images.length - 4}`}</span>}
        </div>
      )}
      <IdeaText text={(idea.text as string) || ''} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
        {!!idea.isNew && <span data-testid="idea-new" title="جديدة" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-accent)', display: 'inline-block' }} />}
        <Icon name={idea.source === 'phone' ? 'phone' : 'home'} size={13} />
        <span data-testid="idea-time">{`${idea.source === 'phone' ? 'من الجوال' : 'من اللابتوب'} · ${ideaTime(idea.createdAt as number)}`}</span>
        <span style={{ flex: 1 }} />
        <span data-testid="idea-badge" style={{ height: 22, display: 'inline-flex', alignItems: 'center', padding: '0 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', ...(badge.none ? { border: '1px solid var(--color-border)', color: 'var(--color-text)' } : { background: 'var(--color-accent-soft)', color: 'var(--tan-600)' }) }}>{badge.label}</span>
        {mobile && <button aria-label="خيارات الفكرة" data-testid="idea-more" disabled={offline} onClick={() => setState({ ideaSheet: idea.id })} style={{ width: 44, height: 44, border: 'none', borderRadius: 8, background: 'var(--color-surface-strong)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="more" size={18} /></button>}
      </div>
      {!mobile && <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Button variant="outline" size="sm" icon="film" disabled={offline} onClick={(e) => openMenu(at(e).x, at(e).y, convertMenu(idea.id), 'convert-menu')} data-testid="idea-convert">حوّلها إلى…</Button>
        {moveHere
          ? <Button variant="ghost" size="sm" disabled={offline} onClick={() => moveIdea(idea.id, moveHere)} data-testid="idea-move-here">انقلها لهذا المشروع</Button>
          : <Button variant="ghost" size="sm" disabled={offline} onClick={(e) => void moveMenu(idea.id, at(e).x, at(e).y)} data-testid="idea-move">نقل لمشروع</Button>}
        <span style={{ flex: 1 }} />
        <button title="تعديل" data-testid="idea-edit" disabled={offline} className="h-strong" onClick={() => setState({ ideaEdit: idea.id })} style={btn}><Icon name="edit" size={16} /></button>
        <button title="حذف" data-testid="idea-delete" disabled={offline} className="h-strong" onClick={() => deleteIdea(idea.id)} style={btn}><Icon name="trash" size={16} /></button>
      </div>}
    </div>
  );
}

/** «اكتب فكرة واضغط Enter…»: text, photos (button or paste), links found by themselves. */
export function IdeaQuickAdd({ projectId = null, autoFocus, inputRef }: { projectId?: string | null; autoFocus?: boolean; inputRef?: React.RefObject<HTMLTextAreaElement | null> }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<{ f: File; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const offline = useApp((s) => s.offline);
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? own;
  const fileRef = useRef<HTMLInputElement>(null);
  const add = (list: File[]) => setFiles((cur) => [...cur, ...list.filter((f) => /^image\//.test(f.type)).map((f) => ({ f, url: URL.createObjectURL(f) }))].slice(0, MAX_IDEA_IMAGES));
  const save = async () => {
    if (busy || (!text.trim() && !files.length)) return;
    setBusy(true);
    const id = await addIdea({ text, files: files.map((x) => x.f), projectId, source: 'laptop' });
    setBusy(false);
    if (id) {
      setText('');
      files.forEach((x) => URL.revokeObjectURL(x.url));
      setFiles([]);
      toast('انحفظت الفكرة', { ms: 2000 });
    }
  };
  const ib: React.CSSProperties = { width: 30, height: 30, border: 'none', borderRadius: 6, background: 'transparent', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 };
  return (
    <div data-component="IdeaQuickAdd" style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <textarea ref={ref} rows={1} autoFocus={autoFocus} value={text} disabled={offline || busy} data-testid="idea-quick" placeholder={busy ? 'يحفظ…' : 'اكتب فكرة واضغط Enter…'}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const imgs = [...e.clipboardData.items].filter((i) => i.kind === 'file' && /^image\//.test(i.type)).map((i) => i.getAsFile()).filter(Boolean) as File[];
            if (imgs.length) (e.preventDefault(), e.stopPropagation(), add(imgs));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) (e.preventDefault(), void save());
          }}
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', resize: 'none', background: 'transparent', color: 'var(--color-text)', fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.6, padding: '4px 2px', fieldSizing: 'content', maxHeight: 160 } as React.CSSProperties} />
        <button title="صورة" data-testid="idea-quick-image" disabled={offline || busy} onClick={() => fileRef.current?.click()} style={ib}><Icon name="image" size={17} /></button>
        <button title="رابط" disabled={offline || busy} onClick={() => (setText((t) => (t && !t.endsWith(' ') ? `${t} https://` : `${t}https://`)), ref.current?.focus())} style={ib}><Icon name="link" size={17} /></button>
        <input ref={fileRef} type="file" accept="image/*" multiple data-testid="idea-quick-file" style={{ display: 'none' }} onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ''; }} />
      </div>
      {files.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {files.map((x, i) => (
            <span key={x.url} style={{ position: 'relative', width: 52, height: 36, borderRadius: 4, background: `center / cover no-repeat url("${x.url}")` }}>
              <button title="إزالة" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, left: -6, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'var(--color-inverse-bg)', color: 'var(--color-inverse-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}><Icon name="x" size={10} /></button>
            </span>
          ))}
          <Button variant="primary" size="sm" loading={busy} onClick={() => void save()} data-testid="idea-quick-save">احفظ الفكرة</Button>
        </div>
      )}
    </div>
  );
}

/** Edit an idea: text, photos, project and scene (UPDATE-1 ب2). One save = one undo step. */
export function IdeaEditDialog() {
  const id = useApp((s) => s.ideaEdit);
  const offline = useApp((s) => s.offline);
  const open = useProject();
  const idea = id ? engine.store.ideas.get(id) : null;
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [pid, setPid] = useState<string>('');
  const [sid, setSid] = useState<string>('');
  const [projects, setProjects] = useState<Summary[]>([]);
  const [scenes, setScenes] = useState<{ id: string; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!idea) return;
    setText((idea.text as string) ?? '');
    setImages((idea.imageIds as string[]) ?? []);
    setPid(ideaProject(idea) ?? '');
    setSid((idea.sceneId as string) ?? '');
    api<Summary[]>('/api/projects').then(setProjects).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pid) return setScenes([]);
    if (open && open.id === pid) return setScenes(open.scenes.map((s, i) => ({ id: s.id, label: `${pad2(i + 1)} · ${s.name}` })));
    api<{ rows: { scenes: Row[] } }>(`/api/projects/${encodeURIComponent(pid)}`)
      .then((s) => setScenes(s.rows.scenes.sort((a, b) => (a.position as number) - (b.position as number)).map((r, i) => ({ id: r.id, label: `${pad2(i + 1)} · ${r.name as string}` }))))
      .catch(() => setScenes([]));
  }, [pid, open]);
  if (!id || !idea) return null;
  const close = () => setState({ ideaEdit: null });
  const save = () => {
    const fields: Record<string, unknown> = {};
    if (text !== idea.text) fields.text = text;
    if (JSON.stringify(images) !== JSON.stringify(idea.imageIds ?? [])) fields.imageIds = images;
    if ((pid || null) !== (idea.projectId ?? null)) fields.projectId = pid || null;
    if ((sid || null) !== (idea.sceneId ?? null) || 'projectId' in fields) fields.sceneId = pid ? sid || null : null;
    if (Object.keys(fields).length) updateIdea(idea.id, fields);
    close();
  };
  const addFiles = async (list: File[]) => {
    const room = MAX_IDEA_IMAGES - images.length;
    if (room <= 0) return toast('الحد 10 صور للفكرة');
    setBusy(true);
    try {
      const ids = await Promise.all(list.filter((f) => /^image\//.test(f.type)).slice(0, room).map((f) => uploadFile(f)));
      setImages((cur) => [...cur, ...ids]);
    } catch {
      toast('الصورة ما انرفعت', { tone: 'danger' });
    }
    setBusy(false);
  };
  return (
    <Overlay onClose={close} z={70}>
      <div data-component="IdeaEditDialog" data-testid="idea-edit-dialog" style={{ width: 560, maxWidth: '100%', maxHeight: '100%', overflowY: 'auto', background: 'var(--color-bg)', borderRadius: 14, boxShadow: 'var(--shadow-lift)', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26 }}>تعديل الفكرة</h2>
        <Field label="النص"><Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} data-testid="idea-edit-text" /></Field>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)' }}>{`الصور (${images.length} / ${MAX_IDEA_IMAGES})`}</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
            {images.map((im) => (
              <span key={im} data-testid="idea-edit-image" style={{ position: 'relative', aspectRatio: '16 / 10', borderRadius: 6, background: engine.images.get(im)?.placeholder ? frameBg({ imageId: im, placeholder: engine.images.get(im)!.placeholder }, '#c27a32') : `center / cover no-repeat url("${imageUrl(im)}"), #1c1916` }}>
                <button title="حذف الصورة" onClick={() => setImages((cur) => cur.filter((x) => x !== im))} style={{ position: 'absolute', top: 4, insetInlineEnd: 4, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(20,18,16,.6)', color: '#fdfcfa', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="x" size={11} /></button>
              </span>
            ))}
            {images.length < MAX_IDEA_IMAGES && (
              <label style={{ aspectRatio: '16 / 10', border: '1.5px dashed var(--color-border)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                {busy ? '…' : <Icon name="plus" size={18} />}
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
              </label>
            )}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="المشروع"><Select options={[{ value: '', label: 'بدون مشروع' }, ...projects.filter((p) => !p.archived || p.id === pid).map((p) => ({ value: p.id, label: p.name }))]} value={pid} onChange={(e) => (setPid(e.target.value), setSid(''))} /></Field>
          <Field label="المشهد (اختياري)"><Select disabled={!pid} options={[{ value: '', label: 'بدون مشهد' }, ...scenes.map((s) => ({ value: s.id, label: s.label }))]} value={sid} onChange={(e) => setSid(e.target.value)} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <Button variant="primary" disabled={offline || busy} onClick={save} data-testid="idea-edit-save">حفظ</Button>
          <Button variant="ghost" onClick={close}>إلغاء</Button>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" icon="trash" disabled={offline} onClick={() => (close(), deleteIdea(idea.id))}>حذف الفكرة</Button>
        </div>
      </div>
    </Overlay>
  );
}

/** Library tab «الأفكار» (UPDATE-1 ب2): this project's ideas, then the unclassified ones. */
export function LibraryIdeas({ projectId }: { projectId: string }) {
  useApp((s) => s.dataVersion);
  const all = liveIdeas();
  const mine = all.filter((i) => ideaProject(i) === projectId);
  const loose = all.filter((i) => !ideaProject(i));
  const h: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', margin: '6px 2px 2px' };
  return (
    <>
      <IdeaQuickAdd projectId={projectId} />
      <p style={{ margin: '4px 4px 0', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>اسحبها إلى لقطة أو مشهد أو اللوحة.</p>
      <span style={h}>لهذا المشروع</span>
      {mine.map((i) => <IdeaCard key={i.id} idea={i} draggable />)}
      {!mine.length && <span style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '4px 4px 8px' }}>ما فيه أفكار لهالمشروع بعد.</span>}
      {loose.length > 0 && <span style={h}>غير مصنّفة (من كل المشاريع)</span>}
      {loose.map((i) => <IdeaCard key={i.id} idea={i} draggable moveHere={projectId} />)}
    </>
  );
}

/** «الكل»: every idea, with filters (UPDATE-1 ب1). */
export function IdeasPage() {
  useApp((s) => s.dataVersion);
  const [f, setF] = useState<'all' | 'new' | 'none' | string>('all');
  const all = liveIdeas();
  const projects = [...engine.store.projects.values()].filter((p) => !p.deletedAt && all.some((i) => ideaProject(i) === p.id));
  const shown = all.filter((i) => (f === 'all' ? true : f === 'new' ? !!i.isNew : f === 'none' ? !ideaProject(i) : ideaProject(i) === f));
  const nNew = all.filter((i) => i.isNew).length;
  const chip = (v: string, label: string) => (
    <button key={v} onClick={() => setF(v)} data-testid={`ideas-filter-${v}`} style={{ height: 32, padding: '0 12px', borderRadius: 999, border: `1px solid ${f === v ? 'transparent' : 'var(--color-border)'}`, background: f === v ? 'var(--color-inverse-bg)' : 'transparent', color: f === v ? 'var(--color-inverse-text)' : 'var(--color-text)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>
  );
  return (
    <div data-component="IdeasPage" style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '12px 32px 80px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 40 }}>الأفكار</h1>
          {nNew > 0 && <span style={{ height: 26, padding: '0 12px', borderRadius: 999, background: 'var(--color-accent)', color: '#141210', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>{`${nNew} جديدة`}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {chip('all', `الكل ${all.length}`)}{chip('new', 'جديدة')}{chip('none', 'بدون مشروع')}
          {projects.map((p) => chip(p.id, p.name as string))}
        </div>
        <IdeaQuickAdd />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 12, alignItems: 'start' }}>
          {shown.map((i) => <IdeaCard key={i.id} idea={i} />)}
        </div>
        {!shown.length && <span style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>ما فيه أفكار هنا.</span>}
      </div>
    </div>
  );
}
