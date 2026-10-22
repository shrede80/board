import { describe, expect, it } from 'vitest';
import {
  alignBoxes, arrangeLayout, cardColors, contrast, distribute, drawOrder, exactGuides, frameAround, GRID, handlesFor, headingColor, insideFrame, nudgeStep, overlaps, reorder, resize, snapEdge,
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

describe('handles by kind (UPDATE-3 §3.2)', () => {
  it('a side never changes the photo height; the card keeps its height', () => {
    for (const kind of ['scene', 'location', 'moodboard', 'image'] as const) {
      const b = box('a', 0, 0, 280, 330);
      for (const handle of ['e', 'w'] as const) {
        const r = resize({ kind, start: b, handle, dx: handle === 'e' ? 80 : -80, dy: 40, photoH: 150 });
        expect(r.box.w, kind).toBe(360);
        expect(r.photoH, kind).toBe(150);
        expect(r.box.h, kind).toBe(330);
      }
    }
  });
  it('a corner keeps the ratio of photo kinds', () => {
    for (const kind of ['scene', 'location', 'moodboard', 'image'] as const) {
      const r = resize({ kind, start: box('a', 0, 0, 280, 330), handle: 'se', dx: 140, dy: -500, photoH: 150 });
      expect(r.box.w).toBe(420);
      expect(r.photoH! / r.box.w).toBeCloseTo(150 / 280, 2);
    }
    // north-west corner keeps the bottom-right corner fixed
    const nw = resize({ kind: 'image', start: box('a', 100, 100, 200, 140), handle: 'nw', dx: -100, dy: 0, photoH: 100 });
    expect(nw.box.x + nw.box.w).toBe(300);
    expect(nw.box.y + nw.box.h).toBe(240);
  });
  it('image top/bottom change only the photo height (cropped), the width stays', () => {
    expect(handlesFor('image')).toContain('n');
    expect(handlesFor('scene')).not.toContain('n');
    const r = resize({ kind: 'image', start: box('i', 0, 0, 260, 180), handle: 's', dx: 30, dy: 60, photoH: 146 });
    expect(r.box).toMatchObject({ w: 260, h: 240 });
    expect(r.photoH).toBe(206);
    const n = resize({ kind: 'image', start: box('i', 0, 100, 260, 180), handle: 'n', dx: 0, dy: 40, photoH: 146 });
    expect(n.photoH).toBe(106);
    expect(n.box.y + n.box.h).toBe(280);
  });
  it('note and frame: a side changes one dimension, a corner both; Shift keeps the ratio', () => {
    const n = box('n', 0, 0, 200, 100);
    expect(resize({ kind: 'note', start: n, handle: 'e', dx: 50, dy: 70 }).box).toMatchObject({ w: 250, h: 100 });
    expect(resize({ kind: 'note', start: n, handle: 's', dx: 50, dy: 70 }).box).toMatchObject({ w: 200, h: 170 });
    expect(resize({ kind: 'frame', start: box('f', 0, 0, 640, 400), handle: 'se', dx: 160, dy: 0, shift: true }).box).toMatchObject({ w: 800, h: 500 });
  });
  it('character: width only, height stays (text wraps)', () => {
    expect(resize({ kind: 'character', start: box('c', 0, 0, 210, 200), handle: 'se', dx: 50, dy: 90 }).box).toMatchObject({ w: 260, h: 200 });
  });
});

describe('arrow keys align like the mouse (UPDATE-3 §3.1)', () => {
  const other = box('o', 0, 0, 280, 330);
  it('a plain arrow moves 1px and shows a guide only on an exact match', () => {
    const r = nudgeStep({ group: box('g', 400, 2, 280, 330), others: [other], dir: 'up', mode: 'step', snap: true });
    expect(r).toMatchObject({ dx: 0, dy: -1, stop: 'step' });
    expect(r.guides).toHaveLength(0);
    const r2 = nudgeStep({ group: box('g', 400, 1, 280, 330), others: [other], dir: 'up', mode: 'step', snap: true });
    expect(r2.dy).toBe(-1);
    expect(r2.guides.some((x) => x.dir === 'h' && x.at === 0)).toBe(true);
  });
  it('Shift stops at the nearest guide or grid line and never passes an edge', () => {
    // top at 6, going up: the other's top (0) and the grid line (0) coincide → the guide wins
    const r = nudgeStep({ group: box('g', 400, 6, 280, 330), others: [other], dir: 'up', mode: 'next', snap: true });
    expect(r.dy).toBe(-6);
    expect(r.stop).toBe('guide');
    // top at 40: grid line 24 comes before the other's top 0
    expect(nudgeStep({ group: box('g', 400, 40, 280, 330), others: [other], dir: 'up', mode: 'next', snap: true })).toMatchObject({ dy: -16, stop: 'grid' });
    // bottom 2px above the other's centre (165): stops on it, not on the grid at 24
    const c = nudgeStep({ group: box('g', 400, -167, 280, 330), others: [other], dir: 'down', mode: 'next', snap: true });
    expect(c).toMatchObject({ dy: 2, stop: 'guide' });
  });
  it('Shift keeps going from an aligned edge (the current line is not a stop)', () => {
    const r = nudgeStep({ group: box('g', 400, 0, 280, 330), others: [other], dir: 'down', mode: 'next', snap: true });
    expect(r.dy).toBeGreaterThan(0);
  });
  it('Alt jumps to the nearest guide in that direction, or does not move', () => {
    const r = nudgeStep({ group: box('g', 400, 500, 100, 100), others: [other], dir: 'left', mode: 'jump', snap: true });
    expect(r).toMatchObject({ dx: -120, stop: 'guide' }); // left edge 400 → other's right edge 280
    expect(r.box?.id).toBe('o');
    expect(nudgeStep({ group: box('g', 400, 500, 100, 100), others: [other], dir: 'right', mode: 'jump', snap: true })).toMatchObject({ dx: 0, dy: 0, stop: 'none' });
  });
  it('magnet off: no guides, Shift = 24, Alt does nothing', () => {
    expect(nudgeStep({ group: box('g', 400, 1, 280, 330), others: [other], dir: 'up', mode: 'step', snap: false }).guides).toHaveLength(0);
    expect(nudgeStep({ group: box('g', 400, 6, 280, 330), others: [other], dir: 'up', mode: 'next', snap: false })).toMatchObject({ dy: -24 });
    expect(nudgeStep({ group: box('g', 400, 6, 280, 330), others: [other], dir: 'up', mode: 'jump', snap: false })).toMatchObject({ dy: 0, stop: 'off' });
  });
  it('a multi-selection moves as one unit (its bounding box aligns)', () => {
    // two boxes 300..380 and 420..500 → group 300..500; centre 400 aligns with a box centred at 410 → jump right 10
    const target = box('t', 360, 800, 100, 50);
    const r = nudgeStep({ group: box('grp', 300, 0, 200, 50), others: [target], dir: 'right', mode: 'jump', snap: true });
    expect(r.dx).toBe(10);
    expect(exactGuides(box('grp', 310, 0, 200, 50), [target]).some((x) => x.dir === 'v' && x.at === 410)).toBe(true);
  });
  it('names the nearest box when several share the line (user note after A1)', () => {
    // both boxes end at y = 330; the near one is 80px away, the far one 1200px
    const far = box('far', 2000, 0, 280, 330), near = box('near', 420, 40, 200, 290);
    const jump = nudgeStep({ group: box('g', 700, 190, 100, 136), others: [far, near], dir: 'down', mode: 'jump', snap: true });
    expect(jump).toMatchObject({ dy: 4, stop: 'guide' });
    expect(jump.box?.id).toBe('near');
    // same with the far box listed first and the near one last
    expect(nudgeStep({ group: box('g', 700, 190, 100, 136), others: [near, far], dir: 'down', mode: 'jump', snap: true }).box?.id).toBe('near');
    const step = nudgeStep({ group: box('g', 700, 193, 100, 136), others: [far, near], dir: 'down', mode: 'step', snap: true });
    expect(step.guides.filter((x) => x.dir === 'h' && x.at === 330)).toHaveLength(1);
    expect(step.box?.id).toBe('near');
  });

  it('works in metres for the plan (5 cm step, 25 cm grid)', () => {
    const r = nudgeStep({ group: { id: 'c', x: 1.1, y: 0, w: 0.4, h: 0.4 }, others: [], dir: 'right', mode: 'next', snap: true, step: 0.05, grid: 0.25, eps: 0.001 });
    expect(r.dx).toBeCloseTo(0.15, 6);
    expect(nudgeStep({ group: { id: 'c', x: 1.1, y: 0, w: 0.4, h: 0.4 }, others: [], dir: 'left', mode: 'step', snap: true, step: 0.05 }).dx).toBeCloseTo(-0.05, 6);
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
