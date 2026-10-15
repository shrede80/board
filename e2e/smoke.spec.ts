import { expect, test } from '@playwright/test';

test('app shell loads and reaches the API', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('health')).toHaveText('الخادم وقاعدة البيانات وتخزين الصور تعمل');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});
