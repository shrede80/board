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

test('phone: status change shows on the laptop within 10 s; quick capture lands in the laptop ideas', async ({ page, browser }) => {
  // Laptop prepares a project with two shots and stays open on the storyboard.
  const lap = await laptop(browser);
  await newProject(lap, 'تصوير الجوال', 'short');
  await lap.getByText('الستوري بورد').click();
  const rows = lap.getByTestId('sb-row');
  await rows.nth(0).getByTestId('add-shot').click();
  await lap.getByTestId('shot-desc').fill('لقطة الباب');
  await rows.nth(0).getByTestId('add-shot').click();
  await lap.getByTestId('editor-close').click();
  await saved(lap);

  // Phone opens the same project (the last one used).
  await login(page);
  await expect(page.locator('[data-component=MobileApp]')).toBeVisible();
  await expect(page.locator('[data-component=Workspace]')).toHaveCount(0); // no board on the phone
  await expect(page.getByTestId('m-shot')).toHaveCount(2);
  await expect(page.getByTestId('m-progress')).toHaveText('0 من 2 تصوّرت');

  // Change the first shot's status: planned → shot
  await page.getByTestId('m-status').first().click();
  await expect(page.getByTestId('m-status').first()).toHaveAttribute('data-status', 'shot');
  await expect(page.getByTestId('m-progress')).toHaveText('1 من 2 تصوّرت');
  const t0 = Date.now();
  await expect(lap.getByTestId('shot-status').first()).toHaveAttribute('data-status', 'shot', { timeout: 11_000 });
  expect(Date.now() - t0).toBeLessThan(11_000);

  // Detail view: tap a shot, cycle its status there too
  await page.getByTestId('m-shot').nth(1).locator('button').first().click();
  await expect(page.getByTestId('m-detail')).toBeVisible();
  await page.getByTestId('m-detail-status').click();
  await expect(page.getByTestId('m-detail-status')).toContainText('تصوّرت');

  // Quick capture: a photo from the camera input, then a text note
  await page.getByTestId('m-tab-capture').click();
  await page.getByTestId('m-note').fill('زاوية جميلة عند المدخل');
  const png = await page.evaluate(async () => {
    const cv = document.createElement('canvas');
    cv.width = 800;
    cv.height = 600;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#94603f';
    g.fillRect(0, 0, 800, 600);
    const b: Blob = await new Promise((r) => cv.toBlob((x) => r(x!), 'image/png'));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  await page.getByTestId('m-camera').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await expect(page.getByTestId('toast')).toContainText('وصل إلى الأفكار');
  await page.getByTestId('m-note').fill('تذكير: نحتاج إذن الحارس');
  await page.getByTestId('m-send').click();
  await expect(page.getByText('أُرسل مؤخراً')).toBeVisible();

  // Laptop: both ideas appear in the library «الأفكار» tab (polling), the photo idea is dragged onto a shot
  await lap.locator('[data-component=LibraryPanel]').getByText(/^الأفكار/).click();
  const note = lap.getByTestId('idea-card').filter({ hasText: 'تذكير: نحتاج إذن الحارس' });
  await expect(note).toHaveCount(1, { timeout: 12_000 });
  const photo = lap.getByTestId('idea-card').filter({ hasText: 'زاوية جميلة عند المدخل' });
  await expect(photo.getByTestId('idea-time')).toContainText('من الجوال');
  await photo.dragTo(rows.nth(0).getByTestId('shot-card').first());
  await expect(photo).toHaveCount(0);
  await expect(note).toHaveCount(1);
  await saved(lap);
  await rows.nth(0).getByTestId('shot-card').first().click();
  await expect(lap.getByTestId('gallery-tile')).toHaveCount(1);
});

test('phone: offline shows the message and disables the buttons', async ({ page, context }) => {
  await login(page);
  await expect(page.getByTestId('m-shot').first()).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByTestId('offline-banner')).toContainText('لا يوجد اتصال، التغييرات لن تُحفظ');
  await expect(page.getByTestId('m-status').first()).toBeDisabled();
  await page.getByTestId('m-tab-capture').click();
  await expect(page.getByTestId('m-send')).toBeDisabled();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByTestId('offline-banner')).toHaveCount(0);
});

test('PWA: manifest and home-screen icon are served', async ({ page }) => {
  await page.goto('/');
  const manifest = await page.evaluate(() => fetch('/manifest.webmanifest').then((r) => r.json()));
  expect(manifest).toMatchObject({ display: 'standalone', dir: 'rtl', lang: 'ar', name: 'لوحة المشاهد' });
  expect((await page.request.get('/icons/apple-touch-icon.png')).status()).toBe(200);
  await expect(page.locator('link[rel=apple-touch-icon]')).toHaveAttribute('href', '/icons/apple-touch-icon.png');
  // Always online (SPEC §1.4): no service worker is registered
  expect(await page.evaluate(() => navigator.serviceWorker?.getRegistrations().then((r) => r.length) ?? 0)).toBe(0);
});
