/** Constants ported from the prototype (sb-core.js `C`). */

export const SIZES: [string, string][] = [
  ['EWS', 'عامة جداً'], ['WS', 'عامة'], ['FS', 'كاملة'], ['MS', 'متوسطة'], ['MCU', 'متوسطة قريبة'], ['CU', 'قريبة'],
  ['ECU', 'قريبة جداً'], ['Insert', 'تفاصيل'], ['OTS', 'فوق الكتف'], ['POV', 'وجهة نظر'],
];
export const ANGLES = ['مستوى العين', 'منخفضة', 'عالية', 'علوية عمودية (Top-down)', 'مائلة (Dutch)', 'جوية'];
export const MOVES = ['ثابتة', 'بان', 'تلت', 'تتبّع', 'دخول', 'خروج', 'أوربت', 'رفع / نزول', 'ريفيل', 'تحليق علوي', 'يدوي', 'زوم'];
export const ORDER = ['planned', 'shot', 'approved'] as const;
export type Status = (typeof ORDER)[number];
export const STATUS: Record<Status, { label: string; tone: 'outline' | 'dark' | 'accent'; dot: string; ring: string }> = {
  planned: { label: 'مخططة', tone: 'outline', dot: 'transparent', ring: 'var(--color-text-muted)' },
  shot: { label: 'تصوّرت', tone: 'dark', dot: 'var(--color-inverse-bg)', ring: 'var(--color-inverse-bg)' },
  approved: { label: 'معتمدة', tone: 'accent', dot: 'var(--color-accent)', ring: 'var(--color-accent)' },
};
export const GENERAL: Record<string, string[]> = {
  camera: ['كاميرا سينمائية (إيجار)', 'كاميرا أكشن', 'كاميرا 360'],
  support: ['دوللي', 'سلايدر', 'كرين', 'ستيدي كام'],
  lighting: ['ضوء طبيعي', 'ضوء عملي في المكان', 'إضاءة الشارع'],
  audio: ['صوت الموقع', 'ميكروفون لافالير', 'موسيقى فقط'],
  filter: ['بدون فلتر', 'Black Pro-Mist', 'بولارايزر'],
};
export const TEMPLATES = [
  { id: 'ad', label: 'إعلان', scenes: ['افتتاحية', 'المشكلة', 'المنتج', 'الحل', 'الدعوة للإجراء'] },
  { id: 'clip', label: 'فيديو كليب', scenes: ['مقدمة', 'مقطع 1', 'اللازمة', 'مقطع 2', 'اللازمة', 'الختام'] },
  { id: 'short', label: 'فيلم قصير', scenes: ['البداية', 'الحدث المحرّك', 'التصاعد', 'الذروة', 'النهاية'] },
  { id: 'doc', label: 'وثائقي', scenes: ['افتتاحية', 'تعريف', 'مقابلات', 'لقطات داعمة', 'ختام'] },
  { id: 'blank', label: 'فارغ', scenes: [] as string[] },
];
export const ASPECTS = ['16:9', '9:16', '1:1', '2.39:1'] as const;
export const AR: Record<string, number> = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '2.39:1': 2.39 };
export const MOODS = ['gold', 'amber', 'sand', 'clay', 'night', 'olive', 'wine', 'cool'] as const;
export const MOOD_PALETTE: Record<string, { name: string; hex: string }> = {
  gold: { name: 'ذهبي', hex: '#c9a14f' },
  amber: { name: 'عنبري', hex: '#c27a32' },
  sand: { name: 'رملي', hex: '#cdb488' },
  clay: { name: 'طيني', hex: '#94603f' },
  night: { name: 'أزرق ليلي', hex: '#2e3d5c' },
  olive: { name: 'زيتي', hex: '#6c6a3c' },
  wine: { name: 'عنّابي', hex: '#6e2c34' },
  cool: { name: 'رمادي بارد', hex: '#7c8288' },
};
/** Card sizes on the board (world px): [width, height] — defaults per kind (heading: [width, font]). */
export { DEFAULT_SIZE as CARD } from '../../../shared/board';
/** Template dock (UPDATE-1 أ5: 8 templates). heading/image/frame only exist on the board. */
export const TPL = [
  { type: 'scene', label: 'مشهد', icon: 'film' },
  { type: 'note', label: 'ملاحظة', icon: 'file' },
  { type: 'heading', label: 'عنوان', icon: 'heading' },
  { type: 'image', label: 'صورة', icon: 'image' },
  { type: 'frame', label: 'إطار', icon: 'frame' },
  { type: 'character', label: 'شخصية', icon: 'user' },
  { type: 'location', label: 'موقع', icon: 'map-pin' },
  { type: 'moodboard', label: 'لوحة مزاج', icon: 'image' },
] as const;
export type TplType = (typeof TPL)[number]['type'];
export const BOARD_ONLY: TplType[] = ['heading', 'image', 'frame'];

/** Board dot grid spacing (world px). Snapping uses the same value (SPEC 7ب.2). */
export const GRID = 24;
/** Smart-guide snap distance in SCREEN px, whatever the zoom (SPEC 7ب.1). */
export const SNAP_PX = 6;

export const POLL_MS = 10_000;

/** Project stages (UPDATE-1 §2.1). */
export const STAGE_LABEL: Record<string, string> = { idea: 'فكرة', prep: 'تحضير', shoot: 'تصوير', post: 'مونتاج', done: 'منتهي' };
export const STAGE_ORDER = ['idea', 'prep', 'shoot', 'post', 'done'] as const;
