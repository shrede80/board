import { createContext, useContext, useEffect, useState } from 'react';
import {
  addShot, closeEditor, deleteScene, deleteShot, editorNav, moveShot, newCharacterForScene, newLocationForScene, openEditor, toggleCharacter, unlink, upd,
} from '../app/actions';
import { currentDrag, dragEnd, dragStart, hasFiles, setOver } from '../app/dnd';
import { addFiles, moveImage, removeImage, retryUpload, setCover, type OwnerKind } from '../app/images';
import { getState, openMenu, setState, useApp, useEquipment, useProject, type MenuEntry } from '../app/state';
import { api } from '../data/api';
import { allShots, coverOf, eqName, findShot, moodHex, moodName, sceneDur, type PLib, type PProject, type PScene, type PShot } from '../data/project';
import { Button, EmptyState, Icon, Input, Textarea } from '../ds/ds';
import { ANGLES, GENERAL, MOODS, MOVES, ORDER, SIZES, STATUS } from '../lib/constants';
import { frameBg, mmss, pad2, type Img } from '../lib/util';
import { deleteLib, duplicateLib, duplicateSelection, libMenu, shotMenu } from '../app/boardActions';
import { dropIdeaOnShot } from '../app/ideas';
import { avatar } from './Library';

/** The same editors run full screen on the phone (UPDATE-1 ج4); a few controls change for touch. */
const MobileCtx = createContext(false);
const useMobile = () => useContext(MobileCtx);

const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' };
const chip = (on: boolean) => (on ? 'var(--color-inverse-bg)' : 'transparent');
const chipFg = (on: boolean) => (on ? 'var(--color-inverse-text)' : 'var(--color-text)');
const hdrBtn: React.CSSProperties = { width: 32, height: 32, border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' };

// «استخدمتها قبل»: values typed by hand before (SPEC §3.2)
let customCache: Record<string, string[]> = {};
function useCustomValues() {
  const [cv, setCv] = useState(customCache);
  useEffect(() => {
    api<Record<string, string[]>>('/api/custom-values').then((v) => {
      customCache = v;
      setCv(v);
    }).catch(() => {});
  }, []);
  return cv;
}

export function EditorPanel({ mobile = false }: { mobile?: boolean }) {
  const p = useProject();
  const ed = useApp((s) => s.editor);
  if (!p || !ed) return null;
  let body: React.ReactNode = null;
  let head: { kicker: string; title: string; nav?: { pos: string; prev: boolean; next: boolean } } | null = null;
  const comp = { shot: 'ShotEditor', scene: 'SceneEditor', character: 'CharacterEditor', location: 'LocationEditor', moodboard: 'MoodboardEditor', note: 'NoteEditor' }[ed.type];
  if (ed.type === 'shot') {
    const f = findShot(p, ed.id);
    if (!f) return null;
    const list = allShots(p);
    const i = list.findIndex((x) => x.sh.id === ed.id);
    head = { kicker: `المشهد ${pad2(f.si + 1)} · ${f.sc.name}`, title: `اللقطة ${f.num}`, nav: { pos: `${i + 1} / ${list.length}`, prev: i > 0, next: i < list.length - 1 } };
    body = <ShotEditor p={p} sh={f.sh} sc={f.sc} />;
  } else if (ed.type === 'scene') {
    const sc = p.scenes.find((s) => s.id === ed.id);
    if (!sc) return null;
    const si = p.scenes.indexOf(sc);
    head = { kicker: 'مشهد', title: `المشهد ${pad2(si + 1)}`, nav: { pos: `${si + 1} / ${p.scenes.length}`, prev: si > 0, next: si < p.scenes.length - 1 } };
    body = <SceneEditor p={p} sc={sc} si={si} />;
  } else if (ed.type === 'note') {
    const n = p.notes.find((x) => x.id === ed.id);
    if (!n) return null;
    const si = p.scenes.findIndex((s) => s.noteIds.includes(n.id));
    head = { kicker: 'ملاحظة', title: si > -1 ? `ملاحظة · المشهد ${pad2(si + 1)}` : 'ملاحظة' };
    body = (
      <div data-component="NoteEditor" style={{ paddingTop: 16 }}>
        <Textarea value={(n.text as string) ?? ''} onChange={(e) => upd('note', n.id, { text: e.target.value }, 'text')} rows={8} placeholder="اكتب ملاحظتك…" data-testid="note-text" />
      </div>
    );
  } else {
    const L = ed.type === 'character' ? p.library.characters : ed.type === 'location' ? p.library.locations : p.library.moodboards;
    const e = L.find((x) => x.id === ed.id);
    if (!e) return null;
    head = { kicker: { character: 'شخصية', location: 'موقع', moodboard: 'لوحة مزاج' }[ed.type], title: ((e.name ?? e.title) as string) || { character: 'شخصية', location: 'موقع', moodboard: 'لوحة مزاج' }[ed.type] };
    body = <LibEditor p={p} type={ed.type} e={e} />;
  }
  if (mobile) return <MobileEditor comp={comp} head={head} body={body} />;
  return (
    <aside data-component={comp} data-testid="editor" style={{ width: 420, flexShrink: 0, borderInlineStart: '1px solid var(--color-border-subtle)', background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', minHeight: 0, zIndex: 16, boxShadow: 'var(--shadow-lift)' }}>
      <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{head.kicker}</span>
          <span data-testid="editor-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26, lineHeight: 1.15 }}>{head.title}</span>
        </div>
        {head.nav && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button title="السابق" className="h-strong" onClick={() => editorNav(-1)} style={{ ...hdrBtn, opacity: head.nav.prev ? 1 : 0.35 }}><Icon name="arrow-right" size={16} /></button>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', minWidth: 40, textAlign: 'center' }}>{head.nav.pos}</span>
            <button title="التالي" className="h-strong" onClick={() => editorNav(1)} style={{ ...hdrBtn, opacity: head.nav.next ? 1 : 0.35 }}><Icon name="arrow-left" size={16} /></button>
          </div>
        )}
        <button title="إغلاق (Esc)" data-testid="editor-close" className="h-strong" onClick={closeEditor} style={hdrBtn}><Icon name="x" size={17} /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 28px' }}>{body}</div>
    </aside>
  );
}

function editorMenu(type: string, id: string): MenuEntry[] {
  if (type === 'shot') return shotMenu(id).filter((m) => m === 'sep' || m.label !== 'فتح');
  if (type === 'scene') {
    return [
      { label: 'لقطة جديدة', icon: 'plus', run: () => addShot(id), testid: 'm-add-shot' },
      { label: 'تكرار المشهد', icon: 'repeat', run: () => duplicateSelection([id]), testid: 'm-duplicate' },
      'sep',
      { label: 'حذف المشهد', icon: 'trash', danger: true, run: () => deleteScene(id), testid: 'm-delete' },
    ];
  }
  if (type === 'character' || type === 'location' || type === 'moodboard') return libMenu(type, id).filter((m) => m === 'sep' || m.label !== 'تعديل');
  return [];
}

/** Phone editor: ✕ · number and scene · ⋯ on top; السابقة · محفوظ ✓ · التالية at the bottom. */
function MobileEditor({ comp, head, body }: { comp: string; head: { kicker: string; title: string; nav?: { pos: string; prev: boolean; next: boolean } }; body: React.ReactNode }) {
  const ed = useApp((s) => s.editor)!;
  const save = useApp((s) => s.save);
  const offline = useApp((s) => s.offline);
  const menu = editorMenu(ed.type, ed.id);
  const saveLbl = offline ? 'غير متصل' : save === 'saving' ? 'يحفظ…' : save === 'error' ? 'ما انحفظ' : 'محفوظ ✓';
  const navBtn: React.CSSProperties = { minWidth: 88, height: 44, border: 'none', background: 'transparent', color: 'var(--color-text)', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px' };
  return (
    <MobileCtx.Provider value={true}>
      <div data-component={comp} data-testid="editor" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 6px 8px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <button aria-label="إغلاق" data-testid="editor-close" onClick={closeEditor} style={{ ...hdrBtn, width: 44, height: 44 }}><Icon name="x" size={22} /></button>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            <span data-testid="editor-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 24, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{head.title.replace(/^اللقطة /, '')}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{head.kicker}</span>
          </div>
          {menu.length ? (
            <button aria-label="خيارات" data-testid="m-editor-more" disabled={offline} onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); openMenu(r.right, r.bottom + 4, menu, 'editor-menu'); }} style={{ ...hdrBtn, width: 44, height: 44 }}><Icon name="more" size={22} /></button>
          ) : <span style={{ width: 44 }} />}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 18px 28px', overscrollBehavior: 'contain' }}>{body}</div>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px calc(6px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--color-border-subtle)' }}>
          <button data-testid="m-prev" disabled={!head.nav?.prev} onClick={() => editorNav(-1)} style={{ ...navBtn, opacity: head.nav?.prev ? 1 : 0.3 }}><Icon name="chevron-down" size={14} style={{ transform: 'rotate(90deg)' }} />السابقة</button>
          <span data-testid="m-saved" style={{ fontSize: 13, color: offline || save === 'error' ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>{saveLbl}</span>
          <button data-testid="m-next" disabled={!head.nav?.next} onClick={() => editorNav(1)} style={{ ...navBtn, justifyContent: 'flex-end', opacity: head.nav?.next ? 1 : 0.3 }}>التالية<Icon name="chevron-down" size={14} style={{ transform: 'rotate(-90deg)' }} /></button>
        </div>
      </div>
    </MobileCtx.Provider>
  );
}

// ---------- gallery ----------

function Gallery(props: { owner: { images: Img[]; coverImageId?: unknown }; target: { type: OwnerKind; id: string }; hex: string; aspect: string }) {
  return useMobile() ? <MobileGallery {...props} /> : <DeskGallery {...props} />;
}

/** Phone gallery: the cover large, then the photos; tap a photo for cover / move / delete; camera and album. */
function MobileGallery({ owner, target, hex, aspect }: { owner: { images: Img[]; coverImageId?: unknown }; target: { type: OwnerKind; id: string }; hex: string; aspect: string }) {
  const offline = useApp((s) => s.offline);
  const imgs = owner.images;
  const cover = coverOf(owner);
  const arCss = aspect === '2.39:1' ? '2.39 / 1' : aspect.replace(':', ' / ');
  const nLinked = imgs.filter((i) => i.linkId).length;
  let linkedIndex = -1;
  const tile: React.CSSProperties = { width: 88, height: 60, flexShrink: 0, borderRadius: 6, border: '1.5px dashed var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', opacity: offline ? 0.4 : 1 };
  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) addFiles(target, e.target.files); e.target.value = ''; };
  return (
    <div data-component="ImageGallery" data-testid="gallery" style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6 }}>
      <div style={{ aspectRatio: arCss, borderRadius: 10, background: frameBg(cover, hex, true), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 14 }}>{!cover && 'لا صور بعد'}</div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
        {imgs.map((im) => {
          const idx = im.linkId ? ++linkedIndex : -1;
          const isCover = cover?.imageId === im.imageId && !!im.linkId;
          const items: MenuEntry[] = [
            { label: 'اجعلها الغلاف', icon: 'star', disabled: !im.linkId || isCover, run: () => setCover(target, im.imageId), testid: 'g-cover' },
            { label: 'تحريك لليمين', icon: 'arrow-right', disabled: idx <= 0, run: () => moveImage(target, idx, idx - 1), testid: 'g-earlier' },
            { label: 'تحريك لليسار', icon: 'arrow-left', disabled: idx < 0 || idx >= nLinked - 1, run: () => moveImage(target, idx, idx + 1), testid: 'g-later' },
            'sep',
            { label: 'حذف الصورة', icon: 'trash', danger: true, run: () => removeImage(target, im), testid: 'g-delete' },
          ];
          return (
            <button key={im.linkId ?? im.imageId} data-testid="gallery-tile" disabled={offline || im.uploading}
              onClick={(e) => { if (im.error) return retryUpload(target, im.imageId); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); openMenu(r.right, r.bottom + 4, items, 'gallery-menu'); }}
              style={{ position: 'relative', width: 88, height: 60, flexShrink: 0, borderRadius: 6, border: 'none', padding: 0, background: frameBg(im, hex), boxShadow: isCover ? '0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent)' : undefined, opacity: im.uploading ? 0.6 : 1 }}>
              {im.uploading && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fdfcfa', textShadow: '0 1px 4px rgba(0,0,0,.6)' }}>يرفع…</span>}
              {im.error && <span style={{ position: 'absolute', inset: 0, borderRadius: 6, background: 'rgba(20,18,16,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#e8a294', textAlign: 'center' }}>ما انحفظ — اضغط وجرّب</span>}
            </button>
          );
        })}
        <label aria-label="الكاميرا" style={tile}><Icon name="camera" size={20} /><input type="file" accept="image/*" capture="environment" disabled={offline} data-testid="gallery-camera" style={{ display: 'none' }} onChange={onFiles} /></label>
        <label aria-label="الألبوم" style={tile}><Icon name="image" size={20} /><input type="file" accept="image/*" multiple disabled={offline} data-testid="gallery-input" style={{ display: 'none' }} onChange={onFiles} /></label>
      </div>
    </div>
  );
}

function DeskGallery({ owner, target, hex, aspect }: { owner: { images: Img[]; coverImageId?: unknown }; target: { type: OwnerKind; id: string }; hex: string; aspect: string }) {
  const over = useApp((s) => s.dragOver?.kind === 'gallery');
  const imgs = owner.images;
  const coverId = coverOf(owner)?.imageId;
  const arCss = aspect === '2.39:1' ? '2.39 / 1' : aspect.replace(':', ' / ');
  let linkedIndex = -1;
  return (
    <>
      <div data-component="ImageGallery" data-testid="gallery"
        onDragOver={(e) => { const d = currentDrag(); if (!hasFiles(e) && !(d?.kind === 'idea')) return; e.preventDefault(); setOver({ kind: 'gallery', id: target.id }); }}
        onDragLeave={() => getState().dragOver?.kind === 'gallery' && setState({ dragOver: null })}
        onDrop={(e) => {
          e.preventDefault();
          const d = currentDrag();
          dragEnd();
          if (d?.kind === 'idea' && target.type === 'shot') dropIdeaOnShot(d.id, target.id);
          else if (e.dataTransfer.files.length) addFiles(target, e.dataTransfer.files);
        }}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
        {imgs.map((im) => {
          const idx = im.linkId ? ++linkedIndex : -1;
          const isCover = coverId === im.imageId && !!im.linkId;
          return (
            <div key={im.linkId ?? im.imageId} data-testid="gallery-tile" draggable={!!im.linkId}
              onDragStart={(e) => dragStart(e, { kind: 'gimg', id: im.imageId, from: idx })} onDragEnd={dragEnd}
              onDragOver={(e) => { if (currentDrag()?.kind === 'gimg') { e.preventDefault(); e.stopPropagation(); } }}
              onDrop={(e) => { const d = currentDrag(); if (d?.kind !== 'gimg') return; e.preventDefault(); e.stopPropagation(); dragEnd(); if (idx >= 0 && d.from !== idx) moveImage(target, d.from, idx); }}
              style={{ position: 'relative', aspectRatio: arCss, borderRadius: 4, background: frameBg(im, hex), overflow: 'hidden', cursor: 'grab', opacity: im.uploading ? 0.6 : 1 }}>
              {!im.error && (
                <>
                  {im.linkId && <button title="اجعلها الغلاف" onClick={() => setCover(target, im.imageId)} style={{ position: 'absolute', top: 4, insetInlineStart: 4, width: 24, height: 24, borderRadius: '50%', border: 'none', background: isCover ? 'var(--color-accent)' : 'rgba(20,18,16,.55)', color: isCover ? '#141210' : '#fdfcfa', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="star" size={13} /></button>}
                  <button title="حذف الصورة" onClick={() => removeImage(target, im)} style={{ position: 'absolute', top: 4, insetInlineEnd: 4, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(20,18,16,.6)', color: '#fdfcfa', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="x" size={12} /></button>
                </>
              )}
              {im.uploading && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fdfcfa', textShadow: '0 1px 4px rgba(0,0,0,.6)' }}>يرفع…</span>}
              {im.error && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,18,16,.82)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 6, textAlign: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#e8a294' }}>الصورة ما انرفعت</span>
                  <button onClick={() => retryUpload(target, im.imageId)} style={{ fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 4, background: '#d2a06a', color: '#141210', padding: '4px 10px', cursor: 'pointer' }}>إعادة المحاولة</button>
                </div>
              )}
            </div>
          );
        })}
        <label style={{ aspectRatio: arCss, border: `1.5px dashed ${over ? 'var(--color-accent)' : 'var(--color-border)'}`, background: over ? 'var(--color-accent-soft)' : 'transparent', borderRadius: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center', cursor: 'pointer', padding: 6, lineHeight: 1.4 }}>
          <Icon name="upload" size={16} />
          {over ? 'أفلت الصورة هنا' : 'اسحب صوراً أو الصقها'}
          <input type="file" accept="image/*" multiple data-testid="gallery-input" style={{ display: 'none' }} onChange={(e) => { if (e.target.files) addFiles(target, e.target.files); e.target.value = ''; }} />
        </label>
      </div>
      <p style={{ margin: '8px 0 4px', fontSize: 12, color: 'var(--color-text-muted)' }}>★ الغلاف · اسحب للترتيب</p>
    </>
  );
}

// ---------- pickers ----------

interface Opt { value: string; label: string; sub?: string; active: boolean }
interface Group { label: string; options: Opt[] }

function Picker({ k, title, display, groups, onSet, multi, chips, hint }: { k: string; title: string; display: string; groups: Group[]; onSet: (v: string) => void; multi?: boolean; chips?: { label: string; onRemove: () => void }[]; hint?: string }) {
  const mobile = useMobile();
  const [q, setQ] = useState('');
  const open = useApp((s) => s.pick === k);
  const customOpen = useApp((s) => s.custom === k);
  const customVal = useApp((s) => s.customVal);
  const pick = (v: string) => {
    onSet(v);
    if (!multi) setState({ pick: null });
  };
  return (
    <div data-picker="1" style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
      <span style={label}>{title}</span>
      {!!chips?.length && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {chips.map((ch, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px 5px 12px', borderRadius: 999, background: 'var(--color-surface-strong)', fontSize: 13, fontWeight: 600 }}>
              {ch.label}
              <button title="إزالة" onClick={ch.onRemove} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', padding: 0 }}><Icon name="x" size={12} /></button>
            </span>
          ))}
        </div>
      )}
      {!multi ? (
        <button data-component="EquipmentPicker" data-testid={`pick-${k}`} onClick={() => setState({ pick: open ? null : k, custom: null, customVal: '' })} style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 14px', background: 'var(--field-bg)', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 15, color: display ? 'var(--color-text)' : 'var(--color-text-muted)', cursor: 'pointer', textAlign: 'right' }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{display || 'اختر…'}</span>
          <Icon name="chevron-down" size={15} />
        </button>
      ) : (
        <button data-component="EquipmentPicker" data-testid={`pick-${k}`} onClick={() => setState({ pick: open ? null : k, custom: null, customVal: '' })} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'transparent', border: '1px dashed var(--color-border)', borderRadius: 999, fontSize: 13, fontWeight: 600, color: 'var(--color-text)', cursor: 'pointer' }}>
          <Icon name="plus" size={13} />إضافة من معداتي
        </button>
      )}
      {open && mobile && <div onClick={() => setState({ pick: null, custom: null })} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(20,18,16,.45)' }} />}
      {open && (
        <div data-testid={mobile ? 'picker-sheet' : undefined} style={mobile
          ? { position: 'fixed', insetInline: 0, bottom: 0, zIndex: 71, maxHeight: '78%', overflowY: 'auto', background: 'var(--color-bg)', borderRadius: '20px 20px 0 0', boxShadow: 'var(--shadow-lift)', padding: '12px 14px calc(14px + env(safe-area-inset-bottom))' }
          : { position: 'absolute', top: '100%', marginTop: 4, insetInline: 0, zIndex: 40, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, boxShadow: 'var(--shadow-lift)', maxHeight: 300, overflowY: 'auto', padding: 6 }}>
          {mobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'sticky', top: -12, background: 'var(--color-bg)', padding: '0 0 8px', zIndex: 1 }}>
              <span style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>{title}</span>
              <button aria-label="إغلاق" onClick={() => setState({ pick: null, custom: null })} style={{ width: 44, height: 44, border: 'none', background: 'transparent', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={20} /></button>
            </div>
          )}
          {mobile && <div style={{ paddingBottom: 6 }}><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث…" data-testid="picker-search" /></div>}
          {groups.map((g) => ({ ...g, options: g.options.filter((o) => !q.trim() || `${o.label} ${o.sub ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())) })).filter((g) => g.options.length).map((g) => (
            <div key={g.label}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', padding: '8px 10px 4px', letterSpacing: 0.2 }}>{g.label}</div>
              {g.options.map((o) => (
                <button key={o.value} className="h-strong" onClick={() => pick(o.value)} style={{ width: '100%', minHeight: mobile ? 48 : undefined, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: 'none', borderRadius: 4, background: o.active ? 'var(--color-accent-soft)' : 'transparent', fontSize: 14, color: 'var(--color-text)', cursor: 'pointer', textAlign: 'right' }}>
                  <span style={{ width: 14, color: 'var(--tan-600)', fontWeight: 700 }}>{o.active ? '✓' : ''}</span>
                  <span style={{ flex: 1 }}>{o.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{o.sub}</span>
                </button>
              ))}
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--color-border-subtle)', marginTop: 6, paddingTop: 6 }}>
            {customOpen ? (
              <input autoFocus value={customVal} placeholder="اكتب واضغط Enter" onChange={(e) => setState({ customVal: e.target.value })}
                onKeyDown={(e) => { const v = (e.target as HTMLInputElement).value.trim(); if (e.key === 'Enter' && v) { onSet(v); setState({ pick: null, custom: null, customVal: '' }); } }}
                style={{ width: '100%', height: 38, border: '1px solid var(--color-focus-ring)', borderRadius: 4, padding: '0 10px', fontSize: 14, background: 'var(--field-bg)', color: 'var(--color-text)', outline: 'none' }} />
            ) : (
              <button className="h-strong" onClick={() => setState({ custom: k, customVal: '' })} style={{ width: '100%', padding: '8px 10px', border: 'none', borderRadius: 4, background: 'transparent', fontSize: 14, color: 'var(--tan-600)', fontWeight: 600, cursor: 'pointer', textAlign: 'right' }}>اكتب قيمة جديدة…</button>
            )}
          </div>
        </div>
      )}
      {hint && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{hint}</span>}
    </div>
  );
}

function Section({ k, title, icon, children }: { k: string; title: string; icon: string; children: React.ReactNode }) {
  const mobile = useMobile();
  const open = useApp((s) => !!s.sections[k]) || mobile;
  if (mobile) {
    return (
      <div style={{ borderTop: '1px solid var(--color-border-subtle)', marginTop: 14, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700 }}><Icon name={icon} size={16} />{title}</span>
        {children}
      </div>
    );
  }
  return (
    <div style={{ borderTop: '1px solid var(--color-border-subtle)', marginTop: 12 }}>
      <button onClick={() => setState((s) => ({ sections: { ...s.sections, [k]: !s.sections[k] } }))} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text)', fontSize: 15, fontWeight: 700 }}>
        <Icon name={icon} size={17} />
        <span style={{ flex: 1, textAlign: 'right' }}>{title}</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} />
      </button>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 8 }}>{children}</div>}
    </div>
  );
}

function F({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={label}>{title}</span>
      {children}
      {hint && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{hint}</span>}
    </div>
  );
}

// ---------- shot ----------

function ShotEditor({ p, sh, sc }: { p: PProject; sh: PShot; sc: PScene }) {
  const eq = useEquipment();
  const refsOpen = useApp((s) => !!s.sections.refs);
  const cv = useCustomValues();
  const id = sh.id;
  const set = (patch: Record<string, unknown>, k?: string) => upd('shot', id, patch, k);
  const cam = eq.get(sh.cameraId as string);
  const items = [...eq.values()].filter((i) => !i.deletedAt);
  const used = (key: string, current: unknown, multi?: boolean): Group => ({
    label: 'استخدمتها قبل',
    options: (cv[key] ?? []).filter((v) => !(GENERAL[key] ?? []).includes(v)).map((v) => ({ value: v, label: v, active: multi ? ((current as string[]) ?? []).includes(v) : current === v })),
  });
  const eqOpts = (role: string, current: unknown, multi?: boolean): Group[] => {
    const has = (v: string) => (multi ? ((current as string[]) ?? []).includes(v) : current === v);
    return [
      { label: 'معداتي', options: items.filter((i) => i.role === role && !i.virtual).map((i) => ({ value: i.id, label: ((i.short as string) || (i.name as string)), sub: i.short ? '' : [i.brand, i.model].filter(Boolean).join(' '), active: has(i.id) })) },
      { label: 'القائمة العامة', options: (GENERAL[role] ?? []).map((g) => ({ value: g, label: g, active: has(g) })) },
      used(role, current, multi),
    ];
  };
  const sizeLbl = SIZES.find((s) => s[0] === sh.size) ?? [sh.size as string, sh.size as string];
  const onCamera = (v: string) => {
    const e = eq.get(v);
    const patch: Record<string, unknown> = { cameraId: v };
    if (e?.lensIds) {
      patch.lens = e.defaultLensId;
      const f = Number(sh.focalMm);
      patch.focalMm = f >= 16 && f <= 50 ? f : 35;
      if (sh.rigId === 'sup-drone') patch.rigId = 'sup-benro';
    } else if (e?.builtinLenses) {
      patch.lens = (e.builtinLenses as string[])[1];
      patch.focalMm = 24;
      if (sh.rigId === 'sup-drone') patch.rigId = 'sup-osmo8';
    } else if (v === 'cam-mini4') {
      patch.lens = null;
      patch.focalMm = 24;
      patch.rigId = 'sup-drone';
      const motions = (eq.get('sup-drone')?.motions as string[]) ?? [];
      if (!motions.includes(sh.motion as string)) patch.motion = 'ريفيل';
    } else patch.lens = null;
    set(patch);
  };
  const sup = eq.get(sh.rigId as string);
  const sugg = (sup?.motions as string[]) ?? [];
  const supItems = items.filter((i) => i.role === 'support' && i.motions && !i.virtual);
  const virt = items.filter((i) => i.virtual);
  const multi = (key: 'lightingIds' | 'audioIds', title: string, role: string, list: string[]) => (
    <Picker k={key} title={title} display="" multi groups={eqOpts(role, list, true)}
      onSet={(v) => set({ [key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] })}
      chips={list.map((x) => ({ label: eqName(eq, x), onRemove: () => set({ [key]: list.filter((y) => y !== x) }) }))} />
  );
  const mobile = useMobile();
  return (
    <>
      {!mobile && <button data-component="ShotEditor" onClick={() => setState((s) => ({ sections: { ...s.sections, refs: !s.sections.refs } }))} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text)', fontSize: 15, fontWeight: 700 }}>
        <Icon name="image" size={17} />
        <span style={{ flex: 1, textAlign: 'right' }}>الصور المرجعية</span>
        <Icon name={refsOpen ? 'chevron-up' : 'chevron-down'} size={16} />
      </button>}
      {(refsOpen || mobile) && <Gallery owner={sh} target={{ type: 'shot', id }} hex={moodHex(sc.mood)} aspect={p.aspect} />}

      <Section k="basics" title="الأساسيات" icon="edit">
        <F title="الوصف (سطر واحد)"><Input value={(sh.description as string) ?? ''} onChange={(e) => set({ description: e.target.value }, 'desc')} placeholder="ماذا يحدث في اللقطة؟" data-testid="shot-desc" /></F>
        <F title={mobile ? 'المدة' : 'المدة بالثواني'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {mobile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--color-border)', borderRadius: 8, padding: 4 }}>
                <button aria-label="أنقص ثانية" data-testid="shot-dur-minus" onClick={() => set({ durationS: Math.max(0, (Number(sh.durationS) || 0) - 1) }, 'dur')} style={{ width: 44, height: 44, border: 'none', borderRadius: 6, background: 'var(--color-surface-strong)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="minus" size={16} /></button>
                <span data-testid="shot-dur-value" style={{ minWidth: 72, textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20 }}>{mmss(sh.durationS)}</span>
                <button aria-label="زد ثانية" data-testid="shot-dur-plus" onClick={() => set({ durationS: (Number(sh.durationS) || 0) + 1 }, 'dur')} style={{ width: 44, height: 44, border: 'none', borderRadius: 6, background: 'var(--color-surface-strong)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={16} /></button>
              </div>
            ) : (
              <>
                <div style={{ width: 120 }}><Input type="number" min={0} value={sh.durationS ?? 0} onChange={(e) => set({ durationS: Math.max(0, Number(e.target.value) || 0) }, 'dur')} data-testid="shot-dur" /></div>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>{mmss(sh.durationS)}</span>
              </>
            )}
          </div>
        </F>
        <F title="الحالة">
          <div style={{ display: 'flex', gap: 6 }}>
            {ORDER.map((k) => {
              const S = STATUS[k], on = sh.status === k;
              return (
                <button key={k} data-testid={`status-${k}`} onClick={() => set({ status: k })} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, border: '1px solid var(--color-border)', borderRadius: 999, background: chip(on), color: chipFg(on), fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: S.dot, border: `1.5px solid ${S.ring}` }} />
                  {S.label}
                </button>
              );
            })}
          </div>
        </F>
      </Section>

      <Section k="comp" title="التكوين" icon="aperture">
        <Picker k="size" title="حجم اللقطة" display={sh.size ? `${sizeLbl[1]} (${sizeLbl[0]})` : ''} groups={[{ label: 'الأحجام', options: SIZES.map((s) => ({ value: s[0], label: s[1], sub: s[0], active: sh.size === s[0] })) }, used('size', sh.size)]} onSet={(v) => set({ size: v })} />
        <Picker k="angle" title="الزاوية" display={(sh.angle as string) ?? ''} groups={[{ label: 'الزوايا', options: ANGLES.map((a) => ({ value: a, label: a, active: sh.angle === a })) }, used('angle', sh.angle)]} onSet={(v) => set({ angle: v })} />
      </Section>

      <Section k="cam" title="الكاميرا والعدسة" icon="camera">
        <Picker k="camera" title="الكاميرا" display={eqName(eq, sh.cameraId as string)} groups={eqOpts('camera', sh.cameraId)} onSet={onCamera} />
        {cam?.lensIds ? (
          <Picker k="lens" title={`العدسة (عدسات ${cam.short})`} display={eqName(eq, sh.lens as string)} groups={[{ label: `عدسات ${cam.short}`, options: (cam.lensIds as string[]).map((l) => ({ value: l, label: eqName(eq, l), sub: l === cam.defaultLensId ? 'الأساسية' : '', active: sh.lens === l })) }, used('lens', sh.lens)]} onSet={(v) => set({ lens: v })} />
        ) : null}
        {cam?.builtinLenses ? (
          <Picker k="lens" title="العدسة المدمجة" display={(sh.lens as string) ?? ''} groups={[{ label: `عدسات ${cam.short}`, options: (cam.builtinLenses as string[]).map((l) => ({ value: l, label: l, active: sh.lens === l })) }]} onSet={(v) => { const m = /\((\d+)mm\)/.exec(v); set({ lens: v, focalMm: m ? Number(m[1]) : sh.focalMm }); }} />
        ) : null}
        {!(cam && cam.fixedLens && !cam.zoomOnly) && (
          <F title="البعد البؤري" hint={cam?.zoomOnly ? 'زوم مدمج' : cam?.builtinLenses ? 'من العدسة المختارة' : undefined}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 120 }}><Input type="number" value={(sh.focalMm as number) ?? ''} onChange={(e) => set({ focalMm: Number(e.target.value) || null }, 'focal')} /></div>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>mm</span>
            </div>
          </F>
        )}
        {!!cam?.fixedLens && !cam.zoomOnly && <F title="العدسة" hint="عدسة ثابتة"><Input value="عدسة ثابتة 24mm" readOnly /></F>}
        <Picker k="filter" title="الفلتر" display={sh.filter ? eqName(eq, sh.filter as string) : ''} groups={eqOpts('filter', sh.filter)} onSet={(v) => set({ filter: v })} />
      </Section>

      <Section k="move" title="الحركة" icon="repeat">
        <Picker k="movement" title="نوع الحركة" display={(sh.motion as string) ?? ''}
          groups={[{ label: sup ? `مناسبة لـ ${(sup.short as string) || (sup.name as string)}` : 'مقترحة', options: sugg.map((m) => ({ value: m, label: m, active: sh.motion === m })) }, { label: 'كل الحركات', options: MOVES.filter((m) => !sugg.includes(m)).map((m) => ({ value: m, label: m, active: sh.motion === m })) }, used('movement', sh.motion)]}
          onSet={(v) => set({ motion: v })} />
        <Picker k="support" title="معدّة الحركة" display={eqName(eq, sh.rigId as string)}
          groups={[
            { label: 'معداتي', options: [...virt.filter((v) => v.id !== 'sup-handheld'), ...supItems].map((i) => ({ value: i.id, label: (i.short as string) || (i.name as string), sub: ((i.motions as string[]) ?? []).slice(0, 3).join('، '), active: sh.rigId === i.id })) },
            { label: 'بدون معدّة', options: virt.filter((v) => v.id === 'sup-handheld').map((i) => ({ value: i.id, label: i.name as string, active: sh.rigId === i.id })) },
            { label: 'القائمة العامة', options: GENERAL.support.map((g) => ({ value: g, label: g, active: sh.rigId === g })) },
            used('support', sh.rigId),
          ]}
          onSet={(v) => set({ rigId: v })} />
      </Section>

      <Section k="light" title="الإضاءة والمزاج" icon="sun">
        {multi('lightingIds', 'معدات الإضاءة', 'lighting', sh.lightingIds ?? [])}
        <F title="وصف المزاج"><Textarea value={(sh.lightingMood as string) ?? ''} onChange={(e) => set({ lightingMood: e.target.value }, 'lm')} rows={2} placeholder="مثلاً: ضوء دافئ ناعم من النافذة" /></F>
      </Section>

      <Section k="audio" title="الصوت والحوار" icon="mic">
        {multi('audioIds', 'معدات الصوت', 'audio', sh.audioIds ?? [])}
        <F title="الحوار"><Textarea value={(sh.dialogue as string) ?? ''} onChange={(e) => set({ dialogue: e.target.value }, 'dl')} rows={4} placeholder="نص الحوار إن وُجد" /></F>
        <F title="ملاحظات الصوت"><Textarea value={(sh.audioNotes as string) ?? ''} onChange={(e) => set({ audioNotes: e.target.value }, 'an')} rows={2} /></F>
      </Section>

      <div style={{ borderTop: '1px solid var(--color-border-subtle)', marginTop: 16, paddingTop: 16, display: 'flex' }}>
        <Button variant="ghost" size="sm" icon="trash" onClick={() => deleteShot(id)}>حذف اللقطة</Button>
      </div>
    </>
  );
}

// ---------- scene ----------

function SceneEditor({ p, sc, si }: { p: PProject; sc: PScene; si: number }) {
  const set = (patch: Record<string, unknown>, k?: string) => upd('scene', sc.id, patch, k);
  const L = p.library;
  const seg = (opts: [string, string][], cur: string, key: string) => (
    <div style={{ flex: 1, display: 'flex', border: '1px solid var(--color-border)', borderRadius: 999, padding: 3, gap: 2 }}>
      {opts.map(([v, l]) => <button key={v} onClick={() => set({ [key]: v })} style={{ flex: 1, height: 34, border: 'none', borderRadius: 999, background: chip(cur === v), color: chipFg(cur === v), fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{l}</button>)}
    </div>
  );
  const attached = [
    ...sc.noteIds.map((id) => { const n = p.notes.find((x) => x.id === id); return n && { id, icon: 'file', label: (n.text as string) || 'ملاحظة فارغة', open: () => openEditor('note', id), remove: () => unlink(sc.id, 'note', id) }; }),
    ...sc.moodboardIds.map((id) => { const m = L.moodboards.find((x) => x.id === id); return m && { id, icon: 'image', label: m.title as string, open: () => openEditor('moodboard', id), remove: () => unlink(sc.id, 'moodboard', id) }; }),
  ].filter(Boolean) as { id: string; icon: string; label: string; open: () => void; remove: () => void }[];
  return (
    <div data-component="SceneEditor" style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 14 }}>
      <F title="الاسم"><Input value={sc.name ?? ''} onChange={(e) => set({ name: e.target.value }, 'name')} data-testid="scene-name" /></F>
      <div style={{ display: 'flex', gap: 12 }}>
        {seg([['int', 'داخلي'], ['ext', 'خارجي']], sc.intExt, 'intExt')}
        {seg([['day', 'نهار'], ['night', 'ليل']], sc.dayNight, 'dayNight')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={label}>الموقع (من المكتبة)</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {L.locations.map((l) => { const on = sc.locationId === l.id; return <button key={l.id} onClick={() => set({ locationId: on ? null : l.id })} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', border: '1px solid var(--color-border)', borderRadius: 999, background: chip(on), color: chipFg(on), fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><Icon name="map-pin" size={13} />{l.name as string}</button>; })}
          <button onClick={() => newLocationForScene(sc.id)} style={{ padding: '7px 12px', border: '1px dashed var(--color-border)', borderRadius: 999, background: 'transparent', color: 'var(--color-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ موقع جديد</button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={label}>الشخصيات</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {L.characters.map((c) => {
            const on = sc.characterIds.includes(c.id), av = avatar(c);
            return (
              <button key={c.id} onClick={() => toggleCharacter(sc, c.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text)', opacity: on ? 1 : 0.45, padding: 0 }}>
                <span data-testid="char-avatar" data-where="editor" style={{ width: 46, height: 46, borderRadius: '50%', background: av.bg, boxShadow: `0 0 0 2px var(--color-bg),0 0 0 4px ${on ? 'var(--color-accent)' : 'transparent'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 19, color: '#141210' }}>{av.init}</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{c.name as string}</span>
              </button>
            );
          })}
          <button onClick={() => newCharacterForScene(sc.id)} title="شخصية جديدة" style={{ width: 46, height: 46, borderRadius: '50%', border: '1.5px dashed var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={16} /></button>
        </div>
      </div>
      <F title="الملخص"><Textarea value={(sc.summary as string) ?? ''} onChange={(e) => set({ summary: e.target.value }, 'sum')} rows={3} /></F>
      <F title="الهدف الدرامي"><Textarea value={(sc.goal as string) ?? ''} onChange={(e) => set({ goal: e.target.value }, 'goal')} rows={2} /></F>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={label}>{`لون المزاج · ${moodName(sc.mood)}`}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {MOODS.map((m) => <button key={m} title={moodName(m)} onClick={() => set({ mood: m })} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: moodHex(m), boxShadow: sc.mood === m ? '0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-text)' : 'none', cursor: 'pointer' }} />)}
          <label title="لون مخصص" style={{ position: 'relative', width: 30, height: 30, borderRadius: '50%', border: '1.5px dashed var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
            <Icon name="plus" size={13} />
            <input type="color" value={/^#/.test(sc.mood) ? sc.mood : '#8a7a66'} onChange={(e) => set({ mood: e.target.value }, 'mood')} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
          </label>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={label}>اللقطات</span><span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{mmss(sceneDur(sc))}</span></div>
        {sc.shots.map((sh, hi) => (
          <div key={sh.id} draggable className="h-strong" onDragStart={(e) => dragStart(e, { kind: 'eshot', id: sh.id })} onDragEnd={dragEnd}
            onDragOver={(e) => { if (currentDrag()?.kind === 'eshot') e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); const d = currentDrag(); dragEnd(); if (d?.kind === 'eshot' && d.id !== sh.id) moveShot(d.id, sc.id, hi); }}
            onClick={() => openEditor('shot', sh.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 6, borderRadius: 8, cursor: 'pointer' }}>
            <span style={{ width: 64, height: 36, borderRadius: 4, background: frameBg(coverOf(sh), moodHex(sc.mood)), flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 15, width: 30 }}>{`${si + 1}.${hi + 1}`}</span>
            <span style={{ flex: 1, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sh.description || 'بدون وصف'}</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{mmss(sh.durationS)}</span>
          </div>
        ))}
        {!sc.shots.length && <EmptyState icon="film" title="مشهد بلا لقطات" description="أضف أول لقطة لهذا المشهد." style={{ padding: '20px 12px' }} />}
        <Button variant="outline" size="sm" icon="plus" onClick={() => addShot(sc.id)}>لقطة</Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={label}>الملاحظات ولوحات المزاج المرتبطة</span>
        {attached.map((a) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--color-border-subtle)', borderRadius: 8 }}>
            <Icon name={a.icon} size={15} />
            <button onClick={a.open} style={{ flex: 1, border: 'none', background: 'transparent', textAlign: 'right', cursor: 'pointer', color: 'var(--color-text)', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.label}</button>
            <button title="فك الربط" onClick={a.remove} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex' }}><Icon name="x" size={13} /></button>
          </div>
        ))}
        {!attached.length && <span style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>تنربط لما تسحبها لصف المشهد.</span>}
      </div>
      <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 14, display: 'flex' }}>
        <Button variant="ghost" size="sm" icon="trash" onClick={() => deleteScene(sc.id)}>حذف المشهد</Button>
      </div>
    </div>
  );
}

// ---------- character / location / moodboard ----------

function LibEditor({ p, type, e }: { p: PProject; type: 'character' | 'location' | 'moodboard'; e: PLib }) {
  const set = (patch: Record<string, unknown>, k?: string) => upd(type, e.id, patch, k);
  const tf = (key: string, title: string, kind: 'text' | 'textarea' = 'text', rows = 2, placeholder?: string) => (
    <F key={key} title={title}>
      {kind === 'text'
        ? <Input value={(e[key] as string) ?? ''} onChange={(ev) => set({ [key]: ev.target.value }, key)} placeholder={placeholder} data-testid={`lib-${key}`} />
        : <Textarea value={(e[key] as string) ?? ''} onChange={(ev) => set({ [key]: ev.target.value }, key)} rows={rows} />}
    </F>
  );
  const sceneLinks = (test: (s: PScene) => boolean) => p.scenes.map((s, i) => ({ s, i })).filter((x) => test(x.s));
  const swatches = (e.swatches as string[]) ?? [];
  const links = type === 'character' ? sceneLinks((s) => s.characterIds.includes(e.id)) : type === 'location' ? sceneLinks((s) => s.locationId === e.id) : [];
  return (
    <>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', padding: '14px 0 8px' }}>الصور</div>
      <Gallery owner={e} target={{ type, id: e.id }} hex={type === 'moodboard' ? swatches[0] || '#d2a06a' : '#d2a06a'} aspect={p.aspect} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 16 }}>
        {type === 'character' && [tf('name', 'الاسم'), tf('role', 'الدور'), tf('description', 'وصف قصير', 'textarea', 2), tf('wardrobe', 'اللبس', 'textarea', 2), tf('notes', 'ملاحظات', 'textarea', 3)]}
        {type === 'location' && [tf('name', 'الاسم'), tf('address', 'العنوان'), tf('mapUrl', 'رابط الخريطة', 'text', 2, 'https://maps…'), tf('notes', 'ملاحظات', 'textarea', 3)]}
        {type === 'moodboard' && tf('title', 'العنوان')}
      </div>
      {type === 'moodboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 16 }}>
          <span style={label}>عيّنات الألوان</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {swatches.map((c, i) => (
              <label key={i} style={{ position: 'relative', width: 40, height: 40, borderRadius: 4, background: c, border: '1px solid var(--color-border)', cursor: 'pointer' }}>
                <input type="color" value={c} onChange={(ev) => { const s = [...swatches]; s[i] = ev.target.value; set({ swatches: s }, 'sw' + i); }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                <button title="إزالة" onClick={(ev) => { ev.preventDefault(); set({ swatches: swatches.filter((_, j) => j !== i) }); }} style={{ position: 'absolute', top: -7, insetInlineEnd: -7, width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}><Icon name="x" size={10} /></button>
              </label>
            ))}
            <button onClick={() => set({ swatches: [...swatches, '#a97c49'] })} style={{ width: 40, height: 40, borderRadius: 4, border: '1.5px dashed var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={15} /></button>
          </div>
        </div>
      )}
      {type !== 'moodboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 18 }}>
          <span style={label}>{type === 'character' ? 'مشاهدها' : 'مشاهده'}</span>
          {links.map(({ s, i }) => (
            <button key={s.id} className="h-strong" onClick={() => openEditor('scene', s.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--color-border-subtle)', borderRadius: 8, background: 'transparent', cursor: 'pointer', color: 'var(--color-text)', fontSize: 14, textAlign: 'right' }}>
              <span style={{ width: 4, height: 20, borderRadius: 2, background: moodHex(s.mood) }} />
              {`${pad2(i + 1)} · ${s.name}`}
            </button>
          ))}
        </div>
      )}
      <div style={{ borderTop: '1px solid var(--color-border-subtle)', marginTop: 18, paddingTop: 14, display: 'flex', gap: 8 }}>
        <Button variant="ghost" size="sm" icon="repeat" onClick={() => duplicateLib(type, e.id)} data-testid="lib-duplicate">تكرار</Button>
        <Button variant="ghost" size="sm" icon="trash" onClick={() => deleteLib(type, e.id)} data-testid="lib-delete">{{ character: 'حذف الشخصية', location: 'حذف الموقع', moodboard: 'حذف لوحة المزاج' }[type]}</Button>
      </div>
    </>
  );
}

