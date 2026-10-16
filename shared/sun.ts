/**
 * Sunrise / sunset for a place and a day (UPDATE-2 §5.1), computed locally with the NOAA
 * solar equations (no API, no library). Accurate to about a minute between ±60° latitude.
 *
 * Golden hour (one definition, used everywhere): the 40 minutes after sunrise and the
 * 40 minutes before sunset. The app shows both.
 */

export const GOLDEN_MIN = 40;
export const RIYADH = { lat: 24.7136, lng: 46.6753, label: 'الرياض' };

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface SunTimes {
  sunrise: number;
  sunset: number;
  /** start of the evening golden hour */
  golden: number;
  /** end of the morning golden hour */
  goldenMorningEnd: number;
}

/**
 * `day` = any instant on the wanted UTC calendar date near local noon; times are UTC ms.
 * Returns null on polar day/night.
 */
export function sunTimes(day: Date, lat: number, lng: number): SunTimes | null {
  // Julian day at 12:00 UTC of that date, shifted by longitude to local solar noon
  const noonUtc = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 12);
  const jd = noonUtc / 86_400_000 + 2440587.5 - lng / 360;
  const t = (jd - 2451545) / 36525;
  const L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const M = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const C = Math.sin(rad(M)) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * t) + Math.sin(rad(3 * M)) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const decl = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda))));
  const y = Math.tan(rad(eps / 2)) ** 2;
  const eqTime =
    4 * deg(y * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M)) + 4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) - 0.5 * y * y * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)));
  const cosH = (Math.cos(rad(90.833)) - Math.sin(rad(lat)) * Math.sin(rad(decl))) / (Math.cos(rad(lat)) * Math.cos(rad(decl)));
  if (cosH > 1 || cosH < -1) return null;
  const H = deg(Math.acos(cosH));
  const dayStart = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  const noonMin = 720 - 4 * lng - eqTime;
  const sunrise = dayStart + (noonMin - 4 * H) * 60_000;
  const sunset = dayStart + (noonMin + 4 * H) * 60_000;
  return { sunrise, sunset, golden: sunset - GOLDEN_MIN * 60_000, goldenMorningEnd: sunrise + GOLDEN_MIN * 60_000 };
}

/** Sun times for the device's local date of `now`. */
export function sunToday(now: Date, lat: number, lng: number): SunTimes | null {
  const local = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
  return sunTimes(local, lat, lng);
}

/** «5:18م» */
export function clock(t: number): string {
  const d = new Date(t);
  const h = d.getHours(), m = d.getMinutes();
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')}${h < 12 ? 'ص' : 'م'}`;
}
