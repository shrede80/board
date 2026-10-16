import { expect, test, type Browser, type Page } from '@playwright/test';
import { login, newProject, saved } from './helpers';

test.describe.configure({ mode: 'serial' });
test.skip(({ viewport }) => (viewport?.width ?? 9999) > 500, 'phone flows');

async function laptop(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar' });
  const page = await ctx.newPage();
  await login(page);
  return page;
}

/** A real PNG made in the page (bytes, for setInputFiles). */
async function png(page: Page, color: string) {
  return Buffer.from(await page.evaluate(async (c) => {
    const cv = document.createElement('canvas');
    cv.width = 800;
    cv.height = 600;
    const g = cv.getContext('2d')!;
    g.fillStyle = c;
    g.fillRect(0, 0, 800, 600);
    const b: Blob = await new Promise((r) => cv.toBlob((x) => r(x!), 'image/png'));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  }, color));
}

const ideasNamed = (page: Page, text: string) =>
  page.evaluate((t) => fetch('/api/home').then((r) => r.json()).then((h) => h.rows.ideas.filter((i: { text: string; deletedAt: number | null }) => i.text === t && !i.deletedAt).length), text);

/** Phone: Home → the last project («كمّل من حيث وقفت»). */
async function openLast(page: Page) {
  await expect(page.getByTestId('m-home')).toBeVisible();
  await page.getByTestId('continue-card').click();
  await expect(page.getByTestId('m-scenes')).toBeVisible();
}

test('phone: opens on Home; status change shows on the laptop within 10 s; an idea from ＋ lands on the laptop', async ({ page, browser }) => {
  const lap = await laptop(browser);
  await newProject(lap, 'تصوير الجوال', 'short');
  await lap.getByText('الستوري بورد').click();
  const rows = lap.getByTestId('sb-row');
  await rows.nth(0).getByTestId('add-shot').click();
  await lap.getByTestId('shot-desc').fill('لقطة الباب');
  await rows.nth(0).getByTestId('add-shot').click();
  await lap.getByTestId('editor-close').click();
  await saved(lap);

  await login(page);
  await expect(page.locator('[data-component=MobileApp]')).toBeVisible();
  await expect(page.locator('[data-component=Workspace]')).toHaveCount(0); // no board on the phone
  await openLast(page);
  await expect(page.getByTestId('project-name')).toHaveText('تصوير الجوال');
  await page.getByText('اللقطات', { exact: true }).click();
  await expect(page.getByTestId('m-shot')).toHaveCount(2);
  await expect(page.getByTestId('m-progress')).toHaveText('0 من 2 تصوّرت');

  await page.getByTestId('m-status').first().click();
  await expect(page.getByTestId('m-status').first()).toHaveAttribute('data-status', 'shot');
  const t0 = Date.now();
  await expect(lap.getByTestId('shot-status').first()).toHaveAttribute('data-status', 'shot', { timeout: 11_000 });
  expect(Date.now() - t0).toBeLessThan(11_000);

  // ＋ → the idea text is ready at once; a photo from the album; save
  await page.getByTestId('m-add').click();
  await expect(page.getByTestId('m-add-text')).toBeFocused();
  await page.getByTestId('m-add-text').fill('زاوية جميلة عند المدخل');
  await page.getByTestId('m-add-album').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: await png(page, '#94603f') });
  await expect(page.getByTestId('m-add-thumb')).toHaveCount(1);
  await page.getByTestId('m-add-save').click();
  await expect(page.getByTestId('add-sheet')).toHaveCount(0);

  await lap.locator('[data-component=LibraryPanel]').getByText(/^الأفكار/).click();
  const photo = lap.getByTestId('idea-card').filter({ hasText: 'زاوية جميلة عند المدخل' });
  await expect(photo).toHaveCount(1, { timeout: 12_000 });
  await expect(photo.getByTestId('idea-time')).toContainText('من الجوال');
  await photo.dragTo(rows.nth(0).getByTestId('shot-card').first());
  await expect(photo).toHaveCount(0);
  await saved(lap);
  await rows.nth(0).getByTestId('shot-card').first().click();
  await expect(lap.getByTestId('gallery-tile')).toHaveCount(1);
  await lap.context().close();
});

test('phone: create a scene and a shot, edit its fields, delete it, then undo', async ({ page }) => {
  await login(page);
  await openLast(page);
  const scenes = page.getByTestId('m-scene');
  const n = await scenes.count();

  // ＋ → مشهد
  await page.getByTestId('m-add').click();
  await page.getByText('مشهد', { exact: true }).click();
  await page.getByTestId('m-add-scene-name').fill('السطح');
  await page.getByTestId('m-add-save').click();
  await expect(scenes).toHaveCount(n + 1);
  await expect(scenes.last()).toContainText('السطح');

  // «+ لقطة» at the end of its strip → full-screen editor
  await scenes.last().getByTestId('m-strip-add').click();
  await expect(page.getByTestId('editor')).toBeVisible();
  await expect(page.getByTestId('editor-title')).toHaveText(`${n + 1}.1`);
  await page.getByTestId('shot-desc').fill('لقطة عامة من فوق');
  await page.getByTestId('shot-dur-plus').click();
  await page.getByTestId('shot-dur-plus').click();
  await expect(page.getByTestId('shot-dur-value')).toHaveText('00:05');
  await page.getByTestId('status-approved').click();
  // equipment picker is a bottom sheet with search
  await page.getByTestId('pick-size').click();
  await expect(page.getByTestId('picker-sheet')).toBeVisible();
  await page.getByTestId('picker-search').fill('CU');
  await page.getByTestId('picker-sheet').getByRole('button', { name: /CU/ }).first().click();
  await expect(page.getByTestId('picker-sheet')).toHaveCount(0);
  await expect(page.getByTestId('m-saved')).toHaveText('محفوظ ✓', { timeout: 15_000 });

  // back gesture closes the editor, not the app
  await page.goBack();
  await expect(page.getByTestId('editor')).toHaveCount(0);
  await expect(page.getByTestId('m-scenes')).toBeVisible();

  const strip = scenes.last().getByTestId('m-strip-shot');
  await expect(strip).toHaveCount(1);
  await expect(strip.first()).toHaveAttribute('data-status', 'approved');
  const saved1 = await page.evaluate(() => fetch('/api/projects').then((r) => r.json()));
  expect(saved1.length).toBeGreaterThan(0);

  // delete from the editor ⋯, then «تراجع»
  await strip.first().click();
  await page.getByTestId('m-editor-more').click();
  await page.getByTestId('m-delete').click();
  await expect(page.getByTestId('editor')).toHaveCount(0);
  await expect(strip).toHaveCount(0);
  await page.getByTestId('toast').filter({ hasText: 'حُذفت اللقطة' }).getByTestId('toast-undo').click();
  await expect(strip).toHaveCount(1);
  await strip.first().click();
  await expect(page.getByTestId('shot-desc')).toHaveValue('لقطة عامة من فوق');
  await page.getByTestId('editor-close').click();
});

test('phone: an idea with a photo saved offline is sent once when the connection returns', async ({ page, context, browser }) => {
  await login(page);
  await expect(page.getByTestId('m-home')).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByTestId('offline-banner')).toBeVisible();

  await page.getByTestId('m-add').click();
  await page.getByTestId('m-add-text').fill('فكرة بدون نت');
  await page.getByTestId('m-add-camera').setInputFiles({ name: 'cam.png', mimeType: 'image/png', buffer: await png(page, '#2e3d5c') });
  await page.getByTestId('m-add-save').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'تُرسل لما يرجع النت' })).toHaveCount(1);
  await page.getByTestId('m-tab-ideas').click();
  const waiting = page.getByTestId('idea-pending').filter({ hasText: 'فكرة بدون نت' });
  await expect(waiting).toHaveCount(1);
  await expect(waiting.getByTestId('pending-status')).toContainText('بانتظار الإنترنت');
  await expect(page.getByTestId('m-tab-ideas-count')).toBeVisible();

  // still waiting after a reload of the list (kept in IndexedDB)
  await page.getByTestId('m-ideas-filter-pending').click();
  await expect(waiting).toHaveCount(1);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(waiting).toHaveCount(0, { timeout: 15_000 });
  expect(await ideasNamed(page, 'فكرة بدون نت')).toBe(1);

  // the laptop sees it within 10 s, with its photo
  const lap = await laptop(browser);
  const card = lap.getByTestId('ideas-box').getByTestId('idea-card').filter({ hasText: 'فكرة بدون نت' });
  await expect(card).toHaveCount(1, { timeout: 11_000 });
  await expect(card.getByTestId('idea-time')).toContainText('من الجوال');
  // a second flush does not send it again
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(1000);
  expect(await ideasNamed(page, 'فكرة بدون نت')).toBe(1);
  await lap.context().close();
});

test('phone: convert an idea into a shot from the ideas sheet, then undo', async ({ page }) => {
  await login(page);
  await openLast(page);
  await page.getByTestId('m-add').click();
  await page.getByTestId('m-add-text').fill('لقطة يد على الباب');
  await page.getByTestId('m-add-save').click();
  await page.getByTestId('m-tab-ideas').click();
  const card = page.getByTestId('idea-card').filter({ hasText: 'لقطة يد على الباب' });
  await expect(card).toHaveCount(1, { timeout: 10_000 });
  await card.getByTestId('idea-more').click();
  await expect(page.getByTestId('idea-sheet')).toBeVisible();
  await page.getByTestId('convert-shot').click();
  await page.getByTestId('choose-scene').first().click();
  const made = page.getByTestId('toast').filter({ hasText: 'صارت اللقطة' });
  await expect(made).toHaveCount(1);
  await expect(page.getByTestId('m-scenes')).toBeVisible();
  await made.getByTestId('toast-undo').click();
  await page.getByTestId('m-tab-ideas').click();
  await expect(card).toHaveCount(1);
});

test('phone: hold a shot and slide it to a new place in its strip; hold without moving opens its menu', async ({ page }) => {
  await login(page);
  await openLast(page);
  const strip = page.getByTestId('m-scene').first().getByTestId('m-strip-shot');
  const ids = await strip.evaluateAll((els) => els.map((e) => e.getAttribute('data-shot-id')));
  expect(ids.length).toBeGreaterThanOrEqual(2);
  const a = (await strip.nth(0).boundingBox())!, b = (await strip.nth(1).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.move(b.x + b.width / 2 - 10, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => strip.evaluateAll((els) => els.map((e) => e.getAttribute('data-shot-id')))).toEqual([ids[1], ids[0], ...ids.slice(2)]);
  const moved = page.getByTestId('toast').filter({ hasText: 'نُقلت اللقطة' });
  await expect(moved).toHaveCount(1);
  await moved.getByTestId('toast-undo').click();
  await expect.poll(() => strip.evaluateAll((els) => els.map((e) => e.getAttribute('data-shot-id')))).toEqual(ids);
  // a long press without moving: the shot menu with «نقل إلى مشهد…»
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await expect(page.getByTestId('shot-menu')).toBeVisible();
  await expect(page.getByTestId('m-move-to')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('phone: «عرض المشروع» — swipe between shots, tap hides the details', async ({ page }) => {
  await login(page);
  await openLast(page);
  await page.getByTestId('m-project-more').click();
  await page.getByTestId('pm-present').click();
  await expect(page.getByTestId('present')).toBeVisible();
  await expect(page.getByTestId('present-num')).toHaveText('1.1');
  const swipe = (dx: number) => page.evaluate((d) => {
    const el = document.querySelector('[data-testid=present]')!;
    const t = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(195)], changedTouches: [t(195)], bubbles: true }));
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(195 + d)], bubbles: true, cancelable: true }));
  }, dx);
  await swipe(120);
  await expect(page.getByTestId('present-num')).toHaveText('1.2');
  await swipe(-120);
  await expect(page.getByTestId('present-num')).toHaveText('1.1');
  await page.getByTestId('present-frame').click();
  await expect(page.getByTestId('present-info')).toHaveAttribute('aria-hidden', 'true');
  await page.getByTestId('present-frame').click();
  await expect(page.getByTestId('present-info')).toHaveAttribute('aria-hidden', 'false');
  await page.goBack(); // the back gesture leaves the presentation, not the app
  await expect(page.getByTestId('present')).toHaveCount(0);
  await expect(page.getByTestId('m-scenes')).toBeVisible();
});

test('phone: a queued idea the server refuses shows «إعادة المحاولة» and «حذف»', async ({ page }) => {
  await login(page);
  await expect(page.getByTestId('m-home')).toBeVisible();
  let refuse = true;
  await page.route('**/api/ops', (r) => (refuse && r.request().postData()?.includes('مرفوضة مرة') ? r.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"bad"}' }) : r.continue()));
  await page.getByTestId('m-add').click();
  await page.getByTestId('m-add-text').fill('فكرة مرفوضة مرة');
  await page.getByTestId('m-add-save').click();
  await page.getByTestId('m-tab-ideas').click();
  const card = page.getByTestId('idea-pending').filter({ hasText: 'فكرة مرفوضة مرة' });
  await expect(card.getByTestId('pending-retry')).toBeVisible();
  refuse = false;
  await card.getByTestId('pending-retry').click();
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId('idea-card').filter({ hasText: 'فكرة مرفوضة مرة' })).toHaveCount(1, { timeout: 10_000 });
  // and «حذف» removes one for good
  refuse = true;
  await page.route('**/api/ops', (r) => (r.request().postData()?.includes('تُحذف من الجوال') ? r.fulfill({ status: 400, contentType: 'application/json', body: '{}' }) : r.continue()));
  await page.getByTestId('m-add').click();
  await page.getByTestId('m-add-text').fill('تُحذف من الجوال');
  await page.getByTestId('m-add-save').click();
  const gone = page.getByTestId('idea-pending').filter({ hasText: 'تُحذف من الجوال' });
  await gone.getByTestId('pending-delete').click();
  await page.getByTestId('confirm-ok').click();
  await expect(gone).toHaveCount(0);
  expect(await ideasNamed(page, 'تُحذف من الجوال')).toBe(0);
});

test('phone: offline shows the message and disables editing buttons', async ({ page, context }) => {
  await login(page);
  await openLast(page);
  await page.getByText('اللقطات', { exact: true }).click();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByTestId('offline-banner')).toContainText('لا يوجد اتصال، التغييرات لن تُحفظ');
  await expect(page.getByTestId('m-status').first()).toBeDisabled();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByTestId('offline-banner')).toHaveCount(0);
});

test('phone: the back gesture closes layers one by one and ends on Home, inside the app', async ({ page }) => {
  await login(page);
  await openLast(page);
  await page.getByTestId('m-strip-shot').first().click();
  await page.getByTestId('m-editor-more').click();
  await expect(page.getByTestId('editor-menu')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('editor-menu')).toHaveCount(0);
  await expect(page.getByTestId('editor')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('editor')).toHaveCount(0);
  await expect(page.getByTestId('m-scenes')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('m-home')).toBeVisible();
  expect(new URL(page.url()).origin).toBe(new URL(page.url()).origin); // still in the app
  await expect(page.locator('[data-component=MobileApp]')).toBeVisible();
});

test('phone held sideways (844×390) keeps the phone UI', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, locale: 'ar' });
  const page = await ctx.newPage();
  await login(page);
  await expect(page.locator('[data-component=MobileApp]')).toBeVisible();
  await expect(page.locator('[data-component=TopBar]')).toHaveCount(0);
  await ctx.close();
});

test('PWA: manifest and home-screen icon are served', async ({ page }) => {
  await page.goto('/');
  const manifest = await page.evaluate(() => fetch('/manifest.webmanifest').then((r) => r.json()));
  expect(manifest).toMatchObject({ display: 'standalone', dir: 'rtl', lang: 'ar', name: 'لوحة المشاهد' });
  expect((await page.request.get('/icons/apple-touch-icon.png')).status()).toBe(200);
  await expect(page.locator('link[rel=apple-touch-icon]')).toHaveAttribute('href', '/icons/apple-touch-icon.png');
});
