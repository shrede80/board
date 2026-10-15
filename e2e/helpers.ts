import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'e2e-password-123';
export const SETUP_TOKEN = 'dev-setup'; // from .dev.vars (local only)

/** Sets the password on first run (one-time setup page), otherwise logs in. */
export async function login(page: Page) {
  await page.goto('/');
  const setup = page.getByTestId('setup-token');
  const pw = page.getByTestId('login-password');
  await expect(setup.or(pw)).toBeVisible();
  if (await setup.isVisible()) {
    await setup.fill(SETUP_TOKEN);
    await page.getByTestId('setup-password').fill(PASSWORD);
    await page.getByTestId('setup-confirm').fill(PASSWORD);
    await page.keyboard.press('Enter');
  } else {
    await pw.fill(PASSWORD);
    await page.keyboard.press('Enter');
  }
  await expect(page.getByTestId('save-indicator').or(page.locator('[data-component=MobileApp]'))).toBeVisible();
}

export async function newProject(page: Page, name: string, template = 'ad') {
  await page.getByTestId('crumb-home').click();
  await page.getByTestId('new-project').click();
  await page.getByTestId('np-name').fill(name);
  await page.getByTestId(`tpl-${template}`).click();
  await page.getByTestId('np-create').click();
  await expect(page.getByTestId('project-name')).toContainText(name);
}

export async function saved(page: Page) {
  await expect(page.getByTestId('save-indicator')).toHaveText('محفوظ', { timeout: 15_000 });
}

/** A small real PNG generated in the page, dispatched as a Ctrl+V paste. */
export async function pasteImage(page: Page, color = '#c9a14f') {
  await page.evaluate(async (c) => {
    const cv = document.createElement('canvas');
    cv.width = 640;
    cv.height = 360;
    const g = cv.getContext('2d')!;
    g.fillStyle = c;
    g.fillRect(0, 0, 640, 360);
    g.fillStyle = '#141210';
    g.fillRect(100, 100, 200, 120);
    const blob: Blob = await new Promise((r) => cv.toBlob((b) => r(b!), 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'ref.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, color);
}

export function shotNums(page: Page) {
  return page.getByTestId('shot-num').allTextContents();
}
