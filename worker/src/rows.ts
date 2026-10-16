import { ENTITIES, MAX_IDEA_IMAGES, type EntityName, type FieldDef, type Row } from '../../shared/schema';

/** Fixed owner while the app is single-user (SPEC §1.1). */
export const OWNER_ID = 'owner';

const ID_RE = /^[A-Za-z0-9_:.-]{1,80}$/;
const MAX_TEXT = 20_000;

export function isId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v);
}

/** DB row (snake_case) → API row (camelCase, parsed JSON/bools). */
export function toApi(entity: EntityName, rec: Record<string, unknown>): Row {
  const def = ENTITIES[entity];
  const out: Row = { id: rec.id as string, updatedAt: rec.updated_at as number, deletedAt: (rec.deleted_at as number | null) ?? null };
  for (const [name, f] of Object.entries(def.fields) as [string, FieldDef][]) {
    out[name] = decode(f, rec[f.col]);
  }
  return out;
}

function decode(f: FieldDef, v: unknown): unknown {
  if (v === undefined || v === null) return f.type === 'json' ? f.def ?? null : null;
  if (f.type === 'bool') return v === 1 || v === true;
  if (f.type === 'json') {
    try {
      return JSON.parse(v as string);
    } catch {
      return f.def ?? null;
    }
  }
  return v;
}

export class BadRequest extends Error {}

/** Validates one API field value and converts it to what we bind in SQL. */
export function encodeField(entity: EntityName, name: string, f: FieldDef, v: unknown): string | number | null {
  const bad = (why: string) => new BadRequest(`${entity}.${name}: ${why}`);
  if (v === null) {
    if (f.type === 'json') return null;
    if (f.def === null || f.type === 'real' || f.type === 'int') return null;
    if (f.type === 'text' && !f.values) return '';
    throw bad('null not allowed');
  }
  switch (f.type) {
    case 'text': {
      if (typeof v !== 'string') throw bad('expected text');
      if (v.length > MAX_TEXT) throw bad('too long');
      if (f.values && !f.values.includes(v)) throw bad('invalid value');
      return v;
    }
    case 'int':
    case 'real': {
      if (typeof v !== 'number' || !Number.isFinite(v)) throw bad('expected number');
      return f.type === 'int' ? Math.round(v) : v;
    }
    case 'bool': {
      if (typeof v !== 'boolean') throw bad('expected boolean');
      return v ? 1 : 0;
    }
    case 'json': {
      if (typeof v !== 'object') throw bad('expected array/object');
      if (entity === 'ideas' && name === 'imageIds' && (!Array.isArray(v) || v.length > MAX_IDEA_IMAGES || !v.every(isId))) throw bad('up to 10 image ids');
      const s = JSON.stringify(v);
      if (s.length > MAX_TEXT) throw bad('too long');
      return s;
    }
  }
}
