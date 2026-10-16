import { describe, expect, it } from 'vitest';
import { GOLDEN_MIN, RIYADH, sunTimes } from './sun';

/** Minutes after UTC midnight of that date. */
const utcMin = (t: number) => {
  const d = new Date(t);
  return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
};

describe('sun times (NOAA)', () => {
  // Reference values (NOAA solar calculator), UTC.
  it('Riyadh, 21 June: sunrise ≈ 02:04, sunset ≈ 15:46 UTC (5:04ص / 6:46م)', () => {
    const s = sunTimes(new Date(Date.UTC(2026, 5, 21, 12)), RIYADH.lat, RIYADH.lng)!;
    expect(Math.abs(utcMin(s.sunrise) - (2 * 60 + 4))).toBeLessThan(3);
    expect(Math.abs(utcMin(s.sunset) - (15 * 60 + 46))).toBeLessThan(3);
  });

  it('Riyadh, 21 December: sunrise ≈ 03:34, sunset ≈ 14:09 UTC (6:34ص / 5:09م)', () => {
    const s = sunTimes(new Date(Date.UTC(2026, 11, 21, 12)), RIYADH.lat, RIYADH.lng)!;
    expect(Math.abs(utcMin(s.sunrise) - (3 * 60 + 34))).toBeLessThan(3);
    expect(Math.abs(utcMin(s.sunset) - (14 * 60 + 9))).toBeLessThan(3);
  });

  it('London, 21 June: sunrise ≈ 03:43, sunset ≈ 20:21 UTC', () => {
    const s = sunTimes(new Date(Date.UTC(2026, 5, 21, 12)), 51.5074, -0.1278)!;
    expect(Math.abs(utcMin(s.sunrise) - (3 * 60 + 43))).toBeLessThan(3);
    expect(Math.abs(utcMin(s.sunset) - (20 * 60 + 21))).toBeLessThan(3);
  });

  it('golden hour = 40 minutes before sunset / after sunrise; polar night has none', () => {
    const s = sunTimes(new Date(Date.UTC(2026, 2, 1, 12)), RIYADH.lat, RIYADH.lng)!;
    expect(s.sunset - s.golden).toBe(GOLDEN_MIN * 60_000);
    expect(s.goldenMorningEnd - s.sunrise).toBe(GOLDEN_MIN * 60_000);
    expect(sunTimes(new Date(Date.UTC(2026, 11, 21, 12)), 80, 0)).toBeNull();
  });
});
