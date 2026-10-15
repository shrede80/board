import { describe, expect, it } from 'vitest';
import { History, inverseOps, resolveTrashIds } from './history';
import { between, emptyStore, needsRebalance, placeAt, numbering, type Store } from './model';
import type { Op, Row } from './schema';
import { acknowledge, markPending, mergeChanges, rowKey, type Pending, type Versions } from './sync';

const row = (id: string, f: Record<string, unknown>, updatedAt = 1): Row => ({ id, updatedAt, deletedAt: null, ...f });

function base(): Store {
  const s = emptyStore();
  s.scenes.set('s1', row('s1', { projectId: 'p', position: 1, name: 'أ' }));
  s.scenes.set('s2', row('s2', { projectId: 'p', position: 2, name: 'ب' }));
  s.shots.set('h1', row('h1', { projectId: 'p', sceneId: 's1', position: 1, status: 'planned', description: 'x' }));
  s.shots.set('h2', row('h2', { projectId: 'p', sceneId: 's1', position: 2, status: 'planned', description: 'y' }));
  return s;
}

describe('positions', () => {
  it('finds midpoints and edges', () => {
    expect(between(null, null)).toBe(1);
    expect(between(1, 2)).toBe(1.5);
    expect(between(null, 1)).toBe(0);
    expect(between(3, null)).toBe(4);
  });
  it('detects exhausted gaps', () => {
    let a = 1;
    const b = 2;
    for (let i = 0; i < 60; i++) a = between(a, b);
    expect(needsRebalance([row('a', { position: a }), row('b', { position: b })])).toBe(true);
  });
});

describe('merging changes from another device', () => {
  it('applies remote fields but keeps unsent local ones', () => {
    const s = base();
    const pending: Pending = new Map();
    const versions: Versions = new Map();
    // laptop edits description locally (not yet saved)
    s.shots.set('h1', { ...s.shots.get('h1')!, description: 'محلي' });
    markPending(pending, rowKey('shots', 'h1'), ['description']);
    // phone changed status
    const remote = row('h1', { projectId: 'p', sceneId: 's1', position: 1, status: 'shot', description: 'x' }, 10);
    const { store, changed } = mergeChanges(s, { rows: { shots: [remote] } }, pending, versions);
    expect(changed).toBe(true);
    expect(store.shots.get('h1')).toMatchObject({ status: 'shot', description: 'محلي' });
  });

  it('ignores copies older than our own acknowledged write', () => {
    const s = base();
    const pending: Pending = new Map();
    const versions: Versions = new Map();
    s.shots.set('h1', { ...s.shots.get('h1')!, status: 'approved' });
    markPending(pending, rowKey('shots', 'h1'), ['status']);
    acknowledge(versions, pending, [{ key: rowKey('shots', 'h1'), fields: ['status'] }], 20);
    const stale = row('h1', { projectId: 'p', sceneId: 's1', position: 1, status: 'planned', description: 'x' }, 15);
    const { store } = mergeChanges(s, { rows: { shots: [stale] } }, pending, versions);
    expect(store.shots.get('h1')!.status).toBe('approved');
  });

  it('removes rows deleted elsewhere and renumbers', () => {
    const s = base();
    const { store } = mergeChanges(s, { rows: { shots: [{ ...s.shots.get('h1')!, deletedAt: 5, updatedAt: 5 }] } }, new Map(), new Map());
    expect(numbering(store, 'p').shots.get('h2')).toBe('1.1');
  });

  it('adds rows created elsewhere', () => {
    const s = base();
    const { store } = mergeChanges(s, { rows: { shots: [row('h3', { projectId: 'p', sceneId: 's2', position: 1, status: 'planned' }, 7)] } }, new Map(), new Map());
    expect(numbering(store, 'p').shots.get('h3')).toBe('2.1');
  });

  it('pending counts survive overlapping writes to the same field', () => {
    const pending: Pending = new Map();
    const versions: Versions = new Map();
    const k = rowKey('shots', 'h1');
    markPending(pending, k, ['description']);
    markPending(pending, k, ['description']);
    acknowledge(versions, pending, [{ key: k, fields: ['description'] }], 5);
    expect(pending.get(k)?.get('description')).toBe(1);
    acknowledge(versions, pending, [{ key: k, fields: ['description'] }], 6);
    expect(pending.has(k)).toBe(false);
  });
});

describe('undo inverse operations', () => {
  it('create ↔ discard', () => {
    const s = base();
    const fwd: Op[] = [{ op: 'create', entity: 'scenes', id: 's9', fields: { projectId: 'p', name: 'جديد' } }];
    expect(inverseOps(s, fwd)).toEqual([{ op: 'discard', entity: 'scenes', id: 's9' }]);
  });

  it('update → previous values of the same fields only', () => {
    const s = base();
    const inv = inverseOps(s, [{ op: 'update', entity: 'shots', id: 'h1', fields: { sceneId: 's2', position: 0.5 } }]);
    expect(inv).toEqual([{ op: 'update', entity: 'shots', id: 'h1', fields: { sceneId: 's1', position: 1 } }]);
  });

  it('trash delete → restore with the id the server returned', () => {
    const s = base();
    const fwd: Op[] = [
      { op: 'update', entity: 'shots', id: 'h2', fields: { position: 0 } },
      { op: 'delete', entity: 'scenes', id: 's2' },
    ];
    const inv = inverseOps(s, fwd);
    expect(resolveTrashIds(inv, [null, 'tr-1'])).toEqual([
      { op: 'restore', trashId: 'tr-1' },
      { op: 'update', entity: 'shots', id: 'h2', fields: { position: 2 } },
    ]);
  });

  it('non-trash delete → undelete; undelete → discard', () => {
    const s = base();
    s.boardCards.set('c1', row('c1', { projectId: 'p', kind: 'note', refId: 'n', x: 0, y: 0 }));
    expect(inverseOps(s, [{ op: 'delete', entity: 'boardCards', id: 'c1' }])).toEqual([{ op: 'undelete', entity: 'boardCards', id: 'c1' }]);
    expect(inverseOps(s, [{ op: 'undelete', entity: 'boardCards', id: 'c1' }])).toEqual([{ op: 'discard', entity: 'boardCards', id: 'c1' }]);
  });

  it('auto-arrange of many cards is a single history step', () => {
    const s = base();
    const fwd: Op[] = ['s1', 's2'].map((id, i) => ({ op: 'update', entity: 'scenes', id, fields: { boardX: i * 100, boardY: 0 } }));
    s.scenes.set('s1', { ...s.scenes.get('s1')!, boardX: 5, boardY: 6 });
    s.scenes.set('s2', { ...s.scenes.get('s2')!, boardX: 7, boardY: 8 });
    const h = new History();
    h.push({ label: 'ترتيب', forward: fwd, inverse: inverseOps(s, fwd) });
    const e = h.popUndo()!;
    expect(e.inverse).toHaveLength(2);
    expect(e.inverse).toContainEqual({ op: 'update', entity: 'scenes', id: 's1', fields: { boardX: 5, boardY: 6 } });
    expect(h.canUndo).toBe(false);
  });

  it('a new action clears redo', () => {
    const h = new History();
    const e = { label: 'a', forward: [], inverse: [] };
    h.push(e);
    h.pushRedo(h.popUndo()!);
    expect(h.canRedo).toBe(true);
    h.push({ label: 'b', forward: [], inverse: [] });
    expect(h.canRedo).toBe(false);
  });
});

describe('placeAt', () => {
  const list = (ps: number[]) => ps.map((p, i) => row(`r${i}`, { position: p }));
  it('uses the midpoint while there is room', () => {
    expect(placeAt(list([1, 2]), 1)).toEqual({ position: 1.5, renumber: [] });
  });
  it('spreads the list out when neighbours touch', () => {
    const r = placeAt(list([1, 1 + 1e-12, 3]), 1);
    expect(r.position).toBe(2);
    expect(r.renumber).toEqual([{ id: 'r0', position: 1 }, { id: 'r1', position: 3 }, { id: 'r2', position: 4 }]);
  });
  it('survives 100 inserts at the same place', () => {
    let l = list([1, 2]);
    for (let k = 0; k < 100; k++) {
      const r = placeAt(l, 1);
      const m = new Map(r.renumber.map((x) => [x.id, x.position]));
      l = [...l.map((x) => ({ ...x, position: m.get(x.id) ?? x.position })), row(`n${k}`, { position: r.position })].sort((a, b) => (a.position as number) - (b.position as number));
    }
    expect(needsRebalance(l)).toBe(false);
    expect(new Set(l.map((x) => x.position)).size).toBe(102);
  });
});
