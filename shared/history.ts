import type { Store } from './model';
import { ENTITIES, type Op, type Row } from './schema';

/**
 * Undo/redo (SPEC §3.5): every user action is a list of ops sent to the server; before sending,
 * we compute the ops that reverse it from the current local state. Undo sends those as an
 * ordinary write, and its own inverse becomes the redo entry.
 *
 * A trash delete can only be reversed once the server has told us the trash id, so its inverse
 * is completed with `resolveTrashIds` after the write is acknowledged.
 */
export interface HistoryEntry {
  label: string;
  /** ops that redo the action (as originally sent) */
  forward: Op[];
  /** ops that undo it */
  inverse: Op[];
}

/** Placeholder for a trash id not known yet: index of the delete op in `forward`. */
export const PENDING_TRASH = '__pending_trash__';

export function inverseOps(store: Store, ops: Op[]): Op[] {
  const inv: Op[] = [];
  ops.forEach((op, i) => {
    if (op.op === 'restore') {
      // Undoing a restore puts the row back in the trash; resolved by the caller (it knows the row).
      return;
    }
    const row = store[op.entity].get(op.id);
    switch (op.op) {
      case 'create':
        // Upsert of an existing (e.g. previously deleted) row → bring back its old values.
        if (row && !row.deletedAt) inv.push({ op: 'update', entity: op.entity, id: op.id, fields: pick(row, Object.keys(op.fields)) });
        else inv.push({ op: 'discard', entity: op.entity, id: op.id });
        break;
      case 'update':
        if (row) inv.push({ op: 'update', entity: op.entity, id: op.id, fields: pick(row, Object.keys(op.fields)) });
        break;
      case 'delete':
        if (ENTITIES[op.entity].trashable) inv.push({ op: 'restore', trashId: `${PENDING_TRASH}${i}` });
        else inv.push({ op: 'undelete', entity: op.entity, id: op.id });
        break;
      case 'discard':
        inv.push({ op: 'undelete', entity: op.entity, id: op.id });
        break;
      case 'undelete':
        inv.push({ op: 'discard', entity: op.entity, id: op.id });
        break;
    }
  });
  // Reverse order: later ops are undone first.
  return inv.reverse();
}

function pick(row: Row, fields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f] = row[f] === undefined ? null : row[f];
  return out;
}

/** Fills in trash ids returned by the server for the deletes of `forward`. */
export function resolveTrashIds(inverse: Op[], trashIds: (string | null)[]): Op[] {
  return inverse.map((op): Op => {
    if (op.op === 'restore' && op.trashId.startsWith(PENDING_TRASH)) {
      const i = Number(op.trashId.slice(PENDING_TRASH.length));
      return { op: 'restore', trashId: trashIds[i] ?? '' };
    }
    return op;
  }).filter((op) => !(op.op === 'restore' && !op.trashId));
}

export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  constructor(private limit = 100) {}

  push(e: HistoryEntry) {
    this.undoStack.push(e);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }
  /** Replace the inverse of the most recent entry (after trash ids are known). */
  patchLast(forward: Op[], inverse: Op[]) {
    const last = this.undoStack[this.undoStack.length - 1];
    if (last && last.forward === forward) last.inverse = inverse;
  }
  peekUndo(): HistoryEntry | undefined {
    return this.undoStack[this.undoStack.length - 1];
  }
  /** Drops an entry (its change was refused by the server). */
  remove(e: HistoryEntry) {
    this.undoStack = this.undoStack.filter((x) => x !== e);
    this.redoStack = this.redoStack.filter((x) => x !== e);
  }
  popUndo(): HistoryEntry | undefined {
    return this.undoStack.pop();
  }
  pushRedo(e: HistoryEntry) {
    this.redoStack.push(e);
  }
  popRedo(): HistoryEntry | undefined {
    return this.redoStack.pop();
  }
  pushUndoKeepRedo(e: HistoryEntry) {
    this.undoStack.push(e);
  }
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
