import { expect, test, type Browser, type Page } from '@playwright/test';
import { login, newProject, saved } from './helpers';

/**
 * Update 3, phase A2: «اختصاراتك» (§3.3), «الحقول» (§4), «حركة أقل» (§5). Laptop, with a second
 * laptop and a phone for the sync checks.
 */
test.describe.configure({ mode: 'serial' });
test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, 'laptop flows (the phone joins as a second device)');

async function device(browser: Browser, phone = false): Promise<Page> {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar' } : { viewport: { width: 1440, height: 900 }, locale: 'ar' });
  const page = await ctx.newPage();
  await login(page);
  return page;
}

async function openShortcuts(page: Page) {
  await page.keyboard.press('Shift+Slash');
  await expect(page.getByTestId('shortcuts')).toBeVisible();
}
const row = (page: Page, id: string) => page.locator(`[data-testid=keys-row][data-cmd="${id}"]`);

test('shortcuts: change «تكرار» to Alt K, conflicts ask, reserved keys are refused, it syncs', async ({ page, browser }) => {
  await login(page);
  await newProject(page, 'اختصارات', 'ad');
  const cards = page.getByTestId('scene-card');
  await expect(cards).toHaveCount(5);
  // the toolbar tooltip shows the key from the same table
  await expect(page.getByTestId('dock-note')).toHaveAttribute('title', 'ملاحظة · N');

  await openShortcuts(page);
  await expect(page.getByTestId('keys-count')).toHaveText('الافتراضي');
  // «تكرار» → Alt K
  await row(page, 'duplicate').getByTestId('keys-edit').click();
  await expect(row(page, 'duplicate').getByTestId('keys-recording')).toBeVisible();
  await page.keyboard.press('Alt+KeyK');
  await expect(row(page, 'duplicate').getByTestId('keys-edit')).toContainText('K');
  await expect(row(page, 'duplicate').getByTestId('keys-changed')).toBeVisible();
  await expect(page.getByTestId('keys-count')).toHaveText('1 معدّل');
  // a key used in the same screen: asks, then swaps
  await row(page, 'alignRight').getByTestId('keys-edit').click();
  await page.keyboard.press('Control+KeyA'); // «تحديد الكل»
  await expect(row(page, 'alignRight').getByTestId('keys-warn')).toContainText('مستخدم لـ «تحديد الكل»');
  await row(page, 'alignRight').getByTestId('keys-swap').click();
  await expect(row(page, 'selectAll').getByTestId('keys-edit')).toContainText('D');
  await expect(page.getByTestId('keys-count')).toHaveText('3 معدّل');
  // reserved for the browser
  await row(page, 'addCharacter').getByTestId('keys-edit').click();
  await page.keyboard.press('Control+KeyW');
  await expect(row(page, 'addCharacter').getByTestId('keys-warn')).toContainText('محجوز للمتصفح أو النظام');
  await row(page, 'addCharacter').getByTestId('keys-ok').click();
  // fixed keys have no edit button
  await expect(row(page, 'esc').getByTestId('keys-edit')).toHaveCount(0);
  // search finds by name and by key
  await page.getByTestId('keys-search').fill('تكرار');
  await expect(page.getByTestId('keys-row').filter({ hasText: 'تكرار' }).first()).toBeVisible();
  await page.getByTestId('keys-search').fill('');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('shortcuts')).toHaveCount(0);
  await saved(page);

  // Alt K duplicates; Ctrl D no longer does
  await cards.nth(0).click({ position: { x: 40, y: 40 } });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+KeyD');
  await expect(cards).toHaveCount(5);
  await page.keyboard.press('Alt+KeyK');
  await expect(cards).toHaveCount(6);
  await saved(page);
  // the menu shows the new key too
  await cards.nth(2).click({ button: 'right', position: { x: 40, y: 40 } });
  await expect(page.getByTestId('item-menu')).toContainText('Alt K');
  await page.keyboard.press('Escape');

  // stays after a reload
  await page.reload();
  await expect(page.getByTestId('greeting')).toBeVisible(); // the app opens on Home
  await openShortcuts(page);
  await expect(row(page, 'duplicate').getByTestId('keys-edit')).toContainText('K');
  await page.keyboard.press('Escape');

  // reaches a second laptop within 10 s
  const lap = await device(browser);
  await lap.getByTestId('continue-board').click();
  await expect(lap.getByTestId('project-name')).toBeVisible();
  await openShortcuts(lap);
  await expect(row(lap, 'duplicate').getByTestId('keys-edit')).toContainText('K', { timeout: 11_000 });
  await lap.keyboard.press('Escape');

  // an Arabic keyboard: key 'ى' on the physical N key adds a note
  await page.getByTestId('continue-board').click();
  await expect(page.getByTestId('scene-card')).toHaveCount(6);
  const notes = page.getByTestId('card-note');
  const before = await notes.count();
  await page.getByTestId('board').hover({ position: { x: 300, y: 400 } });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ى', code: 'KeyN', bubbles: true })));
  await expect(notes).toHaveCount(before + 1);
  await saved(page);
  await page.keyboard.press('Escape');

  // everything back to the default
  await openShortcuts(page);
  await page.getByTestId('keys-reset-all').click();
  await expect(page.getByTestId('keys-count')).toHaveText('الافتراضي');
  await page.keyboard.press('Escape');
});

test('fields: «بسيط» by default, hiding and showing applies to the editor and the card, the phone follows, details sum up', async ({ page, browser }) => {
  await login(page);
  // the test files share one database: start with no saved setting (= «بسيط»)
  await page.evaluate(() => fetch('/api/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: [{ op: 'delete', entity: 'prefs', id: 'fields' }] }) }));
  await page.reload();
  await expect(page.getByTestId('greeting')).toBeVisible();
  await newProject(page, 'حقول', 'ad');
  await page.getByText('الستوري بورد').click();
  const row0 = page.getByTestId('sb-row').first();
  await row0.getByTestId('row-add-shot').click();
  // «+ لقطة» opens the editor with the cursor in the description
  await expect(page.getByTestId('editor').getByTestId('shot-desc')).toBeFocused();
  await page.getByTestId('editor').getByTestId('shot-desc').fill('لقطة الحقول');
  await saved(page);

  // «بسيط»: the camera is folded under «تفاصيل التصوير», summed up there
  const ed = page.getByTestId('editor');
  await expect(ed.locator('[data-component=ShotEditor]').getByText('الكاميرا', { exact: true })).toHaveCount(0);
  await expect(ed.getByTestId('details-summary')).toContainText('ZV-E10');
  await ed.getByTestId('details-toggle').click();
  await expect(ed.locator('[data-component=ShotEditor]').getByText('الكاميرا', { exact: true })).toBeVisible();
  await ed.getByTestId('details-toggle').click();
  // the card: duration and status only
  const card = row0.getByTestId('shot-card').first();
  await expect(card.getByTestId('card-dur')).toBeVisible();
  await expect(card.getByTestId('card-camera')).toHaveCount(0);

  await ed.getByTestId('fields-btn').click();
  await expect(page.getByTestId('fields-preset-simple')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('field-shotCard-camera').click();
  await expect(page.getByTestId('fields-preset-custom')).toHaveAttribute('aria-pressed', 'true');
  await expect(card.getByTestId('card-camera')).toContainText('ZV-E10');
  await page.getByTestId('field-shotEditor-camera').click();
  await expect(ed.locator('[data-component=ShotEditor]').getByText('الكاميرا', { exact: true })).toBeVisible();
  // fixed fields can't be turned off
  await expect(page.getByTestId('field-shotEditor-desc')).toBeDisabled();
  await saved(page);

  // the phone follows within 10 s: the camera shows in its editor too
  const phone = await device(browser, true);
  await phone.getByTestId('continue-card').click();
  await phone.getByText('اللقطات', { exact: true }).click();
  await phone.getByTestId('m-shot').filter({ hasText: 'لقطة الحقول' }).getByRole('button').first().click();
  await expect(phone.getByTestId('editor').locator('[data-component=ShotEditor]').getByText('الكاميرا', { exact: true })).toBeVisible({ timeout: 11_000 });
  // back to «بسيط» on the laptop → the phone hides it again within 10 s
  await page.getByTestId('fields-preset-simple').click();
  await saved(page);
  await expect(phone.getByTestId('editor').locator('[data-component=ShotEditor]').getByText('الكاميرا', { exact: true })).toHaveCount(0, { timeout: 11_000 });
  await expect(phone.getByTestId('editor').getByTestId('details-summary')).toContainText('ZV-E10');

  // «كامل»: no details group at all
  await page.getByTestId('fields-preset-full').click();
  await expect(ed.getByTestId('details')).toHaveCount(0);
  await expect(card.getByTestId('card-size')).toBeVisible();
  await page.getByTestId('fields-preset-simple').click();
  await saved(page);
});

test('«حركة أقل» turns the moves into short fades', async ({ page }) => {
  await login(page);
  await newProject(page, 'حركة', 'ad');
  await page.getByText('الستوري بورد').click();
  // moves only: colour/shadow transitions (e.g. a field's focus ring) are not motion
  const longest = () => page.evaluate(() => Math.max(0, ...document.getAnimations()
    .filter((a) => !(a instanceof CSSTransition) || ['transform', 'translate', 'scale', 'opacity'].includes(a.transitionProperty))
    .map((a) => Number((a.effect as KeyframeEffect | null)?.getTiming().duration) || 0)));
  // with motion: adding a shot animates for longer than a fade
  await page.getByTestId('sb-row').first().getByTestId('row-add-shot').click();
  await page.waitForTimeout(40);
  expect(await longest()).toBeGreaterThan(120);
  await page.keyboard.press('Escape');
  await saved(page);

  await page.getByTestId('menu').click();
  await page.getByText('الإعدادات', { exact: true }).click();
  await page.getByTestId('motion-less').click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'less');
  await saved(page);
  await page.getByTestId('crumb-home').click();
  await page.getByTestId('continue-storyboard').click();
  await expect(page.getByTestId('sb-row').first()).toBeVisible();
  await page.waitForTimeout(100);
  await page.getByTestId('sb-row').first().getByTestId('row-add-shot').click();
  await page.waitForTimeout(40);
  expect(await longest()).toBeLessThanOrEqual(120);
  // off again
  await page.keyboard.press('Escape');
  await page.getByTestId('menu').click();
  await page.getByText('الإعدادات', { exact: true }).click();
  await page.getByTestId('motion-less').click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  await saved(page);
});
