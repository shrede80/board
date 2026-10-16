import { expect, test, type Locator, type Page } from '@playwright/test';
import { login, newProject, pasteImage, saved } from './helpers';

/** Update 1 — phase A on the laptop (UPDATE-1 §6). */
test.describe.configure({ mode: 'serial' });
test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, 'laptop flows');

async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error('no box');
  return b;
}

async function rightClick(page: Page, l: Locator, dx = 30, dy = 30) {
  const b = await box(l);
  await page.mouse.click(b.x + dx, b.y + dy, { button: 'right' });
}

test('project: rename in place, settings, delete → undo, delete → restore from the trash', async ({ page }) => {
  await login(page);
  await newProject(page, 'مشروع التحديث', 'ad');
  // rename from the project menu (Enter saves)
  await page.getByTestId('project-menu').click();
  await page.getByTestId('pm-rename').click();
  await page.getByTestId('project-name-input').fill('إعلان معدّل');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('project-name')).toHaveText('إعلان معدّل');
  // Esc cancels
  await page.getByTestId('project-menu').click();
  await page.getByTestId('pm-rename').click();
  await page.getByTestId('project-name-input').fill('لا يُحفظ');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('project-name')).toHaveText('إعلان معدّل');
  // settings: client, stage
  await page.getByTestId('project-menu').click();
  await page.getByTestId('pm-settings').click();
  await page.getByTestId('ps-client').fill('مطعم سفرة نجد');
  await page.getByTestId('stage-shoot').click();
  await page.getByTestId('ps-done').click();
  await saved(page);
  const pj = await page.evaluate(() => fetch('/api/projects').then((r) => r.json()));
  expect(pj.find((x: { name: string }) => x.name === 'إعلان معدّل')).toMatchObject({ client: 'مطعم سفرة نجد', stage: 'shoot' });

  // delete → «تراجع» brings it back
  await page.getByTestId('project-menu').click();
  await page.getByTestId('pm-delete').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('greeting')).toBeVisible();
  await page.getByTestId('toast-undo-project').click();
  await expect(page.getByTestId('project-name')).toHaveText('إعلان معدّل');

  // delete again → restore from the trash
  await page.getByTestId('project-menu').click();
  await page.getByTestId('pm-delete').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('greeting')).toBeVisible();
  await page.getByTestId('menu').click();
  await page.getByText('سلة المحذوفات').click();
  const item = page.getByTestId('trash-item').filter({ hasText: 'إعلان معدّل' });
  await expect(item).toHaveCount(1);
  await item.getByTestId('trash-restore').click();
  await page.getByTestId('toast-open').click();
  await expect(page.getByTestId('project-name')).toHaveText('إعلان معدّل');
});

test('board: menus for every kind, resize with guides, frame carries its content, image paste, layers, lock', async ({ page }) => {
  await login(page);
  await newProject(page, 'لوحة حرة', 'ad');
  const scenes = page.getByTestId('scene-card');
  await expect(scenes).toHaveCount(5);

  // empty board menu → add a heading, a note and a frame here
  const board = page.getByTestId('board');
  const bb = await box(board);
  await page.mouse.click(bb.x + 200, bb.y + bb.height - 220, { button: 'right' });
  await expect(page.getByTestId('board-menu')).toBeVisible();
  await page.getByTestId('m-add-here').click();
  await page.getByTestId('m-add-heading').click();
  await page.getByTestId('heading-input').fill('خيارات النهاية');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('card-heading')).toContainText('خيارات النهاية');

  // scene menu: every entry of UPDATE-1 أ3 is there; rename in place
  await rightClick(page, scenes.first(), 40, 200);
  const menu = page.getByTestId('item-menu');
  for (const t of ['m-open', 'm-rename', 'm-duplicate', 'm-add-shot', 'm-order', 'm-lock', 'm-delete']) await expect(menu.getByTestId(t)).toBeVisible();
  await expect(menu.getByText('لون المزاج')).toHaveCount(0); // swatches row, no label line
  await menu.getByTestId('m-rename').click();
  await page.getByTestId('scene-name-input').fill('افتتاحية جديدة');
  await page.keyboard.press('Enter');
  await expect(scenes.first().getByTestId('board-scene-name')).toHaveText('افتتاحية جديدة');

  // duplicate a scene from the menu: a deep copy right after it in the numbering
  await rightClick(page, scenes.first(), 40, 200);
  await page.getByTestId('item-menu').getByTestId('m-duplicate').click();
  await expect(scenes).toHaveCount(6);
  const copy = scenes.filter({ hasText: 'افتتاحية جديدة (نسخة)' });
  await expect(copy).toHaveCount(1);
  await expect(copy).toContainText('02'); // right after the original in the numbering
  await page.getByTestId('undo').click();
  await expect(scenes).toHaveCount(5);

  // resize a scene: east handle, the size tip shows, a guide appears near another scene's edge
  await page.mouse.click(bb.x + 20, bb.y + 20); // clear
  const s2 = scenes.nth(1);
  const before = (await box(s2)).width;
  await s2.click({ position: { x: 40, y: 200 } });
  await page.keyboard.press('Escape'); // close the editor, keep the selection
  await expect(page.getByTestId('editor')).toHaveCount(0);
  await s2.click({ position: { x: 40, y: 200 } });
  await page.keyboard.press('Escape');
  const h = s2.getByTestId('handle-e');
  await expect(h).toBeVisible();
  const hb = await box(h);
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 40, hb.y + 10, { steps: 6 });
  await expect(page.getByTestId('size-tip')).toBeVisible();
  await page.mouse.move(hb.x + 90, hb.y + 10, { steps: 6 });
  await page.mouse.up();
  await saved(page);
  const after = (await box(s2)).width;
  expect(after).toBeGreaterThan(before + 20);
  await page.getByTestId('undo').click();
  await expect.poll(async () => Math.round((await box(s2)).width)).toBe(Math.round(before));

  // resizing toward a neighbour: its edge shows a guide and the edge snaps to it
  const s02 = scenes.filter({ hasText: 'المشكلة' });
  const s03 = scenes.filter({ hasText: 'المنتج' });
  await page.mouse.click(bb.x + 20, bb.y + 20);
  await s02.click({ position: { x: 40, y: 200 } });
  await page.keyboard.press('Escape');
  const hw = await box(s02.getByTestId('handle-w'));
  const edge = (await box(s03)).x + (await box(s03)).width;
  await page.mouse.move(hw.x + hw.width / 2, hw.y + hw.height / 2);
  await page.mouse.down();
  await page.mouse.move(hw.x - 10, hw.y + 5, { steps: 4 });
  await page.mouse.move(edge + 3, hw.y + 5, { steps: 6 });
  await expect(page.getByTestId('guide').first()).toBeVisible();
  await page.mouse.up();
  await saved(page);
  expect(Math.abs((await box(s02)).x - edge)).toBeLessThan(2);
  await page.getByTestId('undo').click();

  // frame around two scenes (Ctrl+G), then moving the frame moves them
  await page.mouse.click(bb.x + 20, bb.y + 20);
  await scenes.nth(3).click({ position: { x: 40, y: 200 }, modifiers: ['Shift'] });
  await scenes.nth(4).click({ position: { x: 40, y: 200 }, modifiers: ['Shift'] });
  await page.keyboard.press('Control+g');
  await page.keyboard.press('Enter');
  const frame = page.getByTestId('card-frame');
  await expect(frame).toHaveCount(1);
  const s4 = await box(scenes.nth(3));
  const title = await box(frame.getByTestId('frame-title'));
  await page.mouse.move(title.x + 20, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(title.x + 60, title.y + 80, { steps: 8 });
  await page.mouse.up();
  await saved(page);
  const s4b = await box(scenes.nth(3));
  expect(Math.round(s4b.y - s4.y)).toBeGreaterThan(40);

  // a note added from the board menu lands on top; its menu has the colours
  await page.mouse.click(bb.x + 20, bb.y + 20);
  await page.mouse.click(bb.x + 120, bb.y + bb.height - 130, { button: 'right' });
  await page.getByTestId('m-add-here').click();
  await page.getByTestId('m-add-note').click();
  await page.keyboard.press('Escape');
  const note = page.getByTestId('card-note');
  await expect(note).toHaveCount(1);
  await rightClick(page, note);
  await page.getByTestId('swatch-wine').click();
  await expect(note.locator('[data-component=NoteCard]')).toHaveAttribute('data-color', 'wine');

  // lock: no moving
  await rightClick(page, note);
  await page.getByTestId('item-menu').getByTestId('m-lock').click();
  await expect(note.getByTestId('lock-badge')).toBeVisible();
  const nb = await box(note);
  await page.mouse.move(nb.x + 30, nb.y + 30);
  await page.mouse.down();
  await page.mouse.move(nb.x + 130, nb.y + 30, { steps: 6 });
  await page.mouse.up();
  expect(Math.round((await box(note)).x)).toBe(Math.round(nb.x));

  // paste an image with nothing selected → an image card
  await page.keyboard.press('Escape');
  await page.mouse.click(bb.x + 20, bb.y + 20);
  await pasteImage(page);
  await expect(page.getByTestId('card-image')).toHaveCount(1, { timeout: 10_000 });
  await rightClick(page, page.getByTestId('card-image'));
  for (const t of ['m-open', 'm-duplicate', 'm-copy', 'm-to-shot', 'm-to-moodboard', 'm-delete']) await expect(page.getByTestId('item-menu').getByTestId(t)).toBeVisible();
  await page.getByTestId('m-to-moodboard').click();
  await page.getByTestId('pick-new-moodboard').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'لوحة المزاج' })).toBeVisible();

  // copy / paste a heading: Ctrl+C, Ctrl+V → second heading 24px further
  const heading = page.getByTestId('card-heading');
  await heading.click();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(heading).toHaveCount(2);

  // layers: bring the first scene to the top
  await page.mouse.click(bb.x + 20, bb.y + 20);
  const third = scenes.filter({ hasText: 'المنتج' });
  await rightClick(page, third, 40, 200);
  await page.getByTestId('item-menu').getByTestId('m-order').click();
  await page.getByText('للأعلى').click();
  await saved(page);
  const z = await third.evaluate((el) => Number((el as HTMLElement).style.zIndex));
  const others = await scenes.evaluateAll((els) => els.map((el) => Number((el as HTMLElement).style.zIndex)));
  expect(z).toBe(Math.max(...others));

  // library card: «إزالة من اللوحة» vs «حذف»
  await page.getByTestId('dock-character').click();
  await page.keyboard.press('Escape');
  const ch = page.getByTestId('card-character');
  await expect(ch).toHaveCount(1);
  await rightClick(page, ch);
  await expect(page.getByTestId('item-menu').getByTestId('m-remove')).toBeVisible();
  await page.getByTestId('item-menu').getByTestId('m-remove').click();
  await expect(ch).toHaveCount(0);
  await expect(page.getByTestId('lib-character')).toHaveCount(1);
  await page.getByTestId('lib-character').getByTestId('lib-dots').click();
  await page.getByTestId('lib-menu').getByTestId('m-delete').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('lib-character')).toHaveCount(0);
  await page.getByTestId('toast-undo').last().click();
  await expect(page.getByTestId('lib-character')).toHaveCount(1);
});

test('storyboard: ⋯ on a scene row and «نقل إلى مشهد…» on a shot', async ({ page }) => {
  await login(page);
  await newProject(page, 'ستوري', 'ad');
  await page.getByText('الستوري بورد').click();
  const rows = page.getByTestId('sb-row');
  await rows.nth(0).getByTestId('add-shot').click();
  await page.keyboard.press('Escape');
  await rows.nth(0).getByTestId('row-dots').click();
  await page.getByTestId('row-menu').getByTestId('m-rename').click();
  await page.getByTestId('row-name-input').fill('البداية');
  await page.keyboard.press('Enter');
  await expect(rows.nth(0).getByTestId('row-name')).toHaveText('البداية');
  const shot = rows.nth(0).getByTestId('shot-card').first();
  await shot.hover();
  await shot.getByTestId('shot-dots').click();
  await page.getByTestId('m-move-to').click();
  await page.getByTestId('m-move-3').click();
  await expect(rows.nth(0).getByTestId('shot-card')).toHaveCount(0);
  await expect(rows.nth(2).getByTestId('shot-card')).toHaveCount(1);
  await expect(rows.nth(2).getByTestId('shot-num')).toHaveText('3.1');
});

test('sign out asks first, then shows the login screen', async ({ page }) => {
  await login(page);
  await page.getByTestId('menu').click();
  await page.getByTestId('menu-logout').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('login-password')).toBeVisible();
  const st = await page.evaluate(() => fetch('/api/auth/status').then((r) => r.json()));
  expect(st.authed).toBe(false);
});
