/**
 * «الجوال مثل اللابتوب» (UPDATE-4, CLAUDE.md decision 14): for every command of the laptop's
 * shortcut table (shared/keys.ts COMMANDS) — where it lives on the phone. `phone` is a data-testid
 * (or a menu item's testid) that must exist in the phone's code; `keyboard` marks what is only a
 * keyboard shortcut (the one exception to the rule), with the reason.
 * A new command in COMMANDS fails shared/parity.test.ts until it is listed here.
 */
export type Twin = { phone: string } | { keyboard: string };

export const PHONE_TWIN: Record<string, Twin> = {
  // general
  search: { phone: 'm-search' },
  undo: { phone: 'm-undo' },
  redo: { phone: 'm-redo' },
  modeBoard: { phone: 'm-board' }, // the «لوحة الأفكار» tab
  modeStoryboard: { phone: 'm-scenes' }, // the «المشاهد» / «اللقطات» tabs
  library: { phone: 'm-library' }, // the «المكتبة» tab
  theme: { phone: 'm-theme-quick' }, // المزيد ← الوضع الداكن (والإعدادات ← المظهر)
  sheet: { keyboard: 'ورقة الاختصارات: لا اختصارات على الجوال' },
  esc: { keyboard: 'الإغلاق على الجوال بالرجوع (حركة الرجوع) وبزر ✕' },
  // move and align
  nudge: { keyboard: 'تحريك 1px بالأسهم: على الجوال السحب بالإصبع' },
  nudgeNext: { keyboard: 'أسهم + Shift' },
  nudgeJump: { keyboard: 'أسهم + Alt' },
  alignRight: { phone: 'm-align-right' },
  alignLeft: { phone: 'm-align-left' },
  alignTop: { phone: 'm-align-top' },
  alignBottom: { phone: 'm-align-bottom' },
  centerH: { phone: 'm-align-hcenter' },
  centerV: { phone: 'm-align-vmiddle' },
  distributeH: { phone: 'm-dist-h' },
  distributeV: { phone: 'm-dist-v' },
  sameWidth: { phone: 'm-uniform' },
  magnet: { phone: 'm-board-snap' },
  altDrag: { keyboard: 'Alt وقت السحب: على الجوال زر المغناطيس في ⋯' },
  // add
  addScene: { phone: 'm-board-add-scene' },
  addNote: { phone: 'm-board-add-note' },
  addHeading: { phone: 'm-board-add-heading' },
  addFrame: { phone: 'm-board-add-frame' },
  frameSel: { phone: 'm-frame-around' },
  addImage: { phone: 'm-board-add-image' },
  addCharacter: { phone: 'm-board-add-character' },
  addLocation: { phone: 'm-board-add-location' },
  addMoodboard: { phone: 'm-board-add-moodboard' },
  // edit
  copy: { phone: 'm-board-copy' }, // نسخ (m-board-cut قص، m-board-paste لصق)
  duplicate: { phone: 'm-board-dup' },
  selectAll: { phone: 'm-board-select-all' },
  forward: { phone: 'm-order' },
  backward: { phone: 'm-order' },
  front: { phone: 'm-order' },
  back: { phone: 'm-order' },
  lock: { phone: 'm-board-lock' },
  open: { phone: 'm-board-open' },
  rename: { phone: 'm-rename' },
  delete: { phone: 'm-board-delete' },
  // view
  fit: { phone: 'm-board-fit' },
  zoomSel: { phone: 'm-board-zoom-sel' },
  zoom100: { phone: 'm-board-zoom-100' },
  zoomIn: { phone: 'm-board-zoom-in' },
  zoomOut: { phone: 'm-board-zoom-out' },
  pan: { keyboard: 'مسافة + سحب: على الجوال إصبع على الفراغ' },
  arrange: { phone: 'm-board-arrange' },
  // storyboard
  sbShot: { phone: 'm-add-shot' },
  sbScene: { phone: 'm-add-scene' },
  sbDuplicate: { phone: 'm-dup-shot' },
  sbNext: { phone: 'm-next' },
  sbPrev: { phone: 'm-prev' },
  sbShotDone: { phone: 'm-status' },
  // shot plan
  planCamera: { phone: 'plan-m-add' },
  planLight: { phone: 'plan-m-add' },
  planPerson: { phone: 'plan-m-add' },
  planRotate: { phone: 'plan-h-rot' }, // مقبض الدوران (خطوات 15°)
  planRotateBack: { phone: 'plan-h-rot' },
  planNudge: { keyboard: 'تحريك 5 سم بالأسهم: على الجوال السحب بالإصبع' },
  planFit: { phone: 'plan-fit' },
};
