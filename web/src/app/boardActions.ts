import { alignBoxes, COLOR_HEX, distribute, drawOrder, frameAround, reorder, type AlignMode } from '../../../shared/board';
import { placeAt, positionAt } from '../../../shared/model';
import { copySceneOps, type SceneSnap as SceneData } from '../../../shared/copy';
import { MAX_UPLOAD_BYTES, type Op, type Row } from '../../../shared/schema';
import { findShot } from '../data/project';
import { MOOD_PALETTE, MOODS } from '../lib/constants';
import { pad2, uid } from '../lib/util';
import { addScene, addShot, centerWorldRef, commit, nextZ, createFromTemplate, deleteScene, deleteShot, deleteSelection, duplicateShot, moveScene, moveShot, openEditor, renumberOps } from './actions';
import { boardItems, boxOf, fitAll, itemBoxes, itemOf, openItem, posOp, autoArrange, type Item } from './board';
import { uploadFile } from './images';
import { askConfirm, engine, getState, openMenu, project, setState, toast, type MenuEntry, type MenuItem } from './state';

/**
 * Board actions behind the right-click / ⋯ menus and the keyboard (UPDATE-1 أ2–أ8).
 * Every change is one commit = one undo step.
 */

const strip = (r: Row): Record<string, unknown> => {
  const { id: _i, updatedAt: _u, deletedAt: _d, ...f } = r;
  return f;
};
const live = (m: Map<string, Row>, test: (r: Row) => boolean) => [...m.values()].filter((r) => !r.deletedAt && test(r));
const copyName = (s: unknown) => `${(s as string) || ''} (نسخة)`.trim();

// ---------- snapshots (copy keeps the data even if the originals are cut/deleted) ----------

interface SceneSnap extends SceneData {
  kind: 'scene';
}
interface CardSnap {
  kind: 'card';
  card: Row;
  /** the library row behind a note / character / location / moodboard card */
  ref: Row | null;
  refImages: Row[];
}
type Snap = SceneSnap | CardSnap;

function snapScene(id: string): SceneSnap | null {
  const S = engine.store;
  const scene = S.scenes.get(id);
  if (!scene || scene.deletedAt) return null;
  const shots = live(S.shots, (r) => r.sceneId === id);
  const shotIds = new Set(shots.map((s) => s.id));
  const links = live(S.sceneLinks, (r) => r.sceneId === id);
  return {
    kind: 'scene', scene: { ...scene }, shots: shots.map((s) => ({ ...s })),
    shotImages: live(S.itemImages, (r) => r.ownerKind === 'shot' && shotIds.has(r.ownerId as string)).map((r) => ({ ...r })),
    chars: live(S.sceneCharacters, (r) => r.sceneId === id).map((r) => r.characterId as string),
    notes: links.filter((l) => l.kind === 'note').map((l) => S.notes.get(l.refId as string)).filter((n): n is Row => !!n && !n.deletedAt).map((n) => ({ ...n })),
    moodboards: links.filter((l) => l.kind === 'moodboard').map((l) => l.refId as string),
  };
}

const REF_ENTITY = { note: 'notes', character: 'characters', location: 'locations', moodboard: 'moodboards' } as const;
type RefKind = keyof typeof REF_ENTITY;
const isRefKind = (k: string): k is RefKind => k in REF_ENTITY;

function snapCard(id: string): CardSnap | null {
  const S = engine.store;
  const card = S.boardCards.get(id);
  if (!card || card.deletedAt) return null;
  const kind = card.kind as string;
  const ref = isRefKind(kind) ? S[REF_ENTITY[kind]].get(card.refId as string) ?? null : null;
  const refImages = ref && kind !== 'note' ? live(S.itemImages, (r) => r.ownerId === ref.id).map((r) => ({ ...r })) : [];
  return { kind: 'card', card: { ...card }, ref: ref ? { ...ref } : null, refImages };
}

function snapshot(ids: string[]): Snap[] {
  return ids.map((id) => (engine.store.boardCards.has(id) ? snapCard(id) : snapScene(id))).filter((x): x is Snap => !!x);
}

/** Ops that recreate a snapshot with new ids, moved by (dx, dy). Returns the new board item ids. */
function rebuild(snaps: Snap[], dx: number, dy: number): { ops: Op[]; ids: string[] } {
  const p = project()!;
  const ops: Op[] = [];
  const ids: string[] = [];
  const S = engine.store;
  let z = nextZ();
  const lib = (e: 'characters' | 'locations' | 'moodboards') => live(S[e], (r) => r.projectId === p.id).sort((a, b) => (a.position as number) - (b.position as number));
  for (const s of snaps) {
    if (s.kind === 'scene') {
      // right after the original in the numbering (or at the end if it's gone)
      const scenes = p.scenes;
      const at = scenes.findIndex((x) => x.id === s.scene.id);
      const pos = placeAt(scenes as unknown as Row[], at > -1 ? at + 1 : scenes.length);
      ops.push(...renumberOps('scenes', pos.renumber));
      const made = copySceneOps(s, {
        projectId: p.id, position: pos.position, dx, dy, z: z++, newId: uid,
        exists: (kind, id) => { const r = (kind === 'character' ? S.characters : S.moodboards).get(id); return !!r && !r.deletedAt; },
      });
      ids.push(made.sceneId);
      ops.push(...made.ops);
    } else {
      const c = s.card;
      const cid = uid('bc');
      ids.push(cid);
      let refId = c.refId as string;
      const kind = c.kind as string;
      if (isRefKind(kind) && s.ref) {
        const entity = REF_ENTITY[kind];
        refId = uid({ note: 'note', character: 'ch', location: 'loc', moodboard: 'mb' }[kind]);
        const f = strip(s.ref);
        if (kind === 'character' || kind === 'location') f.name = copyName(f.name);
        if (kind === 'moodboard') f.title = copyName(f.title);
        if (entity !== 'notes') f.position = positionAt(lib(entity), lib(entity).length);
        ops.push({ op: 'create', entity, id: refId, fields: f });
        s.refImages.forEach((ii) => ops.push({ op: 'create', entity: 'itemImages', id: uid('ii'), fields: { ...strip(ii), ownerId: refId } }));
      }
      // copied frames stay underneath, everything else lands on top
      ops.push({ op: 'create', entity: 'boardCards', id: cid, fields: { ...strip(c), refId, x: Math.round((c.x as number) + dx), y: Math.round((c.y as number) + dy), locked: false, ...(kind === 'frame' ? {} : { z: z++ }) } });
    }
  }
  return { ops, ids };
}

// ---------- clipboard (same project only, UPDATE-1 أ6) ----------

let clip: { projectId: string; snaps: Snap[]; pastes: number } | null = null;
export const hasClipboard = () => !!clip;

export function copySelection(cut = false) {
  const sel = getState().selection;
  const p = project();
  if (!p || !sel.length) return;
  clip = { projectId: p.id, snaps: snapshot(sel), pastes: 0 };
  if (cut) deleteSelection();
  else toast(sel.length === 1 ? 'انتسخ العنصر' : `انتسخت ${sel.length} عناصر`, { ms: 2000 });
}

/** at: world position (from the menu, at the pointer); without it: 24px further each time. */
export function paste(at?: { x: number; y: number }) {
  const p = project();
  if (!p || !clip) return;
  if (clip.projectId !== p.id) return toast('النسخ بين المشاريع ما يصير');
  let dx: number, dy: number;
  if (at) {
    const pos = clip.snaps.map((s) => (s.kind === 'scene' ? { x: s.scene.boardX as number, y: s.scene.boardY as number } : { x: s.card.x as number, y: s.card.y as number }));
    dx = at.x - Math.min(...pos.map((q) => q.x));
    dy = at.y - Math.min(...pos.map((q) => q.y));
  } else {
    clip.pastes++;
    dx = dy = 24 * clip.pastes;
  }
  const { ops, ids } = rebuild(clip.snaps, dx, dy);
  if (commit(ops, { history: 'لصق' })) setState({ selection: ids });
}

/** Ctrl+D / «تكرار»: copies next to the originals. */
export function duplicateSelection(ids = getState().selection) {
  if (!ids.length) return;
  const { ops, ids: made } = rebuild(snapshot(ids), 24, 24);
  if (!commit(ops, { history: 'تكرار' })) return;
  setState({ selection: made });
  toast(made.length === 1 ? 'تكرّر العنصر' : `تكرّرت ${made.length} عناصر`, { undo: true });
}

// ---------- library items (UPDATE-1 أ2) ----------

type LibType = 'character' | 'location' | 'moodboard';
const LIB_ENTITY = { character: 'characters', location: 'locations', moodboard: 'moodboards' } as const;
const LIB_WORD = { character: 'الشخصية', location: 'الموقع', moodboard: 'لوحة المزاج' } as const;

export function duplicateLib(type: LibType, id: string) {
  const p = project();
  const row = engine.store[LIB_ENTITY[type]].get(id);
  if (!p || !row) return;
  const nid = uid({ character: 'ch', location: 'loc', moodboard: 'mb' }[type]);
  const list = live(engine.store[LIB_ENTITY[type]], (r) => r.projectId === p.id).sort((a, b) => (a.position as number) - (b.position as number));
  const at = list.findIndex((r) => r.id === id);
  const f = strip(row);
  if (type === 'moodboard') f.title = copyName(f.title);
  else f.name = copyName(f.name);
  f.position = positionAt(list, at + 1);
  const ops: Op[] = [{ op: 'create', entity: LIB_ENTITY[type], id: nid, fields: f }];
  for (const ii of live(engine.store.itemImages, (r) => r.ownerId === id)) ops.push({ op: 'create', entity: 'itemImages', id: uid('ii'), fields: { ...strip(ii), ownerId: nid } });
  if (commit(ops, { history: 'تكرار' })) {
    toast(`تكرّرت ${LIB_WORD[type]}`, { undo: true });
    openEditor(type, nid);
  }
}

/** How many scenes an item is linked to (for the delete confirmation). */
function linkedScenes(type: LibType, id: string): number {
  const p = project();
  if (!p) return 0;
  return p.scenes.filter((s) => (type === 'character' ? s.characterIds.includes(id) : type === 'location' ? s.locationId === id : s.moodboardIds.includes(id))).length;
}

/** «حذف»: the item (and its cards) go to the trash; restoring brings the links back. */
export function deleteLib(type: LibType, id: string) {
  const p = project();
  const row = engine.store[LIB_ENTITY[type]].get(id);
  if (!p || !row) return;
  const name = ((row.name ?? row.title) as string) || LIB_WORD[type];
  const n = linkedScenes(type, id);
  const label = { character: 'شخصية', location: 'موقع', moodboard: 'لوحة مزاج' }[type];
  askConfirm({
    title: `حذف ${LIB_WORD[type]}؟`,
    msg: n ? `«${name}» تختفي من ${n} ${n === 1 ? 'مشهد' : 'مشاهد'}، وتبقى في السلة.` : `«${name}» تبقى في السلة 30 يوم.`,
    ok: 'حذف',
    danger: true,
    onOk: () => {
      if (!commit([{ op: 'delete', entity: LIB_ENTITY[type], id, label: `${label}: ${name}` }], { history: 'حذف' })) return;
      if (getState().editor?.id === id) setState({ editor: null });
      setState({ selection: getState().selection.filter((s) => engine.store.boardCards.get(s)?.refId !== id) });
      toast(`انحذفت ${LIB_WORD[type]}`, { undo: true });
    },
  });
}

/** «إزالة من اللوحة»: only the card; the item stays in the library. */
export function removeFromBoard(cardIds: string[]) {
  const ops: Op[] = cardIds.map((id) => ({ op: 'delete', entity: 'boardCards', id }));
  if (!ops.length || !commit(ops, { history: 'إزالة من اللوحة' })) return;
  setState({ selection: [] });
  toast('انشالت من اللوحة فقط', { undo: true });
}

// ---------- layers, lock, colour ----------

function layerOps(changes: Record<string, number>): Op[] {
  return Object.entries(changes).map(([id, z]) => (engine.store.boardCards.has(id) ? { op: 'update', entity: 'boardCards', id, fields: { z } } : { op: 'update', entity: 'scenes', id, fields: { boardZ: z } }));
}

/** ] [ Ctrl+] Ctrl+[ (UPDATE-1 أ7). Frames reorder among frames and always stay underneath. */
export function reorderSel(how: 'forward' | 'backward' | 'front' | 'back', ids = getState().selection) {
  const p = project();
  if (!p || !ids.length) return;
  const items = boardItems(p);
  const frames = items.filter((i) => i.kind === 'frame');
  const rest = items.filter((i) => i.kind !== 'frame');
  const ops = [...layerOps(reorder(frames, ids, how)), ...layerOps(reorder(rest, ids, how))];
  if (ops.length) commit(ops, { history: 'الترتيب' });
}

export function setLocked(ids: string[], on: boolean) {
  const ops: Op[] = ids.map((id) => (engine.store.boardCards.has(id) ? { op: 'update', entity: 'boardCards', id, fields: { locked: on } } : { op: 'update', entity: 'scenes', id, fields: { boardLocked: on } }));
  if (ops.length && commit(ops, { history: on ? 'قفل' : 'فك القفل' })) toast(on ? 'قُفل الموضع والحجم' : 'فُك القفل', { ms: 2500 });
}

export function setColor(ids: string[], key: string | null) {
  const ops: Op[] = ids.filter((id) => engine.store.boardCards.has(id)).map((id) => ({ op: 'update', entity: 'boardCards', id, fields: { color: key } }));
  if (ops.length) commit(ops, { history: 'اللون' });
}

export function setMood(sceneIds: string[], mood: string) {
  const ops: Op[] = sceneIds.map((id) => ({ op: 'update', entity: 'scenes', id, fields: { mood } }));
  if (ops.length) commit(ops, { history: 'لون المزاج' });
}

// ---------- multi-selection ----------

function selBoxes(ids = getState().selection) {
  const set = new Set(ids);
  return itemBoxes().filter((b) => set.has(b.id) && !b.locked);
}
function moveTo(targets: Record<string, { x: number; y: number }>, label: string) {
  const byId = new Map(itemBoxes().map((b) => [b.id, b]));
  const ops: Op[] = [], inverse: Op[] = [];
  for (const [id, pos] of Object.entries(targets)) {
    const b = byId.get(id);
    if (!b || (b.x === pos.x && b.y === pos.y)) continue;
    ops.push(posOp(id, pos));
    inverse.push(posOp(id, { x: b.x, y: b.y }));
  }
  if (ops.length) commit(ops, { history: label, inverse });
}
export const alignSel = (mode: AlignMode) => moveTo(alignBoxes(selBoxes(), mode), 'محاذاة');
export const distributeSel = (axis: 'h' | 'v') => moveTo(distribute(selBoxes(), axis), 'توزيع');

/** «توحيد العرض»: every selected item takes the width of the first one selected. */
export function uniformWidth() {
  const sel = getState().selection;
  const first = boxOf(sel[0]);
  if (!first) return;
  const ops: Op[] = [];
  for (const id of sel.slice(1)) {
    const it = itemOf(id);
    if (!it || it.locked) continue;
    if (it.scene) ops.push({ op: 'update', entity: 'scenes', id, fields: { boardW: Math.max(220, Math.min(640, first.w)) } });
    else ops.push({ op: 'update', entity: 'boardCards', id, fields: { w: first.w } });
  }
  if (ops.length) commit(ops, { history: 'توحيد العرض' });
}

/** «إطار حول المحدد» (Ctrl+G): a frame 40px around the selection, under every other frame. */
export function frameSelection() {
  const p = project();
  const boxes = selBoxes().length ? selBoxes() : itemBoxes().filter((b) => getState().selection.includes(b.id));
  if (!p || !boxes.length) return;
  const r = frameAround(boxes);
  const minZ = Math.min(0, ...boardItems(p).filter((i) => i.kind === 'frame').map((i) => i.z));
  const id = uid('bc');
  if (commit([{ op: 'create', entity: 'boardCards', id, fields: { projectId: p.id, kind: 'frame', refId: '', x: r.x, y: r.y, w: r.w, h: r.h, z: minZ - 1, color: 'gold', text: 'إطار' } }], { history: 'إطار' })) {
    setState({ selection: [id], renaming: { kind: 'card', id } });
  }
}

export function selectAll() {
  const p = project();
  if (p) setState({ selection: boardItems(p).map((i) => i.id) });
}

// ---------- new kinds: heading, frame, image (UPDATE-1 أ5) ----------

export function addCard(kind: 'heading' | 'frame', pos = centerWorldRef()) {
  const p = project();
  if (!p) return;
  const id = uid('bc');
  const frames = boardItems(p).filter((i) => i.kind === 'frame');
  // centre the new item where centerWorld() points (it is offset for a ~240×200 card)
  const off = kind === 'frame' ? { x: 200, y: 100 } : { x: 30, y: -60 };
  const fields: Record<string, unknown> = { projectId: p.id, kind, refId: '', x: Math.round(pos.x - off.x), y: Math.round(pos.y - off.y) };
  if (kind === 'heading') Object.assign(fields, { text: 'عنوان', z: nextZ() });
  else Object.assign(fields, { w: 640, h: 400, color: 'gold', text: 'إطار جديد', z: Math.min(0, ...frames.map((f) => f.z)) - 1 });
  if (commit([{ op: 'create', entity: 'boardCards', id, fields }], { history: 'إضافة' })) setState({ selection: [id], renaming: { kind: 'card', id } });
}

/** Uploads photos and puts each one on the board as an image card, side by side. */
export async function addImageCards(files: FileList | File[], pos = centerWorldRef()) {
  const p = project();
  if (!p || getState().offline) return toast('ما فيه اتصال، ما انحفظ', { tone: 'danger' });
  const list = [...files].filter((f) => /^image\//.test(f.type));
  if (!list.length) return;
  if (list.some((f) => f.size > MAX_UPLOAD_BYTES)) toast('صورة فوق 15MB ما انضافت', { tone: 'danger' });
  const ok = list.filter((f) => f.size <= MAX_UPLOAD_BYTES);
  toast(ok.length === 1 ? 'يرفع الصورة…' : `يرفع ${ok.length} صور…`, { ms: 2500 });
  try {
    const ids = await Promise.all(ok.map((f) => uploadFile(f)));
    const ops: Op[] = [];
    const made: string[] = [];
    let x = Math.round(pos.x);
    let z = nextZ();
    for (const imageId of ids) {
      const id = uid('bc');
      made.push(id);
      ops.push({ op: 'create', entity: 'boardCards', id, fields: { projectId: p.id, kind: 'image', refId: imageId, x, y: Math.round(pos.y), z: z++ } });
      x -= 260 + 24; // next one to the left (RTL)
    }
    if (commit(ops, { history: 'إضافة صورة' })) setState({ selection: made });
  } catch {
    toast('الصورة ما انرفعت', { tone: 'danger' });
  }
}

/** «صورة» template / menu: pick files from the device. */
export function pickImages(pos = centerWorldRef()) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.setAttribute('data-testid', 'image-card-input');
  input.style.display = 'none';
  input.onchange = () => {
    if (input.files?.length) void addImageCards(input.files, pos);
    input.remove();
  };
  document.body.appendChild(input);
  input.click();
}

/** «اجعلها مرجعاً للقطة…» */
export function imageToShot(cardId: string, shotId: string) {
  const p = project();
  const c = engine.store.boardCards.get(cardId);
  const f = p && findShot(p, shotId);
  if (!p || !c || !f) return;
  const linked = live(engine.store.itemImages, (r) => r.ownerKind === 'shot' && r.ownerId === shotId).sort((a, b) => (a.position as number) - (b.position as number));
  const ops: Op[] = [{ op: 'create', entity: 'itemImages', id: uid('ii'), fields: { projectId: p.id, ownerKind: 'shot', ownerId: shotId, imageId: c.refId, position: positionAt(linked, linked.length) } }];
  if (!f.sh.coverImageId) ops.push({ op: 'update', entity: 'shots', id: shotId, fields: { coverImageId: c.refId } });
  if (commit(ops, { history: 'صورة مرجعية' })) toast(`أصبحت الصورة مرجعاً للّقطة ${f.num}`, { undo: true, actions: [{ label: 'فتح', run: () => openEditor('shot', shotId) }] });
}

/** «أضفها للوحة مزاج…» (mbId null = a new moodboard). */
export function imageToMoodboard(cardId: string, mbId: string | null) {
  const p = project();
  const c = engine.store.boardCards.get(cardId);
  if (!p || !c) return;
  const ops: Op[] = [];
  let id = mbId;
  if (!id) {
    id = uid('mb');
    ops.push({ op: 'create', entity: 'moodboards', id, fields: { projectId: p.id, position: positionAt(p.library.moodboards, p.library.moodboards.length), title: (c.text as string) || 'لوحة مزاج', swatches: [] } });
  }
  const linked = live(engine.store.itemImages, (r) => r.ownerId === id);
  ops.push({ op: 'create', entity: 'itemImages', id: uid('ii'), fields: { projectId: p.id, ownerKind: 'moodboard', ownerId: id, imageId: c.refId, position: linked.length + 1 } });
  if (commit(ops, { history: 'لوحة مزاج' })) toast('انضافت الصورة إلى لوحة المزاج', { undo: true, actions: [{ label: 'فتح', run: () => openEditor('moodboard', id!) }] });
}

// ---------- menus (UPDATE-1 أ3) ----------

const ORDER_ITEMS = (ids: string[]): MenuItem[] => [
  { label: 'للأمام', keys: ']', run: () => reorderSel('forward', ids) },
  { label: 'للخلف', keys: '[', run: () => reorderSel('backward', ids) },
  { label: 'للأعلى', keys: 'Ctrl ]', run: () => reorderSel('front', ids) },
  { label: 'للأسفل', keys: 'Ctrl [', run: () => reorderSel('back', ids) },
];

function swatchRow(current: string | null, run: (k: string | null) => void, withNone = true): MenuItem {
  return {
    label: 'اللون',
    swatches: [
      ...(withNone ? [{ key: null, hex: 'var(--color-surface-strong)', on: !current, run: () => run(null), label: 'بدون لون' }] : []),
      ...MOODS.map((k) => ({ key: k, hex: COLOR_HEX[k], on: current === k, run: () => run(k), label: MOOD_PALETTE[k].name })),
    ],
  };
}

export function startRename(id: string) {
  const it = itemOf(id);
  if (!it) return;
  if (it.scene) setState({ renaming: { kind: 'scene', id, where: 'board' }, selection: [id] });
  else if (it.kind === 'heading' || it.kind === 'frame' || it.kind === 'image') setState({ renaming: { kind: 'card', id }, selection: [id] });
  else openItem(id);
}

export function itemsMenu(ids: string[]): MenuEntry[] {
  const p = project();
  if (!p || !ids.length) return [];
  const items = ids.map((id) => itemOf(id)).filter((x): x is Item => !!x);
  const allLocked = items.every((i) => i.locked);
  const lockItem: MenuItem = { label: allLocked ? 'فك القفل' : 'قفل الموضع والحجم', icon: allLocked ? 'unlock' : 'lock', run: () => setLocked(ids, !allLocked), testid: 'm-lock' };
  if (items.length > 1) {
    const n = items.length;
    return [
      { label: 'محاذاة', icon: 'align-h', testid: 'm-align', children: [
        { label: 'يمين', run: () => alignSel('right'), testid: 'm-align-right' }, { label: 'وسط', run: () => alignSel('hcenter') }, { label: 'يسار', run: () => alignSel('left'), testid: 'm-align-left' },
        { label: 'أعلى', run: () => alignSel('top'), testid: 'm-align-top' }, { label: 'منتصف', run: () => alignSel('vmiddle') }, { label: 'أسفل', run: () => alignSel('bottom') },
      ] },
      { label: 'توزيع أفقي', icon: 'distribute', disabled: n < 3, run: () => distributeSel('h'), testid: 'm-dist-h' },
      { label: 'توزيع عمودي', icon: 'distribute', disabled: n < 3, run: () => distributeSel('v') },
      { label: 'توحيد العرض', icon: 'width', run: uniformWidth, testid: 'm-uniform' },
      { label: 'إطار حول المحدد', icon: 'frame', keys: 'Ctrl G', run: frameSelection, testid: 'm-frame-around' },
      { label: 'تكرار', icon: 'repeat', keys: 'Ctrl D', run: () => duplicateSelection(ids) },
      { label: 'نسخ', icon: 'copy', keys: 'Ctrl C', run: () => copySelection() },
      { label: 'الترتيب (أمام / خلف)', icon: 'layers', children: ORDER_ITEMS(ids) },
      lockItem,
      'sep',
      { label: `حذف ${n} عناصر`, icon: 'trash', keys: 'Del', danger: true, run: deleteSelection, testid: 'm-delete' },
    ];
  }
  const it = items[0];
  if (it.scene) {
    const sc = it.scene;
    return [
      { label: 'فتح', icon: 'edit', keys: 'Enter', run: () => openEditor('scene', sc.id), testid: 'm-open' },
      { label: 'إعادة التسمية', icon: 'edit', keys: 'F2', run: () => startRename(sc.id), testid: 'm-rename' },
      { label: 'تكرار المشهد', icon: 'repeat', keys: 'Ctrl D', run: () => duplicateSelection([sc.id]), testid: 'm-duplicate' },
      { label: 'نسخ', icon: 'copy', keys: 'Ctrl C', run: () => copySelection() },
      { ...swatchRow(sc.mood, (k) => k && setMood([sc.id], k), false), label: 'لون المزاج' },
      { label: 'إضافة لقطة', icon: 'plus', run: () => addShot(sc.id), testid: 'm-add-shot' },
      { label: 'الترتيب (أمام / خلف)', icon: 'layers', children: ORDER_ITEMS(ids), testid: 'm-order' },
      lockItem,
      'sep',
      { label: 'حذف المشهد', icon: 'trash', keys: 'Del', danger: true, run: () => deleteScene(sc.id), testid: 'm-delete' },
    ];
  }
  const c = it.card!;
  const out: MenuEntry[] = [
    { label: c.kind === 'image' ? 'تعديل التعليق' : 'فتح وتعديل', icon: 'edit', keys: 'Enter', run: () => (c.kind === 'heading' || c.kind === 'frame' || c.kind === 'image' ? startRename(c.id) : openItem(c.id)), testid: 'm-open' },
    { label: 'تكرار', icon: 'repeat', keys: 'Ctrl D', run: () => duplicateSelection([c.id]), testid: 'm-duplicate' },
    { label: 'نسخ', icon: 'copy', keys: 'Ctrl C', run: () => copySelection(), testid: 'm-copy' },
  ];
  if (c.kind === 'note' || c.kind === 'frame' || c.kind === 'heading') out.push({ ...swatchRow(c.color, (k) => setColor([c.id], k)), testid: 'm-color' });
  out.push({ label: 'الترتيب (أمام / خلف)', icon: 'layers', children: ORDER_ITEMS(ids), testid: 'm-order' }, lockItem);
  if (c.kind === 'image') {
    out.push(
      { label: 'اجعلها مرجعاً للقطة…', icon: 'film', run: () => setState({ pickTarget: { kind: 'shot', cardId: c.id } }), testid: 'm-to-shot' },
      { label: 'أضفها للوحة مزاج…', icon: 'sparkles', run: () => setState({ pickTarget: { kind: 'moodboard', cardId: c.id } }), testid: 'm-to-moodboard' },
    );
  }
  out.push('sep');
  if (c.kind === 'character' || c.kind === 'location' || c.kind === 'moodboard') {
    const word = { character: 'الشخصية', location: 'الموقع', moodboard: 'لوحة المزاج' }[c.kind];
    out.push(
      { label: 'إزالة من اللوحة', icon: 'x', keys: 'Del', run: () => removeFromBoard([c.id]), testid: 'm-remove' },
      { label: `حذف ${word} (للسلة)`, icon: 'trash', danger: true, run: () => deleteLib(c.kind as LibType, c.refId), testid: 'm-delete' },
    );
  } else out.push({ label: 'حذف', icon: 'trash', keys: 'Del', danger: true, run: () => (setState({ selection: [c.id] }), deleteSelection()), testid: 'm-delete' });
  return out;
}

export function boardMenu(world: { x: number; y: number }): MenuEntry[] {
  const at = { x: Math.round(world.x), y: Math.round(world.y) };
  return [
    { label: 'لصق', icon: 'clipboard', keys: 'Ctrl V', disabled: !hasClipboard(), run: () => paste(at), testid: 'm-paste' },
    { label: 'إضافة هنا', icon: 'plus', testid: 'm-add-here', children: [
      { label: 'مشهد', icon: 'film', run: () => addScene({ pos: at }), testid: 'm-add-scene' },
      { label: 'ملاحظة', icon: 'file', run: () => createFromTemplate('note', { where: 'board', pos: at }), testid: 'm-add-note' },
      { label: 'عنوان', icon: 'heading', run: () => addCard('heading', at), testid: 'm-add-heading' },
      { label: 'صورة', icon: 'image', run: () => pickImages(at) },
      { label: 'إطار', icon: 'frame', run: () => addCard('frame', at), testid: 'm-add-frame' },
    ] },
    { label: 'ترتيب تلقائي', icon: 'grid', run: autoArrange },
    { label: 'ملاءمة الكل', icon: 'maximize', run: fitAll },
  ];
}

export function openItemsMenu(x: number, y: number, id: string) {
  const sel = getState().selection;
  const ids = sel.includes(id) ? sel : [id];
  if (!sel.includes(id)) setState({ selection: ids });
  openMenu(x, y, itemsMenu(ids), 'item-menu');
}

// ---------- storyboard menus (UPDATE-1 أ8) ----------

export function sceneRowMenu(sceneId: string): MenuEntry[] {
  return [
    { label: 'تعديل', icon: 'edit', run: () => openEditor('scene', sceneId), testid: 'm-open' },
    { label: 'إعادة التسمية', icon: 'edit', run: () => setState({ renaming: { kind: 'scene', id: sceneId, where: 'row' } }), testid: 'm-rename' },
    { label: 'تكرار', icon: 'repeat', run: () => duplicateSelection([sceneId]), testid: 'm-duplicate' },
    { label: 'إضافة لقطة', icon: 'plus', run: () => addShot(sceneId) },
    'sep',
    { label: 'حذف المشهد', icon: 'trash', danger: true, run: () => deleteScene(sceneId), testid: 'm-delete' },
  ];
}

export function shotMenu(shotId: string): MenuEntry[] {
  const p = project();
  const f = p && findShot(p, shotId);
  if (!p || !f) return [];
  return [
    { label: 'فتح', icon: 'edit', run: () => openEditor('shot', shotId) },
    { label: 'تكرار', icon: 'repeat', run: () => duplicateShot(shotId) },
    { label: 'نقل إلى مشهد…', icon: 'arrow-up-right', testid: 'm-move-to', children: p.scenes.map((sc, i) => ({
      label: `${pad2(i + 1)} · ${sc.name}`, disabled: sc.id === f.sc.id, testid: `m-move-${i + 1}`,
      run: () => (moveShot(shotId, sc.id, null), toast(`انتقلت للمشهد ${pad2(i + 1)}`, { undo: true })),
    })) },
    'sep',
    { label: 'حذف اللقطة', icon: 'trash', danger: true, run: () => deleteShot(shotId), testid: 'm-delete' },
  ];
}

export function libMenu(type: LibType, id: string): MenuEntry[] {
  return [
    { label: 'تعديل', icon: 'edit', run: () => openEditor(type, id) },
    { label: 'تكرار', icon: 'repeat', run: () => duplicateLib(type, id), testid: 'm-duplicate' },
    'sep',
    { label: 'حذف (للسلة)', icon: 'trash', danger: true, run: () => deleteLib(type, id), testid: 'm-delete' },
  ];
}

export { moveScene, drawOrder };
