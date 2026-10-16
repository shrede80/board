import { expect, test } from '@playwright/test';
import { login, newProject, saved } from './helpers';

test.describe.configure({ mode: 'serial' });
test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'laptop flows');

test('home: opens on Home, project card menu renames, delete goes back with «تراجع», search opens a project', async ({ page }) => {
  await login(page);
  await expect(page.getByTestId('greeting')).toBeVisible();
  await newProject(page, 'مشروع الرئيسية', 'ad');
  await saved(page);

  // logo / breadcrumb back to Home; the project is a card there
  await page.getByTestId('crumb-home').click();
  await expect(page.getByTestId('greeting')).toBeVisible();
  const card = page.getByTestId('project-card').filter({ hasText: 'مشروع الرئيسية' });
  await expect(card).toHaveCount(1);
  await expect(page.getByTestId('continue-card')).toContainText('مشروع الرئيسية');

  // ⋯ → rename in place
  await card.getByTestId('project-dots').click();
  await page.getByTestId('hm-rename').click();
  await page.getByTestId('project-card-name-input').fill('مشروع مُعاد');
  await page.keyboard.press('Enter');
  const renamed = page.getByTestId('project-card').filter({ hasText: 'مشروع مُعاد' });
  await expect(renamed).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => fetch('/api/projects').then((r) => r.json()).then((l) => l.map((p: { name: string }) => p.name)))).toContain('مشروع مُعاد');

  // ⋯ → delete → stays on Home, «تراجع» brings it back
  await renamed.getByTestId('project-dots').click();
  await page.getByTestId('hm-delete').click();
  await page.getByTestId('confirm-ok').click();
  await expect(renamed).toHaveCount(0);
  await page.getByTestId('toast-undo-project').click();
  await expect(renamed).toHaveCount(1);

  // Ctrl+K → search → Enter opens the project
  await page.keyboard.press('Control+k');
  await page.getByTestId('search-input').fill('مُعاد');
  await expect(page.getByTestId('search-hit').first()).toHaveAttribute('data-kind', 'project');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('project-name')).toHaveText('مشروع مُعاد');
});

test('ideas: quick add with a link, convert to a shot then undo, delete with undo, logout', async ({ page }) => {
  await login(page);
  if (await page.getByTestId('crumb-home').isVisible()) await page.getByTestId('crumb-home').click();
  await expect(page.getByTestId('ideas-box')).toBeVisible();

  const box = page.getByTestId('ideas-box');
  await box.getByTestId('idea-quick').fill('لقطة من فوق للمدخل https://example.com/ref');
  await page.keyboard.press('Enter');
  const idea = box.getByTestId('idea-card').filter({ hasText: 'لقطة من فوق للمدخل' });
  await expect(idea).toHaveCount(1);
  await expect(idea.getByTestId('idea-link')).toHaveAttribute('href', 'https://example.com/ref');
  await expect(idea.getByTestId('idea-time')).toContainText('من اللابتوب · اليوم');
  await expect(idea.getByTestId('idea-badge')).toHaveText('بدون مشروع');

  // convert → shot: pick the project, then the scene
  await idea.getByTestId('idea-convert').click();
  await page.getByTestId('convert-shot').click();
  await page.getByTestId('choose-project').filter({ hasText: 'مشروع مُعاد' }).click();
  await page.getByTestId('choose-scene').first().click();
  await expect(page.getByTestId('project-name')).toHaveText('مشروع مُعاد');
  const made = page.getByTestId('toast').filter({ hasText: 'صارت اللقطة' });
  await expect(made).toHaveCount(1);
  await saved(page);
  const shots = () => page.evaluate(() => fetch('/api/projects').then((r) => r.json()).then((l) => l.find((p: { name: string }) => p.name === 'مشروع مُعاد').shots));
  const before = await shots();
  await made.getByTestId('toast-undo').click();
  await saved(page);
  expect(await shots()).toBe(before - 1);

  // the idea is back in the box
  await page.getByTestId('crumb-home').click();
  await expect(idea).toHaveCount(1);

  // delete → «تراجع»
  await idea.getByTestId('idea-delete').click();
  await expect(idea).toHaveCount(0);
  await page.getByTestId('toast').filter({ hasText: 'انحذفت الفكرة' }).getByTestId('toast-undo').click();
  await expect(idea).toHaveCount(1);

  // logout from the main menu
  await page.getByTestId('menu').click();
  await page.getByTestId('menu-logout').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('login-password')).toBeVisible();
});
