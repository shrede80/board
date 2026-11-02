import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PHONE_TWIN } from '../shared/parity';

/**
 * Mobile = laptop (UPDATE-4 ج): every phone twin named in shared/parity.ts really exists in the
 * code the phone runs (a data-testid / menu testid in the phone screens or in the screens and
 * menus they share). Static: no browser. The coverage of the command table is in shared/parity.test.ts.
 */
test.skip(({ viewport }) => (viewport?.width ?? 0) > 500, 'static check, once');

const read = (dir: string) => readdirSync(dir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts')).map((f) => readFileSync(`${dir}/${f}`, 'utf8'));
const PHONE_CODE = [
  ...read('web/src/ui/m'),
  ...['web/src/app/boardActions.ts', 'web/src/ui/Plan.tsx', 'web/src/ui/Editor.tsx', 'web/src/ui/Pages.tsx', 'web/src/ui/Library.tsx', 'web/src/ui/Modals.tsx', 'web/src/ui/Fields.tsx'].map((f) => readFileSync(f, 'utf8')),
].join('\n');

test('every phone twin in the parity table exists in the phone code', () => {
  const missing: string[] = [];
  for (const [id, t] of Object.entries(PHONE_TWIN)) {
    if ('keyboard' in t) continue;
    const re = new RegExp(`(data-testid=["'{\`]|testid: ['"\`]|testid=["'])${t.phone}["'\`]`);
    if (!re.test(PHONE_CODE)) missing.push(`${id} → ${t.phone}`);
  }
  expect(missing).toEqual([]);
});
