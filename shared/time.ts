/**
 * Arabic date wording for Home and the ideas box (UPDATE-1 ب1, ب2). Western digits, local time.
 */

export const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (a: Date, b: Date) => Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 864e5);

/** 1:05م · 9:41ص */
export function clock(d: Date): string {
  const h = d.getHours(), m = d.getMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h < 12 ? 'ص' : 'م'}`;
}

/** «الأحد 12 أكتوبر» (+ the year when it isn't this year) */
export function longDate(d: Date, now = new Date()): string {
  return `${AR_DAYS[d.getDay()]} ${d.getDate()} ${AR_MONTHS[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}

/** Idea time: «اليوم 1:05م» · «أمس 9:41م» · «الأحد 12 أكتوبر» */
export function ideaTime(ms: number, now = new Date()): string {
  const d = new Date(ms);
  const diff = dayDiff(now, d);
  if (diff === 0) return `اليوم ${clock(d)}`;
  if (diff === 1) return `أمس ${clock(d)}`;
  return longDate(d, now);
}

const count = (n: number, one: string, two: string, few: string, many: string) => (n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`);

/** «آخر تعديل …»: الآن · قبل 5 دقائق · قبل ساعتين · أمس · 9 أكتوبر */
export function lastEdit(ms: number, now = new Date()): string {
  const s = Math.max(0, now.getTime() - ms) / 1000;
  if (s < 60) return 'الآن';
  if (s < 3600) return `قبل ${count(Math.floor(s / 60), 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة')}`;
  const d = new Date(ms);
  const diff = dayDiff(now, d);
  if (diff === 0) return `قبل ${count(Math.floor(s / 3600), 'ساعة', 'ساعتين', 'ساعات', 'ساعة')}`;
  if (diff === 1) return 'أمس';
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}

/** Local date of a YYYY-MM-DD (+ optional HH:MM). */
export function shootAt(date: string, time?: string | null): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '').split(':').map(Number);
  return new Date(y, m - 1, d, time ? hh || 0 : 0, time ? mm || 0 : 0);
}

/** YYYY-MM-DD of a local date. */
export function isoDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface Countdown {
  /** big number + its word, e.g. 3 «أيام»; null number = a word only («اليوم»، «بكرة») */
  big: { n: number | null; word: string };
  /** with a start time: the smaller units */
  units: { n: number; word: string }[];
  /** «بعد 3 أيام» style sentence */
  phrase: string;
  past: boolean;
}

const daysWord = (n: number) => (n === 1 ? 'يوم' : n === 2 ? 'يومان' : n <= 10 ? 'أيام' : 'يوماً');
const hoursWord = (n: number) => (n === 1 ? 'ساعة' : n === 2 ? 'ساعتان' : n <= 10 ? 'ساعات' : 'ساعة');
const minsWord = (n: number) => (n === 1 ? 'دقيقة' : n === 2 ? 'دقيقتان' : n <= 10 ? 'دقائق' : 'دقيقة');

/**
 * «التصوير القادم» (UPDATE-1 ب1): with a time → days · hours · minutes; without → «بعد 3 أيام» ·
 * «بكرة» · «اليوم».
 */
export function countdown(date: string, time: string | null | undefined, now = new Date()): Countdown {
  const target = shootAt(date, time);
  const days = dayDiff(target, now);
  const inDays = (n: number) => (n === 1 ? 'بكرة' : n === 2 ? 'بعد يومين' : `بعد ${n} ${daysWord(n)}`);
  if (!time) {
    if (days <= 0) return { big: { n: null, word: 'اليوم' }, units: [], phrase: 'اليوم', past: days < 0 };
    if (days === 1) return { big: { n: null, word: 'بكرة' }, units: [], phrase: 'بكرة', past: false };
    return { big: { n: days, word: daysWord(days) }, units: [], phrase: inDays(days), past: false };
  }
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return { big: { n: null, word: 'اليوم' }, units: [], phrase: 'اليوم', past: days < 0 };
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440), h = Math.floor((totalMin % 1440) / 60), m = totalMin % 60;
  const units = [{ n: h, word: hoursWord(h) }, { n: m, word: minsWord(m) }];
  if (d > 0) return { big: { n: d, word: daysWord(d) }, units, phrase: days === 0 ? 'اليوم' : inDays(days), past: false };
  if (h > 0) return { big: { n: h, word: hoursWord(h) }, units: [{ n: m, word: minsWord(m) }], phrase: days === 0 ? 'اليوم' : 'بكرة', past: false };
  return { big: { n: m, word: minsWord(m) }, units: [], phrase: 'اليوم', past: false };
}

/** «صباح الخير» before noon, «مساء الخير» after. */
export const greeting = (now = new Date()) => (now.getHours() < 12 ? 'صباح الخير' : 'مساء الخير');
