import { expect, test, type Page } from '@playwright/test';
import { login, smallTargets } from './helpers';

/** Update 4, phase C: what the laptop did and the phone could not (UPDATE-4 ج). */
test.describe.configure({ mode: 'serial' });
test.skip(({ viewport }) => (viewport?.width ?? 9999) > 500, 'phone only');

const NAME = 'مشروع التكافؤ';
const api = (page: Page, ops: unknown[]) => page.evaluate(async (o) => {
  const r = await fetch('/api/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: o }) });
  if (!r.ok) throw new Error(await r.text());
}, ops);
const rows = (page: Page, id: string) => page.evaluate(async (pid) => (await fetch(`/api/projects/${pid}`).then((r) => r.json())) as { rows: Record<string, { id: string; deletedAt: number | null; [k: string]: unknown }[]> }, id);

async function seed(page: Page) {
  await api(page, [
    { op: 'create', entity: 'projects', id: 'pj-u4c', fields: { name: NAME, aspect: '16:9' } },
    { op: 'create', entity: 'characters', id: 'ch-u4c', fields: { projectId: 'pj-u4c', name: 'سلطان' } },
    { op: 'create', entity: 'locations', id: 'loc-u4c', fields: { projectId: 'pj-u4c', name: 'المزرعة' } },
    { op: 'create', entity: 'scenes', id: 'sc-u4c1', fields: { projectId: 'pj-u4c', position: 1, name: 'الصباح', boardX: 40, boardY: 40, locationId: 'loc-u4c', intExt: 'ext', dayNight: 'day' } },
    { op: 'create', entity: 'scenes', id: 'sc-u4c2', fields: { projectId: 'pj-u4c', position: 2, name: 'الليل', boardX: 300, boardY: 40 } },
    { op: 'create', entity: 'sceneCharacters', id: 'sc-u4c1:ch-u4c', fields: { projectId: 'pj-u4c', sceneId: 'sc-u4c1', characterId: 'ch-u4c' } },
    { op: 'create', entity: 'shots', id: 'sh-u4c1', fields: { projectId: 'pj-u4c', sceneId: 'sc-u4c1', position: 1, description: 'لقطة المزرعة' } },
    { op: 'create', entity: 'planItems', id: 'pl-u4c1', fields: { projectId: 'pj-u4c', sceneId: 'sc-u4c1', kind: 'camera', refId: 'cam-zve10', x: 1, y: 1, label: 'A', props: { focalMm: 35, range: 2 } } },
    { op: 'create', entity: 'planItems', id: 'pl-u4c2', fields: { projectId: 'pj-u4c', sceneId: 'sc-u4c1', kind: 'person', x: 3, y: 1, label: 'سلطان' } },
    { op: 'create', entity: 'planItems', id: 'pl-u4c3', fields: { projectId: 'pj-u4c', sceneId: 'sc-u4c1', kind: 'text', x: 2, y: 3, w: 2, h: 0.5, label: 'ملاحظة المخطط' } },
  ]);
}
async function openProject(page: Page) {
  await page.goto('/');
  await page.getByText(NAME, { exact: true }).first().click();
  await expect(page.getByTestId('m-scenes')).toBeVisible();
}

test('phone: search, redo, sort, theme, save retry, archived badge, scene meta', async ({ page }) => {
  await login(page);
  await seed(page);
  await page.goto('/');

  // search (the laptop's Ctrl+K): from the Home header
  await page.getByTestId('m-search').click();
  await page.getByTestId('search-input').fill('الصباح');
  await expect(page.getByTestId('search-hit').first()).toBeVisible();
  expect(await smallTargets(page, '[data-testid=search]'), 'search').toEqual([]);
  await page.getByTestId('search-hit').first().click();
  await expect(page.getByTestId('editor')).toBeVisible(); // the scene opens
  await page.getByTestId('editor-close').click().catch(() => {});

  // sort the projects like the laptop
  await page.goto('/');
  await page.getByTestId('m-sort').click();
  await page.getByTestId('m-sort-name').click();
  await expect(page.getByTestId('m-sort')).toContainText('الاسم');

  // quick theme from «المزيد»
  await page.getByTestId('m-tab-more').click();
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-sb-theme'));
  await page.getByTestId('m-theme-quick').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-sb-theme'))).not.toBe(before);
  await page.getByTestId('m-theme-quick').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-sb-theme'))).toBe(before);

  // project: redo next to undo; the scene shows its place and people (what «الحقول» lets it)
  await openProject(page);
  await expect(page.getByTestId('m-redo')).toBeVisible();
  await expect(page.getByTestId('m-redo')).toBeDisabled();
  await page.getByTestId('m-scene-head').first().click();
  await page.getByTestId('editor-close').click().catch(() => page.goBack());
  expect(await smallTargets(page, '[data-component=MobileProject]'), 'project screen').toEqual([]);

  // a failed save says so, and one tap tries again
  await page.route('**/api/ops', (r) => r.abort('connectionfailed')); // the network drops: the change stays queued
  await page.getByTestId('m-scene-head').first().click();
  await page.getByTestId('scene-name').fill('الصباح المبكر');
  await expect(page.getByTestId('m-saved')).toContainText('ما انحفظ', { timeout: 15_000 });
  await page.unroute('**/api/ops');
  await page.getByTestId('m-saved').click();
  await expect(page.getByTestId('m-saved')).toHaveText('محفوظ ✓', { timeout: 15_000 });

  // an archived project says «مؤرشف» in its header
  await api(page, [{ op: 'update', entity: 'projects', id: 'pj-u4c', fields: { archived: true } }]);
  await page.goto('/');
  await page.getByTestId('pf-archived').click();
  await page.getByText(NAME, { exact: true }).first().click();
  await expect(page.getByTestId('m-archived')).toBeVisible();
  await api(page, [{ op: 'update', entity: 'projects', id: 'pj-u4c', fields: { archived: false } }]);
});

test('phone: library → «أضفه إلى لوحة الأفكار» and «اعرض مشاهده»; shot row ⋯', async ({ page }) => {
  await login(page);
  await openProject(page);
  // the character as a card on the board
  const before = (await rows(page, 'pj-u4c')).rows.boardCards.filter((c) => !c.deletedAt).length;
  await page.getByText('المكتبة', { exact: true }).first().click();
  await page.getByTestId('m-lib-dots').first().click();
  await page.getByTestId('m-lib-to-board').click();
  await expect.poll(async () => (await rows(page, 'pj-u4c')).rows.boardCards.filter((c) => !c.deletedAt).length, { timeout: 8000 }).toBe(before + 1);

  // «اعرض مشاهده»: only the scenes with him stay; ✕ brings the others back
  await page.getByTestId('m-lib-dots').first().click();
  await page.getByTestId('m-lib-filter').click();
  await page.getByText('المشاهد', { exact: true }).first().click();
  await expect(page.getByTestId('m-filter-bar')).toContainText('سلطان (1)');
  await expect(page.getByTestId('m-scene')).toHaveCount(1);
  await expect(page.getByTestId('m-scene-meta').first()).toContainText('المزرعة');
  await page.getByTestId('m-filter-clear').click();
  await expect(page.getByTestId('m-scene')).toHaveCount(2);

  // the shots list: ⋯ on a row opens the shot menu (duplicate, move, delete)
  await page.getByText('اللقطات', { exact: true }).first().click();
  await page.getByTestId('m-shot-dots').first().click();
  await expect(page.getByTestId('shot-menu')).toBeVisible();
  await page.getByTestId('m-dup-shot').click();
  await expect.poll(async () => (await rows(page, 'pj-u4c')).rows.shots.filter((s) => !s.deletedAt).length, { timeout: 8000 }).toBe(2);
});

test('phone: the shot plan selects several items, zooms and shows its legend from «⋯»', async ({ page }) => {
  await login(page);
  await openProject(page);
  await page.getByTestId('m-scene-dots').first().click();
  await page.getByTestId('m-plan').click();
  await expect(page.getByTestId('plan')).toBeVisible();
  await expect(page.locator('[data-pid]')).toHaveCount(3);
  await page.getByTestId('plan-fit').click();
  await page.waitForTimeout(500);
  // «تحديد»: a tap on each of two items adds it
  await page.getByTestId('plan-m-select').click();
  const cdp = await page.context().newCDPSession(page);
  const tap = async (sel: string) => {
    const b = (await page.locator(sel).first().boundingBox())!;
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await tap('[data-pid="pl-u4c1"] > g');
  await tap('[data-pid="pl-u4c2"] > g');
  await expect(page.getByTestId('plan-sheet')).toBeVisible();
  await expect(page.getByTestId('plan-delete')).toBeVisible();
  await page.getByTestId('plan-delete').click();
  await expect.poll(async () => (await rows(page, 'pj-u4c')).rows.planItems.filter((r) => !r.deletedAt).length, { timeout: 8000 }).toBe(1);
  await page.getByTestId('plan-undo').click();
  await expect.poll(async () => (await rows(page, 'pj-u4c')).rows.planItems.filter((r) => !r.deletedAt).length, { timeout: 8000 }).toBe(3);

  // ⋯: select all, zoom, the key to the cameras
  await page.getByTestId('plan-more').click();
  await expect(page.getByTestId('plan-select-all')).toBeVisible();
  await expect(page.getByTestId('plan-legend-m')).toBeVisible();
  await page.getByTestId('plan-zoom-in').click();
  expect(await smallTargets(page, '[data-testid=plan-sheet]'), 'plan ⋯ sheet').toEqual([]);
});
