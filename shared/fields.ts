/**
 * «الحقول» (UPDATE-3 §4): which fields show in the shot and scene editors and on their cards.
 * One setting for the user, synced (prefs 'fields'). Hidden fields keep their values: they are
 * summed up under «تفاصيل التصوير» and every export still carries them.
 */

export type FieldGroupId = 'shotEditor' | 'shotCard' | 'sceneEditor' | 'sceneCard';

export interface FieldDef {
  id: string;
  label: string;
  /** shown in «بسيط» */
  simple: boolean;
  /** always shown, can't be turned off */
  fixed?: boolean;
}

export const FIELD_GROUPS: Record<FieldGroupId, { title: string; fields: FieldDef[] }> = {
  shotEditor: {
    title: 'اللقطة · في المحرر',
    fields: [
      { id: 'refs', label: 'الصور المرجعية', simple: true },
      { id: 'desc', label: 'الوصف', simple: true, fixed: true },
      { id: 'dur', label: 'المدة', simple: true },
      { id: 'status', label: 'الحالة', simple: true },
      { id: 'size', label: 'حجم اللقطة', simple: true },
      { id: 'motion', label: 'الحركة', simple: true },
      { id: 'angle', label: 'الزاوية', simple: false },
      { id: 'camera', label: 'الكاميرا والعدسة', simple: false },
      { id: 'rig', label: 'معدّة الحركة', simple: false },
      { id: 'light', label: 'الإضاءة والمزاج', simple: false },
      { id: 'audio', label: 'الصوت والحوار', simple: false },
    ],
  },
  shotCard: {
    title: 'اللقطة · على الكرت',
    fields: [
      { id: 'img', label: 'الصورة', simple: true, fixed: true },
      { id: 'desc', label: 'الوصف', simple: true, fixed: true },
      { id: 'dur', label: 'المدة', simple: true },
      { id: 'status', label: 'نقطة الحالة', simple: true },
      { id: 'size', label: 'الحجم', simple: false },
      { id: 'motion', label: 'الحركة', simple: false },
      { id: 'camera', label: 'الكاميرا', simple: false },
    ],
  },
  sceneEditor: {
    title: 'المشهد · في المحرر',
    fields: [
      { id: 'name', label: 'الاسم', simple: true, fixed: true },
      { id: 'intExt', label: 'داخلي/خارجي ونهار/ليل', simple: true },
      { id: 'location', label: 'الموقع', simple: true },
      { id: 'summary', label: 'الملخص', simple: true },
      { id: 'plan', label: 'زر «المخطط»', simple: true },
      { id: 'characters', label: 'الشخصيات', simple: false },
      { id: 'goal', label: 'الهدف الدرامي', simple: false },
      { id: 'mood', label: 'لون المشهد', simple: false },
      { id: 'links', label: 'الروابط (ملاحظات ولوحات مزاج)', simple: false },
    ],
  },
  sceneCard: {
    title: 'المشهد · على الكرت',
    fields: [
      { id: 'num', label: 'الرقم والاسم', simple: true, fixed: true },
      { id: 'intExt', label: 'داخلي/خارجي', simple: true },
      { id: 'location', label: 'الموقع', simple: true },
      { id: 'counts', label: 'عدد اللقطات والمدة', simple: true },
      { id: 'characters', label: 'الشخصيات', simple: false },
    ],
  },
};

export const FIELD_GROUP_IDS = Object.keys(FIELD_GROUPS) as FieldGroupId[];

export type FieldPreset = 'simple' | 'full' | 'custom';
/** prefs 'fields': the preset, and for «مخصص» the shown ids per group */
export interface FieldsPref {
  preset: FieldPreset;
  shown?: Partial<Record<FieldGroupId, string[]>>;
}

/** Shown field ids per group. No setting yet = «بسيط». Fixed fields are always in. */
export function shownFields(pref: FieldsPref | null | undefined): Record<FieldGroupId, Set<string>> {
  const out = {} as Record<FieldGroupId, Set<string>>;
  for (const g of FIELD_GROUP_IDS) {
    const defs = FIELD_GROUPS[g].fields;
    let ids: string[];
    if (!pref || pref.preset === 'simple') ids = defs.filter((f) => f.simple).map((f) => f.id);
    else if (pref.preset === 'full') ids = defs.map((f) => f.id);
    else ids = pref.shown?.[g] ?? defs.filter((f) => f.simple).map((f) => f.id);
    out[g] = new Set([...ids.filter((id) => defs.some((f) => f.id === id)), ...defs.filter((f) => f.fixed).map((f) => f.id)]);
  }
  return out;
}

/** Turning one field on or off makes the setting «مخصص» (a fixed field never changes). */
export function toggleField(pref: FieldsPref | null | undefined, group: FieldGroupId, id: string): FieldsPref {
  const def = FIELD_GROUPS[group].fields.find((f) => f.id === id);
  const cur = shownFields(pref);
  if (!def || def.fixed) return pref ?? { preset: 'simple' };
  const shown: Partial<Record<FieldGroupId, string[]>> = {};
  for (const g of FIELD_GROUP_IDS) shown[g] = [...cur[g]];
  const set = new Set(shown[group]);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  shown[group] = FIELD_GROUPS[group].fields.map((f) => f.id).filter((x) => set.has(x));
  return { preset: 'custom', shown };
}

/** Fields of a group that are hidden now (they go under «تفاصيل التصوير»), in table order. */
export function hiddenFields(pref: FieldsPref | null | undefined, group: FieldGroupId): string[] {
  const s = shownFields(pref)[group];
  return FIELD_GROUPS[group].fields.filter((f) => !s.has(f.id)).map((f) => f.id);
}
