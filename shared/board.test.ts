import { describe, expect, it } from 'vitest';
import {
  alignBoxes, arrangeLayout, cardColors, contrast, distribute, drawOrder, frameAround, GRID, headingColor, insideFrame, overlaps, reorder, resize, snapEdge,
  type ArrangeItem, type Box,
} from './board';

const box = (id: string, x: number, y: number, w: number, h: number): Box => ({ id, x, y, w, h });

describe('resize (UPDATE-1 أ4)', () => {
  it('scene: east handle changes width within 220–640, west keeps the right edge', () => {
    const s = box('s', 100, 100, 280, 330);
    expect(resize({ kind: 'scene', start: s, handle: 'e', dx: 60, dy: 50 }).box).toMatchObject({ x: 100, w: 340, h: 330 });
    expect(resize({ kind: 'scene', start: s, handle: 'e', dx: 900, dy: 0 }).box.w).toBe(640);
    const w = resize({ kind: 'scene', start: s, handle: 'w', dx: 200, dy: 0 }).box;
    expect(w.w).toBe(220);
    expect(w.x + w.w).toBe(380);
  });

  it('note: corners change both sides, clamped to 160×90 – 640×640', () => {
    const n = box('n', 0, 0, 210, 130);
    expect(resize({ kind: 'note', start: n, handle: 'se', dx: 100, dy: 50 }).box).toMatchObject({ w: 310, h: 180 });
    expect(resize({ kind: 'note', start: n, handle: 'nw', dx: 500, dy: 500 }).box).toMatchObject({ w: 160, h: 90, x: 50, y: 40 });
  });

  it('image keeps its ratio; heading corner scales the font, side only the wrap width', () => {
    const im = box('i', 0, 0, 200, 100);
    expect(resize({ kind: 'image', start: im, handle: 'se', dx: 100, dy: 0, aspect: 2 }).box).toMatchObject({ w: 300, h: 150 });
    const h = box('h', 0, 0, 300, 48);
    const corner = resize({ kind: 'heading', start: h, handle: 'se', dx: 300, dy: 0, font: 40 });
    expect(corner.font).toBe(80);
    expect(corner.box.w).toBe(600);
    const side = resize({ kind: 'heading', start: h, handle: 'e', dx: 100, dy: 0, font: 40 });
    expect(side.font).toBe(40);
    expect(side.box.w).toBe(400);
    expect(resize({ kind: 'heading', start: h, handle: 'se', dx: 5000, dy: 0, font: 40 }).font).toBe(120);
  });

  it('frame resizes freely in both directions', () => {
    const f = box('f', 0, 0, 640, 400);
    expect(resize({ kind: 'frame', start: f, handle: 's', dx: 999, dy: 200 }).box).toMatchObject({ w: 640, h: 600 });
  });

  it('the moving edge snaps to another box (guide) within the tolerance, else to the grid', () => {
    const s = box('s', 0, 0, 280, 330);
    const other = box('o', 400, 0, 280, 330);
    // right edge 280+115 = 395 → snaps to the other's left edge 400 and draws a guide
    const r = resize({ kind: 'scene', start: s, handle: 'e', dx: 115, dy: 0, snap: { others: [other], tol: 6 } });
    expect(r.box.w).toBe(400);
    expect(r.guides).toHaveLength(1);
    expect(r.guides[0]).toMatchObject({ dir: 'v', at: 400 });
    // far from any box → grid
    const g = resize({ kind: 'scene', start: s, handle: 'e', dx: 50, dy: 0, snap: { others: [other], tol: 6 } });
    expect((g.box.x + g.box.w) % GRID).toBe(0);
    expect(g.guides).toHaveLength(0);
    expect(snapEdge(397, 'x', [other], 6)).toMatchObject({ v: 400 });
    expect(snapEdge(290, 'x', [other], 6)).toMatchObject({ v: 288, box: null });
  });
});

describe('auto-arrange with mixed sizes never overlaps (UPDATE-1 أ4)', () => {
  it('scenes of different widths + every card kind', () => {
    const scenes = [280, 640, 220, 400, 300, 280, 500].map((w, i) => box(`s${i}`, i * 37, i * 11, w, 330 + (i % 3) * 40));
    const kinds = ['note', 'heading', 'image', 'character', 'location', 'moodboard'] as const;
    const cards: ArrangeItem[] = [];
    for (let i = 0; i < 24; i++) {
      const kind = kinds[i % kinds.length];
      cards.push({ id: `c${i}`, kind, x: (i * 53) % 900, y: (i * 71) % 700, w: 160 + ((i * 97) % 600), h: 90 + ((i * 41) % 500) });
    }
    cards.push({ id: 'frame', kind: 'frame', x: 0, y: 0, w: 5000, h: 4000 });
    const pos = arrangeLayout(scenes, cards, 1400);
    expect(pos.frame).toBeUndefined(); // frames stay where they are
    const placed = [...scenes, ...cards.filter((c) => c.kind !== 'frame')].map((b) => ({ ...b, ...pos[b.id] }));
    expect(placed.every((b) => pos[b.id])).toBe(true);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) expect(overlaps(placed[i], placed[j]), `${placed[i].id} × ${placed[j].id}`).toBe(false);
    }
    // scene 01 top-right, 02 to its left (RTL)
    expect(pos.s0.y).toBe(pos.s1.y);
    expect(pos.s1.x).toBeLessThan(pos.s0.x);
  });
});

describe('align, distribute, frames, layers', () => {
  const bs = [box('a', 0, 0, 100, 50), box('b', 300, 40, 50, 80), box('c', 120, 200, 60, 20)];

  it('aligns to the selection edges and centres', () => {
    expect(alignBoxes(bs, 'left')).toMatchObject({ a: { x: 0 }, b: { x: 0 }, c: { x: 0 } });
    expect(alignBoxes(bs, 'right')).toMatchObject({ a: { x: 250 }, b: { x: 300 }, c: { x: 290 } });
    expect(alignBoxes(bs, 'top')).toMatchObject({ a: { y: 0 }, b: { y: 0 }, c: { y: 0 } });
    expect(alignBoxes(bs, 'bottom').c.y).toBe(200);
    expect(alignBoxes(bs, 'hcenter').a.x).toBe(125);
  });

  it('distributes with equal gaps, outer boxes fixed', () => {
    const d = distribute(bs, 'h');
    expect(d.a.x).toBe(0);
    expect(d.b.x).toBe(300);
    // gap = (350 - 210) / 2 = 70 → c at 170
    expect(d.c.x).toBe(170);
    expect(distribute(bs.slice(0, 2), 'h')).toEqual({});
  });

  it('frame membership by centre; frame around the selection with a 40px margin', () => {
    const f = box('f', -10, -10, 200, 120);
    expect(insideFrame(f, [...bs, f])).toEqual(['a']);
    expect(frameAround([bs[0], bs[2]])).toEqual({ x: -40, y: -40, w: 260, h: 300 });
  });

  it('reorders layers and renumbers', () => {
    const items = [{ id: 'a', z: 0 }, { id: 'b', z: 0 }, { id: 'c', z: 0 }];
    expect(reorder(items, ['a'], 'front')).toEqual({ b: 1, c: 2, a: 3 });
    expect(reorder(items, ['c'], 'back')).toEqual({ c: 1, a: 2, b: 3 });
    expect(reorder(items, ['a'], 'forward')).toEqual({ b: 1, a: 2, c: 3 });
    expect(reorder([{ id: 'a', z: 1 }, { id: 'b', z: 2 }], ['b'], 'backward')).toEqual({ b: 1, a: 2 });
    expect(drawOrder([{ id: 'x', z: 2 }, { id: 'y', z: 1 }, { id: 'z', z: 1 }]).map((i) => i.id)).toEqual(['y', 'z', 'x']);
  });
});

describe('note / frame / heading colours are readable (AA)', () => {
  it('every colour in both themes', () => {
    for (const key of ['gold', 'amber', 'sand', 'clay', 'night', 'olive', 'wine', 'cool']) {
      for (const theme of ['light', 'dark'] as const) {
        const c = cardColors(key, theme)!;
        expect(contrast(c.bg, c.fg), `${key} ${theme}`).toBeGreaterThanOrEqual(4.5);
        const h = headingColor(key, theme)!;
        expect(contrast(h, theme === 'light' ? '#fdfcfa' : '#141210'), `heading ${key} ${theme}`).toBeGreaterThanOrEqual(3);
      }
    }
    expect(cardColors(null, 'light')).toBeNull();
  });
});

describe('duplicate scene = deep copy (UPDATE-1 أ6)', () => {
  it('copies shots, photos by reference, links; notes become new copies', async () => {
    const { copySceneOps } = await import('./copy');
    const row = (id: string, f: Record<string, unknown>) => ({ id, updatedAt: 5, deletedAt: null, ...f });
    let n = 0;
    const res = copySceneOps(
      {
        scene: row('sc-a', { projectId: 'p', name: 'الوصول', position: 2, boardX: 100, boardY: 50, mood: 'gold', locationId: 'loc-1', boardLocked: true }),
        shots: [row('sh-1', { projectId: 'p', sceneId: 'sc-a', position: 1, description: 'واسعة', status: 'shot', coverImageId: 'img-1' })],
        shotImages: [row('ii-1', { projectId: 'p', ownerKind: 'shot', ownerId: 'sh-1', imageId: 'img-1', position: 1 })],
        chars: ['ch-1', 'ch-gone'],
        notes: [row('note-1', { projectId: 'p', text: 'إذن التصوير' })],
        moodboards: ['mb-1'],
      },
      { projectId: 'p', position: 2.5, dx: 24, dy: 24, z: 9, newId: (pre) => `${pre}-n${++n}`, exists: (_k, id) => id !== 'ch-gone' },
    );
    const by = (e: string) => res.ops.filter((o) => o.op === 'create' && o.entity === e) as { id: string; fields: Record<string, unknown> }[];
    const sc = by('scenes')[0];
    expect(sc.id).toBe(res.sceneId);
    expect(sc.fields).toMatchObject({ name: 'الوصول (نسخة)', position: 2.5, boardX: 124, boardY: 74, mood: 'gold', locationId: 'loc-1', boardLocked: false, boardZ: 9 });
    const sh = by('shots')[0];
    expect(sh.id).not.toBe('sh-1');
    expect(sh.fields).toMatchObject({ sceneId: res.sceneId, description: 'واسعة', status: 'shot', coverImageId: 'img-1' });
    expect(by('itemImages')[0].fields).toMatchObject({ ownerId: sh.id, imageId: 'img-1' });
    expect(by('sceneCharacters').map((o) => o.id)).toEqual([`${res.sceneId}:ch-1`]);
    const note = by('notes')[0];
    expect(note.id).not.toBe('note-1');
    expect(note.fields.text).toBe('إذن التصوير');
    expect(by('sceneLinks').map((o) => o.id).sort()).toEqual([`${res.sceneId}:moodboard:mb-1`, `${res.sceneId}:note:${note.id}`].sort());
  });
});
