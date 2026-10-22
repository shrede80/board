/**
 * «اختصاراتك» (UPDATE-3 §3.3): one table of commands with their default keys, and the rules for
 * changing them. Keys are stored by physical key (KeyboardEvent.code), so they work with the
 * Arabic layout too: 'Mod+KeyD', 'Alt+Shift+KeyH', 'Shift+Slash' (= ?). Mod = Ctrl or ⌘.
 * Only the changed keys are saved (prefs 'keys': { [commandId]: combo | null }).
 * Pure: no DOM; the web app maps command ids to actions (web/src/app/commands.ts).
 */

/** 'all' clashes with every screen; the others only inside their own screen. */
export type KeyCtx = 'all' | 'board' | 'storyboard' | 'plan';

export interface KeyGroup {
  id: string;
  title: string;
  ctx: KeyCtx;
}

export const KEY_GROUPS: KeyGroup[] = [
  { id: 'general', title: 'عام', ctx: 'all' },
  { id: 'move', title: 'تحريك ومحاذاة', ctx: 'board' },
  { id: 'add', title: 'إضافة', ctx: 'board' },
  { id: 'edit', title: 'تحرير', ctx: 'board' },
  { id: 'view', title: 'العرض', ctx: 'board' },
  { id: 'storyboard', title: 'الستوري بورد', ctx: 'storyboard' },
  { id: 'plan', title: 'مخطط التصوير', ctx: 'plan' },
];

export interface CommandDef {
  id: string;
  label: string;
  group: string;
  /** default keys; the first one is the one shown. [] = no key by default */
  keys: string[];
  /** 🔒 cannot be changed (Esc, arrows, Space + drag, Alt while dragging, copy/cut/paste, Delete) */
  fixed?: boolean;
  hint?: string;
  /** also runs while typing in a field (e.g. search) */
  whileTyping?: boolean;
}

const c = (group: string, id: string, label: string, keys: string[], more: Partial<CommandDef> = {}): CommandDef => ({ id, label, group, keys, ...more });

export const COMMANDS: CommandDef[] = [
  c('general', 'search', 'البحث', ['Mod+KeyK'], { whileTyping: true }),
  c('general', 'undo', 'تراجع', ['Mod+KeyZ']),
  c('general', 'redo', 'إعادة', ['Mod+Shift+KeyZ', 'Mod+KeyY']),
  c('general', 'modeBoard', 'لوحة الأفكار', ['Alt+Digit1']),
  c('general', 'modeStoryboard', 'الستوري بورد', ['Alt+Digit2']),
  c('general', 'library', 'إظهار / إخفاء المكتبة', ['Alt+KeyL']),
  c('general', 'theme', 'الوضع الداكن', []),
  c('general', 'sheet', 'ورقة الاختصارات', ['Shift+Slash']),
  c('general', 'esc', 'إغلاق / إلغاء', ['Escape'], { fixed: true }),

  c('move', 'nudge', 'تحريك 1px', ['ArrowLeft'], { fixed: true, hint: 'ويطلع خط المحاذاة' }),
  c('move', 'nudgeNext', 'خطوة للمحطة التالية', ['Shift+ArrowLeft'], { fixed: true, hint: 'توقف عند أول خط محاذاة أو شبكة' }),
  c('move', 'nudgeJump', 'قفزة لخط المحاذاة', ['Alt+ArrowLeft'], { fixed: true }),
  c('move', 'alignRight', 'محاذاة لليمين', ['Alt+KeyD']),
  c('move', 'alignLeft', 'محاذاة لليسار', ['Alt+KeyA']),
  c('move', 'alignTop', 'محاذاة للأعلى', ['Alt+KeyW']),
  c('move', 'alignBottom', 'محاذاة للأسفل', ['Alt+KeyS']),
  c('move', 'centerH', 'توسيط أفقي', ['Alt+KeyH']),
  c('move', 'centerV', 'توسيط عمودي', ['Alt+KeyV']),
  c('move', 'distributeH', 'توزيع أفقي', ['Alt+Shift+KeyH']),
  c('move', 'distributeV', 'توزيع عمودي', ['Alt+Shift+KeyV']),
  c('move', 'sameWidth', 'توحيد العرض', []),
  c('move', 'magnet', 'تشغيل / إيقاف المغناطيس', ['KeyM']),
  c('move', 'altDrag', 'إيقاف المحاذاة وقت السحب', ['Alt'], { fixed: true, hint: 'اضغطه وأنت تسحب' }),

  c('add', 'addScene', 'مشهد', ['KeyS']),
  c('add', 'addNote', 'ملاحظة', ['KeyN']),
  c('add', 'addHeading', 'عنوان', ['KeyT']),
  c('add', 'addFrame', 'إطار', ['KeyF']),
  c('add', 'frameSel', 'إطار حول المحدد', ['Mod+KeyG']),
  c('add', 'addImage', 'صورة', ['KeyI']),
  c('add', 'addCharacter', 'شخصية', []),
  c('add', 'addLocation', 'موقع', []),
  c('add', 'addMoodboard', 'لوحة مزاج', []),

  c('edit', 'copy', 'نسخ · قص · لصق', ['Mod+KeyC', 'Mod+KeyX', 'Mod+KeyV'], { fixed: true }),
  c('edit', 'duplicate', 'تكرار', ['Mod+KeyD']),
  c('edit', 'selectAll', 'تحديد الكل', ['Mod+KeyA']),
  c('edit', 'forward', 'للأمام', ['BracketRight']),
  c('edit', 'backward', 'للخلف', ['BracketLeft']),
  c('edit', 'front', 'للأعلى', ['Mod+BracketRight']),
  c('edit', 'back', 'للأسفل', ['Mod+BracketLeft']),
  c('edit', 'lock', 'قفل / فك القفل', ['KeyL']),
  c('edit', 'open', 'فتح المحدد', ['Enter']),
  c('edit', 'rename', 'إعادة التسمية', ['F2']),
  c('edit', 'delete', 'حذف', ['Delete', 'Backspace'], { fixed: true }),

  c('view', 'fit', 'ملاءمة الكل', ['Shift+Digit1']),
  c('view', 'zoomSel', 'تكبير على المحدد', ['Shift+Digit2']),
  c('view', 'zoom100', 'حجم 100%', ['Shift+Digit0']),
  c('view', 'zoomIn', 'تكبير', ['Equal']),
  c('view', 'zoomOut', 'تصغير', ['Minus']),
  c('view', 'pan', 'تحريك اللوحة', ['Space'], { fixed: true, hint: 'مسافة + سحب' }),
  c('view', 'arrange', 'ترتيب تلقائي', []),

  c('storyboard', 'sbShot', 'لقطة جديدة في المشهد المحدد', ['KeyN']),
  c('storyboard', 'sbScene', 'مشهد جديد', ['Shift+KeyN']),
  c('storyboard', 'sbDuplicate', 'تكرار اللقطة', ['Mod+KeyD']),
  c('storyboard', 'sbNext', 'اللقطة التالية (والمحرر مفتوح)', ['Alt+ArrowLeft']),
  c('storyboard', 'sbPrev', 'اللقطة السابقة', ['Alt+ArrowRight']),
  c('storyboard', 'sbShotDone', 'تصوّرت ✓', []),

  c('plan', 'planCamera', 'كاميرا', ['KeyC']),
  c('plan', 'planLight', 'ضوء', ['KeyL']),
  c('plan', 'planPerson', 'شخص', ['KeyP']),
  c('plan', 'planRotate', 'تدوير 15°', ['KeyR']),
  c('plan', 'planRotateBack', 'تدوير عكسي', ['Shift+KeyR']),
  c('plan', 'planNudge', 'تحريك 5 سم', ['ArrowLeft'], { fixed: true, hint: 'وShift للمحطة التالية' }),
  c('plan', 'planFit', 'ملاءمة', ['Shift+Digit1']),
];

export const COMMAND_BY_ID: Record<string, CommandDef> = Object.fromEntries(COMMANDS.map((x) => [x.id, x]));
const GROUP_CTX: Record<string, KeyCtx> = Object.fromEntries(KEY_GROUPS.map((g) => [g.id, g.ctx]));
export const ctxOf = (id: string): KeyCtx => GROUP_CTX[COMMAND_BY_ID[id]?.group] ?? 'all';

/** Browser and system keys: never accepted (UPDATE-3 §3.3). Both systems, since keys sync between devices. */
export const RESERVED = new Set([
  'Mod+KeyW', 'Mod+KeyT', 'Mod+KeyN', 'Mod+KeyQ', 'Mod+KeyR', 'Mod+KeyL', 'Mod+Tab', 'Mod+Shift+KeyT', 'Mod+Shift+KeyL',
  'Mod+KeyH', 'Mod+KeyM', 'Mod+Backquote', 'F5', 'F11', 'F12', 'Alt+F4', 'Mod+Shift+KeyN', 'Mod+Shift+KeyW', 'Mod+Shift+Tab',
]);

export type KeyOverrides = Record<string, string | null>;

/** Effective keys per command: defaults with the saved changes on top (null = no key). */
export function effectiveKeys(over: KeyOverrides | null | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const cmd of COMMANDS) {
    const o = !cmd.fixed && over && Object.prototype.hasOwnProperty.call(over, cmd.id) ? over[cmd.id] : undefined;
    out[cmd.id] = o === undefined ? [...cmd.keys] : o === null ? [] : [o];
  }
  return out;
}

export const isChanged = (over: KeyOverrides | null | undefined, id: string) =>
  !!over && Object.prototype.hasOwnProperty.call(over, id) && !COMMAND_BY_ID[id]?.fixed && (over[id] ?? null) !== (COMMAND_BY_ID[id].keys[0] ?? null);

const MODS = ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Fn'];

/** Physical-key combo of a key event ('Mod+Alt+Shift+Code'), or null for a lone modifier. */
export function comboOf(e: { code: string; key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }): string | null {
  if (MODS.includes(e.key)) return null;
  const code = e.code || '';
  if (!code) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Mod');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(code);
  return parts.join('+');
}

/** Contexts that are active together: the screen's own and «عام». */
function clashes(a: KeyCtx, b: KeyCtx) {
  return a === b || a === 'all' || b === 'all';
}

export type AssignResult =
  | { ok: true; over: KeyOverrides }
  | { ok: false; reason: 'fixed' | 'reserved'; combo: string }
  | { ok: false; reason: 'conflict'; combo: string; other: string; otherFixed: boolean };

/**
 * Gives `combo` to command `id`. Refuses fixed commands, reserved keys and keys a fixed command
 * owns; a key another command uses in the same screen (or «عام») is a conflict — `swap` gives
 * that command `id`'s old key instead (UPDATE-3 §3.3). combo = null removes the key.
 */
export function assignKey(over: KeyOverrides | null | undefined, id: string, combo: string | null, swap = false): AssignResult {
  const cur = { ...(over ?? {}) };
  const cmd = COMMAND_BY_ID[id];
  if (!cmd || cmd.fixed) return { ok: false, reason: 'fixed', combo: combo ?? '' };
  if (combo === null) return { ok: true, over: normalize({ ...cur, [id]: null }) };
  if (RESERVED.has(combo) || /^(Mod\+)?(Alt\+)?(Shift\+)?(Escape|Tab)$/.test(combo) || ['Delete', 'Backspace', 'Space'].includes(combo)) return { ok: false, reason: 'reserved', combo };
  const eff = effectiveKeys(cur);
  const ctx = ctxOf(id);
  const other = COMMANDS.find((o) => o.id !== id && clashes(ctx, ctxOf(o.id)) && eff[o.id].includes(combo));
  if (other) {
    if (other.fixed) return { ok: false, reason: 'conflict', combo, other: other.id, otherFixed: true };
    if (!swap) return { ok: false, reason: 'conflict', combo, other: other.id, otherFixed: false };
    const old = eff[id][0] ?? null;
    return { ok: true, over: normalize({ ...cur, [id]: combo, [other.id]: old }) };
  }
  return { ok: true, over: normalize({ ...cur, [id]: combo }) };
}

/** Back to the default for one command, or for all (id omitted). */
export function resetKey(over: KeyOverrides | null | undefined, id?: string): KeyOverrides {
  if (!id) return {};
  const cur = { ...(over ?? {}) };
  delete cur[id];
  return cur;
}

/** Drops entries equal to the default, so only real changes are saved. */
function normalize(over: KeyOverrides): KeyOverrides {
  const out: KeyOverrides = {};
  for (const [id, v] of Object.entries(over)) {
    const cmd = COMMAND_BY_ID[id];
    if (!cmd || cmd.fixed) continue;
    const def = cmd.keys[0] ?? null;
    if (v === def) continue;
    out[id] = v;
  }
  return out;
}

/** Commands of the active screen whose key is `combo` («عام» first). */
export function commandFor(combo: string, screen: Exclude<KeyCtx, 'all'> | null, over: KeyOverrides | null | undefined): string | null {
  const eff = effectiveKeys(over);
  const order = COMMANDS.filter((x) => ctxOf(x.id) === 'all').concat(screen ? COMMANDS.filter((x) => ctxOf(x.id) === screen) : []);
  return order.find((x) => !x.fixed && eff[x.id].includes(combo))?.id ?? null;
}

const NAMES: Record<string, string> = {
  BracketRight: ']', BracketLeft: '[', Equal: '=', Minus: '-', Slash: '/', Backslash: '\\', Comma: ',', Period: '.', Semicolon: ';', Quote: "'", Backquote: '`',
  Enter: 'Enter', Escape: 'Esc', Delete: 'Delete', Backspace: 'Backspace', Space: 'مسافة', Tab: 'Tab',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
};

/** Key caps for display, Latin letters even on the Arabic layout: ['Ctrl', 'D'] or ['⌘', 'D']. */
export function keyCaps(combo: string, mac: boolean): string[] {
  if (combo === 'Shift+Slash') return ['?'];
  return combo.split('+').map((p) => {
    if (p === 'Mod') return mac ? '⌘' : 'Ctrl';
    if (p === 'Alt') return mac ? '⌥' : 'Alt';
    if (p === 'Shift') return mac ? '⇧' : 'Shift';
    if (NAMES[p]) return NAMES[p];
    if (/^Key[A-Z]$/.test(p)) return p.slice(3);
    if (/^Digit\d$/.test(p)) return p.slice(5);
    if (/^Numpad\d$/.test(p)) return p.slice(6);
    return p;
  });
}

/** One line: «Ctrl D», «⌘D», «?». */
export function keyText(combo: string | undefined | null, mac: boolean): string {
  if (!combo) return '';
  const caps = keyCaps(combo, mac);
  return mac ? caps.join('') : caps.join(' ');
}
