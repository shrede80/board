import { expect, test } from '@playwright/test';
import { login, newProject } from './helpers';

test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'tablet flows');

/** iPad (UPDATE-1 ج9): laptop UI; a tap opens items, a long press opens the menu, two fingers zoom the board. */
test('iPad: laptop UI with touch — tap opens, long press menu, pinch zooms', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 1366 }, isMobile: true, hasTouch: true, locale: 'ar' });
  const page = await ctx.newPage();
  await login(page);
  await expect(page.locator('[data-component=MobileApp]')).toHaveCount(0);
  await newProject(page, 'آيباد', 'ad');
  const card = page.getByTestId('scene-card').first();
  await card.tap();
  await expect(page.getByTestId('editor')).toBeVisible();
  await page.getByTestId('editor-close').tap();

  const cdp = await ctx.newCDPSession(page);
  const b = (await card.boundingBox())!;
  const pt = { x: b.x + b.width / 2, y: b.y + 30 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
  await page.waitForTimeout(800);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');

  const scale = () => page.getByTestId('world').evaluate((el) => Number(/scale\(([\d.]+)\)/.exec(el.style.transform)?.[1]));
  const z0 = await scale();
  const board = (await page.getByTestId('board').boundingBox())!;
  const cx = board.x + board.width / 2, cy = board.y + board.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 40, y: cy, id: 1 }, { x: cx + 40, y: cy, id: 2 }] });
  for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 40 - k * 20, y: cy, id: 1 }, { x: cx + 40 + k * 20, y: cy, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await scale()).toBeGreaterThan(z0 * 1.3);
  await ctx.close();
});
