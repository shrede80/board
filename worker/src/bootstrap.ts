import equipmentFile from '../data/equipment.json';
import { OWNER_ID } from './rows';

interface EqItem {
  id: string;
  name: string;
  brand?: string;
  model?: string;
  use?: string;
  qty?: number;
  icon?: string;
  role?: string;
  category?: string;
  short?: string;
  motions?: string[];
  lensIds?: string[];
  defaultLensId?: string;
  builtinLenses?: string[];
  fixedLens?: boolean;
  zoomOnly?: boolean;
  default?: boolean;
}

let ready = false;

/**
 * First run (SPEC §3.6): the database starts with the user's equipment only, no projects.
 * Idempotent and safe under concurrent first requests (INSERT OR IGNORE).
 */
export async function ensureBootstrap(db: D1Database): Promise<void> {
  if (ready) return;
  const has = await db.prepare('SELECT 1 FROM settings WHERE owner_id = ?').bind(OWNER_ID).first();
  if (!has) {
    const now = Date.now();
    const items: (EqItem & { virtual?: boolean })[] = [
      ...(equipmentFile.items as EqItem[]),
      ...equipmentFile.virtualSupports.map((v) => ({ ...v, role: 'support', icon: v.id === 'sup-drone' ? 'drone' : 'grip', virtual: true })),
    ];
    const rows = items.map((i, n) => ({
      id: i.id, position: n, name: i.name, brand: i.brand ?? '', model: i.model ?? '', use: i.use ?? '', qty: i.qty ?? 1,
      icon: i.icon ?? 'box', role: i.role ?? 'other', category: i.category ?? '', short: i.short ?? null,
      motions: i.motions ? JSON.stringify(i.motions) : null, lens_ids: i.lensIds ? JSON.stringify(i.lensIds) : null,
      default_lens_id: i.defaultLensId ?? null, builtin_lenses: i.builtinLenses ? JSON.stringify(i.builtinLenses) : null,
      fixed_lens: i.fixedLens ? 1 : 0, zoom_only: i.zoomOnly ? 1 : 0, is_default: i.default ? 1 : 0, virtual: i.virtual ? 1 : 0,
    }));
    const cols = Object.keys(rows[0]);
    await db.batch([
      db.prepare(
        `INSERT OR IGNORE INTO equipment (${cols.join(',')}, owner_id, updated_at)
         SELECT ${cols.map((c) => `j.value->>'${c}'`).join(',')}, ?2, ?3 FROM json_each(?1) j`,
      ).bind(JSON.stringify(rows), OWNER_ID, now),
      db.prepare(
        `INSERT OR IGNORE INTO settings (owner_id, equipment_roles, equipment_categories, updated_at) VALUES (?, ?, ?, ?)`,
      ).bind(OWNER_ID, JSON.stringify(equipmentFile.roles), JSON.stringify(equipmentFile.categories), now),
    ]);
  }
  ready = true;
}

/** Tests reset storage between files; let them force a re-check. */
export function resetBootstrapCache() {
  ready = false;
}
