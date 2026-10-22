import { describe, expect, it } from 'vitest';
import { beamOf, camDefaults, cctColor, focalOf, footprint, frameWidth, freeSpot, hfov, nextLetter, planSvg, rotFromPoint, snapM, type PlanItem } from './plan';

const item = (o: Partial<PlanItem>): PlanItem => ({ id: 'p', sceneId: 's', kind: 'camera', refId: 'cam-zve10', x: 0, y: 0, rot: 0, w: 1, h: 1, z: 0, label: 'A', color: null, props: {}, ...o });

describe('angle of view from the real lens (UPDATE-3 §6.4)', () => {
  it('the whole table, ±0.2°', () => {
    const t: [string, number, boolean, number][] = [
      ['cam-zve10', 18, false, 66.3], ['cam-zve10', 24, false, 52.2], ['cam-zve10', 35, false, 37.1], ['cam-zve10', 50, false, 26.4], ['cam-zve10', 16, false, 72.6],
      ['cam-iphone15', 13, false, 108.3], ['cam-iphone15', 24, false, 73.7], ['cam-iphone15', 48, false, 41.1], ['cam-iphone15', 77, false, 26.3], ['cam-iphone15', 24, true, 45.7],
      ['cam-mini4', 24, false, 73.7], ['cam-hx200v', 27, false, 67.4],
    ];
    for (const [cam, f, v, want] of t) expect(Math.abs(hfov(cam, f, v) - want), `${cam} ${f}mm${v ? ' vertical' : ''}`).toBeLessThanOrEqual(0.2);
  });
  it('frame width at a distance: iPhone 1x at 3 m ≈ 4.5 m', () => {
    expect(frameWidth(hfov('cam-iphone15', 24), 3)).toBeCloseTo(4.5, 1);
    expect(frameWidth(90, 1)).toBeCloseTo(2, 6);
  });
  it('defaults and fixed lenses; any other camera uses the generic 35mm maths', () => {
    expect(camDefaults('cam-zve10')).toEqual({ lens: 'lens-sigma1850', focalMm: 24 });
    expect(camDefaults('cam-iphone15')).toEqual({ lens: '1x', focalMm: 24 });
    expect(camDefaults('cam-mini4').focalMm).toBe(24);
    expect(focalOf(item({ refId: 'cam-mini4', props: { focalMm: 80 } }))).toBe(24);
    expect(hfov('cam-new-one', 24)).toBeCloseTo(73.7, 1);
  });
});

describe('lights, items, helpers', () => {
  it('beam per light and modifier (§6.5)', () => {
    expect(beamOf(item({ kind: 'light', refId: 'lt-hs60b' }))).toBe(55);
    expect(beamOf(item({ kind: 'light', refId: 'lt-hs60b', props: { modifier: 'lt-softbox45' } }))).toBe(95);
    expect(beamOf(item({ kind: 'light', refId: 'lt-hs60b', props: { modifier: 'lt-lantern30' } }))).toBe(360);
    expect(beamOf(item({ kind: 'light', refId: 'lt-ua20c' }))).toBe(120);
    expect(beamOf(item({ kind: 'light', refId: 'lt-lm07' }))).toBe(110);
    expect(beamOf(item({ kind: 'light', refId: 'lt-desiontal' }))).toBe(110);
    expect(beamOf(item({ kind: 'light', refId: 'lt-reflector' }))).toBe(60);
    expect(beamOf(item({ kind: 'light', refId: 'lt-mirror' }))).toBe(18);
    // 2700K amber → 6500K bluish white
    expect(cctColor(2700)).toBe('#ffa040');
    expect(cctColor(6500)).toBe('#cde0ff');
  });
  it('letters, snapping to 25 cm, rotation in 15° steps (Alt free), rotated footprints', () => {
    expect(nextLetter([{ kind: 'camera', label: 'A' }, { kind: 'camera', label: 'C' }])).toBe('B');
    expect(snapM(1.13, true)).toBe(1.25);
    expect(snapM(1.137, false)).toBe(1.14);
    expect(rotFromPoint(0, 0, 1, 0, false)).toBe(90);
    expect(rotFromPoint(0, 0, 1, -1.1, false)).toBe(45);
    expect(rotFromPoint(0, 0, 1, -1.1, true)).toBeCloseTo(42.27, 1);
    const f = footprint(item({ kind: 'furniture', w: 2, h: 1, rot: 90 }));
    expect(f.w).toBeCloseTo(1, 6);
    expect(f.h).toBeCloseTo(2, 6);
  });
  it('the PNG/PDF drawing has the cones, the labels and the key', () => {
    const names = { cam: () => 'ZV-E10', light: () => 'HS60B', lens: () => 'Sigma 18-50' };
    const { svg, height } = planSvg([item({ props: { focalMm: 24, range: 4 } }), item({ id: 'l', kind: 'light', refId: 'lt-hs60b', label: 'رئيسية', props: { range: 3 } })], { title: 'مشروع', subtitle: 'المشهد 01', names });
    expect(svg).toContain('A · 24mm · 52°');
    expect(svg).toContain('ZV-E10');
    expect(svg).toContain('radialGradient');
    expect(height).toBeGreaterThan(100);
  });
});

describe('a new item never lands on another (user note after phase B)', () => {
  it('a free spot stays; a taken one steps 50 cm until free; zones don’t count', () => {
    expect(freeSpot([], { x: 1, y: 1 })).toEqual({ x: 1, y: 1 });
    expect(freeSpot([{ x: 1, y: 1 }], { x: 1, y: 1 })).toEqual({ x: 1.5, y: 1.5 });
    expect(freeSpot([{ x: 1, y: 1 }, { x: 1.5, y: 1.5 }], { x: 1, y: 1 })).toEqual({ x: 2, y: 2 });
    expect(freeSpot([{ x: 1, y: 1, kind: 'zone' }], { x: 1, y: 1 })).toEqual({ x: 1, y: 1 });
  });
});
