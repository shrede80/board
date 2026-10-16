import { History, inverseOps, resolveTrashIds, type HistoryEntry } from '../../../shared/history';
import { emptyStore, type Store } from '../../../shared/model';
import { ENTITIES, ENTITY_NAMES, type EntityName, type Op, type OpsResult, type Row, type Settings } from '../../../shared/schema';
import { acknowledge, markPending, mergeChanges, releasePending, rowKey, type Pending, type Versions } from '../../../shared/sync';
import { api, ApiError } from './api';
import { applyLocal } from './local';

export interface ImageMeta {
  id: string;
  width: number;
  height: number;
  placeholder: { x: number; y: number; v: number } | null;
}

interface Snapshot {
  now: number;
  project: Row;
  rows: Partial<Record<EntityName, Row[]>>;
  images: ImageMeta[];
  settings: Settings;
}
interface ChangesRes {
  now: number;
  rows: Partial<Record<EntityName, Row[]>>;
  images: ImageMeta[];
  settings?: Settings;
}

interface Batch {
  ops: Op[];
  writes: { key: string; fields: string[] }[];
  hiddenByIndex: Map<number, string[]>;
  /** history entry whose inverse waits for this batch's trash ids */
  entry?: HistoryEntry;
  /** coalescing key for typing (same field of the same row) */
  key?: string;
  onAck?: (res: OpsResult) => void;
  readyAt: number;
  attempts: number;
}

export type SaveState = 'saved' | 'saving' | 'error';

export interface EngineEvents {
  change(): void;
  save(s: SaveState): void;
  rejected(message: string): void;
  settings(s: Settings): void;
}

const TYPE_DEBOUNCE = 500;
const COALESCE_MS = 1500;
/** Polls overlap a little so a write committed while a poll ran is never missed. */
const OVERLAP_MS = 5000;
const MAX_SERVER_ERRORS = 6;

/**
 * Client data engine (SPEC §3.4, §3.5):
 * optimistic local apply → ordered send queue → acknowledge; 10 s polling with field-level merge;
 * per-device undo/redo built from inverse ops.
 */
export class Engine {
  store: Store = emptyStore();
  images = new Map<string, ImageMeta>();
  /** Home: scene numbers for the ideas' badges (no project loaded there) */
  sceneNums = new Map<string, number>();
  projectId: string | null = null;
  history = new History(100);
  saveState: SaveState = 'saved';

  private pending: Pending = new Map();
  private versions: Versions = new Map();
  /** trash id → row keys it hid (for instant local undo of a delete) */
  private trashHidden = new Map<string, string[]>();
  private queue: Batch[] = [];
  private sending = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private since = 0;
  private lastHistoryAt = 0;
  private lastHistoryKey: string | undefined;
  private idleWaiters: (() => void)[] = [];

  constructor(private ev: EngineEvents) {}

  // ---------- loading & sync ----------

  async load(projectId: string) {
    const s = await api<Snapshot>(`/api/projects/${encodeURIComponent(projectId)}`);
    const store = emptyStore();
    for (const e of ENTITY_NAMES) for (const r of s.rows[e] ?? []) store[e].set(r.id, r);
    store.projects.set(s.project.id, s.project);
    this.store = store;
    this.images = new Map(s.images.map((i) => [i.id, i]));
    this.projectId = projectId;
    this.since = s.now;
    this.versions = new Map();
    this.pending = new Map();
    this.trashHidden = new Map();
    this.history.clear();
    this.ev.settings(s.settings);
    this.ev.change();
  }

  /**
   * Home (UPDATE-1 ب1): no project open — every project row, the ideas and equipment.
   * Polling then reads the owner-wide changes.
   */
  async loadHome() {
    const s = await api<{ now: number; rows: Partial<Record<EntityName, Row[]>>; images: ImageMeta[]; settings: Settings; sceneNums: Record<string, number> }>('/api/home');
    this.sceneNums = new Map(Object.entries(s.sceneNums ?? {}));
    const store = emptyStore();
    for (const e of ENTITY_NAMES) for (const r of s.rows[e] ?? []) store[e].set(r.id, r);
    this.store = store;
    this.images = new Map(s.images.map((i) => [i.id, i]));
    this.projectId = null;
    this.since = s.now;
    this.versions = new Map();
    this.pending = new Map();
    this.trashHidden = new Map();
    this.history.clear();
    this.ev.settings(s.settings);
    this.ev.change();
  }

  /** Equipment only (used by pages that work without an open project). */
  async loadEquipment() {
    const rows = await api<Row[]>('/api/equipment');
    const m = new Map(rows.map((r) => [r.id, r]));
    this.store = { ...this.store, equipment: m };
    this.ev.change();
  }

  async poll(): Promise<boolean> {
    const pid = this.projectId;
    const since = Math.max(0, this.since - OVERLAP_MS);
    const res = await api<ChangesRes>(pid ? `/api/projects/${encodeURIComponent(pid)}/changes?since=${since}` : `/api/changes?since=${since}`);
    if (pid !== this.projectId) return false;
    this.since = res.now;
    for (const i of res.images) this.images.set(i.id, i);
    if (res.settings) this.ev.settings(res.settings);
    const { store, changed } = mergeChanges(this.store, res, this.pending, this.versions);
    if (changed || res.images.length) {
      this.store = store;
      this.ev.change();
    }
    return changed;
  }

  // ---------- writes ----------

  /**
   * Applies `ops` now and queues them for the server.
   * history: label for undo (false = not undoable, e.g. undo itself or remote-only state).
   * key: typing in the same field within 1.5 s is one undo step and one request.
   */
  commit(ops: Op[], opts: { history?: string | false; key?: string; inverse?: Op[] } = {}): HistoryEntry | undefined {
    if (!ops.length) return;
    let entry: HistoryEntry | undefined;
    if (opts.history !== false) {
      const now = Date.now();
      const inverse = opts.inverse ?? inverseOps(this.store, ops);
      if (opts.key && opts.key === this.lastHistoryKey && now - this.lastHistoryAt < COALESCE_MS && this.history.canUndo) {
        // Same field still being typed: keep the original inverse, extend the forward ops.
        const last = this.history.peekUndo()!;
        last.forward = mergeForward(last.forward, ops);
        entry = last;
      } else {
        entry = { label: opts.history ?? '', forward: ops, inverse, fixedInverse: !!opts.inverse };
        this.history.push(entry);
      }
      this.lastHistoryKey = opts.key;
      this.lastHistoryAt = now;
    }
    this.send(ops, entry, opts.key);
    return entry;
  }

  private send(ops: Op[], entry?: HistoryEntry, key?: string, onAck?: (res: OpsResult) => void) {
    // Trash ids are chosen here so that a request retried after a lost response is idempotent.
    ops = ops.map((op) => (op.op === 'delete' && ENTITIES[op.entity].trashable && !op.trashId ? { ...op, trashId: `tr-${crypto.randomUUID()}` } : op));
    const { store, hiddenByIndex } = applyLocal(this.store, ops, this.trashHidden);
    this.store = store;
    const writes: Batch['writes'] = [];
    for (const op of ops) {
      if (op.op === 'restore') continue;
      const k = rowKey(op.entity, op.id);
      const fields = op.op === 'create' || op.op === 'update' ? Object.keys(op.fields) : ['deletedAt'];
      markPending(this.pending, k, fields);
      writes.push({ key: k, fields });
    }
    const last = this.queue.at(-1);
    if (key && last && last.key === key && !this.sendingBatch(last) && canMerge(last.ops, ops)) {
      last.ops = mergeForward(last.ops, ops);
      last.writes.push(...writes);
      last.readyAt = Date.now() + TYPE_DEBOUNCE;
    } else {
      this.queue.push({ ops, writes, hiddenByIndex, entry, key, onAck, readyAt: key ? Date.now() + TYPE_DEBOUNCE : 0, attempts: 0 });
    }
    this.ev.change();
    this.setSave('saving');
    this.schedule();
  }

  private current: Batch | null = null;
  private sendingBatch(b: Batch) {
    return this.current === b;
  }

  private schedule(delay?: number) {
    if (this.timer) clearTimeout(this.timer);
    const head = this.queue[0];
    if (!head) return;
    const wait = delay ?? Math.max(0, head.readyAt - Date.now());
    this.timer = setTimeout(() => void this.flush(), wait);
  }

  /** Sends queued batches in order, one at a time. */
  async flush(force = false) {
    if (this.sending) return;
    const head = this.queue[0];
    if (!head) return this.settle();
    if (!force && head.readyAt > Date.now() && this.queue.length === 1) return this.schedule();
    this.sending = true;
    this.current = head;
    try {
      const res = await api<OpsResult>('/api/ops', { method: 'POST', json: { ops: head.ops } });
      this.queue.shift();
      acknowledge(this.versions, this.pending, head.writes, res.now);
      res.trashIds.forEach((tid, i) => {
        const keys = head.hiddenByIndex.get(i);
        if (tid && keys) this.trashHidden.set(tid, keys);
      });
      if (head.entry && res.trashIds.some(Boolean)) {
        head.entry.inverse = resolveTrashIds(head.entry.inverse, res.trashIds);
      }
      head.onAck?.(res);
      if (head.ops.some((o) => o.op === 'restore')) void this.poll().catch(() => {});
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      head.attempts++;
      // A server error that keeps repeating is treated as a refusal; network loss (0) is retried forever.
      if (status === 400 || status === 404 || status === 409 || (status >= 500 && head.attempts >= MAX_SERVER_ERRORS)) {
        // The server refused this change: drop it and roll the screen back.
        this.queue.shift();
        for (const w of head.writes) releasePending(this.pending, w.key, w.fields);
        if (head.entry) {
          const rollback = head.entry.inverse;
          const { store } = applyLocal(this.store, rollback, this.trashHidden);
          this.store = store;
          this.history.remove(head.entry);
        } else {
          // An undo/redo was refused: the screen may now differ from the server, so re-read it.
          void this.poll().catch(() => {});
        }
        this.ev.rejected('لم يُحفظ، رجع كما كان');
        this.ev.change();
      } else {
        this.current = null;
        this.sending = false;
        this.setSave('error');
        // Network trouble: keep the change and retry quietly with backoff.
        this.schedule(Math.min(30_000, 2000 * 2 ** Math.min(head.attempts, 4)));
        return;
      }
    }
    this.current = null;
    this.sending = false;
    if (this.queue.length) {
      this.schedule(0);
    } else this.settle();
  }

  private settle() {
    if (!this.queue.length && !this.sending) {
      this.setSave('saved');
      const w = this.idleWaiters;
      this.idleWaiters = [];
      w.forEach((f) => f());
    }
  }

  /** Resolves once everything queued has been saved (or immediately). */
  idle(): Promise<void> {
    if (!this.queue.length && !this.sending) return Promise.resolve();
    this.flush(true);
    return new Promise((r) => this.idleWaiters.push(r));
  }

  retry() {
    for (const b of this.queue) b.readyAt = 0;
    void this.flush(true);
  }

  get hasUnsaved() {
    return this.queue.length > 0;
  }

  private setSave(s: SaveState) {
    if (this.saveState === s) return;
    if (s === 'saving' && this.saveState === 'error') return; // stay red until it really saves
    this.saveState = s;
    this.ev.save(s);
  }

  // ---------- undo / redo ----------

  async undo(): Promise<boolean> {
    await this.idle();
    const e = this.history.popUndo();
    if (!e) return false;
    this.lastHistoryKey = undefined;
    // Undoing a restore puts the row back in the trash under a NEW trash id: redo must use it.
    this.send(e.inverse, undefined, undefined, (res) => {
      const fresh = res.trashIds.filter(Boolean) as string[];
      if (fresh.length) e.forward = e.forward.map((op) => (op.op === 'restore' && fresh.length ? { op: 'restore', trashId: fresh.shift()! } : op));
    });
    this.history.pushRedo(e);
    return true;
  }

  async redo(): Promise<boolean> {
    await this.idle();
    const e = this.history.popRedo();
    if (!e) return false;
    this.lastHistoryKey = undefined;
    const entry: HistoryEntry = { label: e.label, forward: e.forward, inverse: e.fixedInverse ? e.inverse : inverseOps(this.store, e.forward), fixedInverse: e.fixedInverse };
    this.history.pushUndoKeepRedo(entry);
    this.send(e.forward, entry);
    return true;
  }

  /** Rows the server returned from one of its own actions (e.g. the challenge draw). */
  ingest(rows: Partial<Record<EntityName, Row[]>>) {
    const { store, changed } = mergeChanges(this.store, { rows }, this.pending, this.versions);
    if (changed) {
      this.store = store;
      this.ev.change();
    }
  }

  addImages(list: ImageMeta[]) {
    for (const i of list) this.images.set(i.id, i);
  }
}

/** Same single-row update repeated (typing): later fields win. */
function canMerge(a: Op[], b: Op[]) {
  return a.length === 1 && b.length === 1 && a[0].op === 'update' && b[0].op === 'update' && a[0].entity === b[0].entity && a[0].id === b[0].id;
}
function mergeForward(a: Op[], b: Op[]): Op[] {
  if (canMerge(a, b)) {
    const x = a[0] as Extract<Op, { op: 'update' }>, y = b[0] as Extract<Op, { op: 'update' }>;
    return [{ ...x, fields: { ...x.fields, ...y.fields } }];
  }
  return [...a, ...b];
}
