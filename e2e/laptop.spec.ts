import { expect, test } from '@playwright/test';
import { login, newProject, pasteImage, saved, shotNums } from './helpers';

test.describe.configure({ mode: 'serial' });
test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, 'laptop flows');

test('main flow: project → scene → shot → photo → fields → storyboard → move → delete/undo → trash restore', async ({ page }) => {
  await login(page);
  await newProject(page, 'إعلان تجربة', 'ad');
  // the «إعلان» template gives 5 scenes
  await expect(page.getByTestId('scene-card')).toHaveCount(5);

  // add a scene from the dock (click = centre of the board)
  await page.getByTestId('dock-scene').click();
  await expect(page.getByTestId('scene-card')).toHaveCount(6);
  await page.getByTestId('scene-name').fill('مشهد المسبح');
  await page.getByTestId('editor-close').click();

  // storyboard: add a shot to scene 01
  await page.getByText('الستوري بورد').click();
  const rows = page.getByTestId('sb-row');
  await expect(rows).toHaveCount(6);
  await rows.nth(0).getByTestId('add-shot').click();
  await expect(page.getByTestId('editor-title')).toHaveText('اللقطة 1.1');

  // paste a photo into the open shot
  await pasteImage(page);
  await expect(page.getByTestId('gallery-tile')).toHaveCount(1);
  await saved(page);
  await expect(page.getByTestId('gallery-tile').first()).not.toHaveText(/يرفع/);

  // fill the fields
  await page.getByTestId('shot-desc').fill('لقطة افتتاحية للمسبح');
  await page.getByTestId('shot-dur').fill('6');
  await page.getByTestId('status-shot').click();
  await saved(page);
  const card = page.getByTestId('shot-card').first();
  await expect(card).toContainText('لقطة افتتاحية للمسبح');
  await expect(card).toContainText('00:06');
  await expect(card.getByTestId('shot-status')).toHaveAttribute('data-status', 'shot');

  // two more shots in scene 01, one in scene 02
  await rows.nth(0).getByTestId('add-shot').click();
  await rows.nth(0).getByTestId('add-shot').click();
  await rows.nth(1).getByTestId('add-shot').click();
  await page.getByTestId('editor-close').click();
  await saved(page);
  expect(await shotNums(page)).toEqual(['1.1', '1.2', '1.3', '2.1']);

  // drag shot 1.1 onto scene 02's shot → it moves there and everything renumbers
  await rows.nth(0).getByTestId('shot-card').first().dragTo(rows.nth(1).getByTestId('shot-card').first());
  await saved(page);
  expect(await rows.nth(0).getByTestId('shot-num').allTextContents()).toEqual(['1.1', '1.2']);
  expect(await rows.nth(1).getByTestId('shot-num').allTextContents()).toEqual(['2.1', '2.2']);
  await expect(rows.nth(1).getByTestId('shot-card').first()).toContainText('لقطة افتتاحية للمسبح');

  // delete then undo (toast button)
  const victim = rows.nth(1).getByTestId('shot-card').first();
  await victim.hover();
  await victim.getByTestId('shot-delete').click();
  await expect(rows.nth(1).getByTestId('shot-card')).toHaveCount(1);
  await page.getByTestId('toast-undo').first().click();
  await expect(rows.nth(1).getByTestId('shot-card')).toHaveCount(2);
  await expect(rows.nth(1).getByTestId('shot-card').first()).toContainText('لقطة افتتاحية للمسبح');
  await saved(page);

  // delete then restore from the trash
  await rows.nth(1).getByTestId('shot-card').first().hover();
  await rows.nth(1).getByTestId('shot-card').first().getByTestId('shot-delete').click();
  await saved(page);
  await page.getByTestId('menu').click();
  await page.getByText('سلة المحذوفات', { exact: true }).click();
  await expect(page.getByTestId('trash-item')).toHaveCount(1);
  await expect(page.getByTestId('trash-item')).toContainText('لقطة 2.1');
  await page.getByTestId('trash-restore').click();
  await expect(page.getByTestId('trash-item')).toHaveCount(0);
  await page.getByTestId('back-to-app').click();
  await page.getByText('الستوري بورد').click();
  await expect(rows.nth(1).getByTestId('shot-card')).toHaveCount(2);
  expect(await rows.nth(1).getByTestId('shot-num').allTextContents()).toEqual(['2.1', '2.2']);
  await expect(rows.nth(1).getByTestId('shot-card').first()).toContainText('لقطة افتتاحية للمسبح');

  // undo/redo buttons work with the keyboard too
  await page.keyboard.press('Control+z');
  await expect(rows.nth(1).getByTestId('shot-card')).toHaveCount(1);
  await page.keyboard.press('Control+Shift+z');
  await expect(rows.nth(1).getByTestId('shot-card')).toHaveCount(2);
  await saved(page);
});

test('drag a character and a location onto a scene row: linked and filterable', async ({ page }) => {
  await login(page);
  await newProject(page, 'ربط المكتبة', 'short');
  await page.getByText('الستوري بورد').click();
  // create a character and a location from the library
  await page.getByRole('button', { name: '+ شخصية' }).click();
  await page.getByTestId('lib-name').fill('سارة');
  await page.getByTestId('editor-close').click();
  await page.getByText('المواقع', { exact: true }).click();
  await page.getByRole('button', { name: '+ موقع' }).click();
  await page.getByTestId('lib-name').fill('السطح');
  await page.getByTestId('editor-close').click();
  await saved(page);

  const rows = page.getByTestId('sb-row');
  await page.getByTestId('lib-location').first().dragTo(rows.nth(2));
  await expect(rows.nth(2).getByTestId('row-location')).toHaveText('السطح');
  await page.getByText('الشخصيات', { exact: true }).click();
  await page.getByTestId('lib-character').first().dragTo(rows.nth(2));
  await saved(page);

  // the scene editor shows the link
  await rows.nth(2).getByTestId('sb-row-head').click();
  await expect(page.getByTestId('editor')).toContainText('سارة');
  await page.getByTestId('editor-close').click();

  // clicking the character filters to its scenes
  await page.getByTestId('lib-character').first().click();
  await expect(page.getByTestId('filter-banner')).toContainText('تعرض: مشاهد سارة (1)');
  const ops = await rows.evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity));
  expect(ops.filter((o) => o === '1')).toHaveLength(1);
  await page.getByTestId('editor-close').click();
  await page.locator('[data-testid=filter-banner] button').click();
  await expect(page.getByTestId('filter-banner')).toHaveCount(0);

  // the location filter
  await page.getByText('المواقع', { exact: true }).click();
  await page.getByTestId('lib-location').first().click();
  await expect(page.getByTestId('filter-banner')).toContainText('تعرض: مشاهد السطح (1)');
});
