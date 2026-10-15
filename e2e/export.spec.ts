import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { login, newProject, pasteImage, saved } from './helpers';

test.describe.configure({ mode: 'serial' });
test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, 'export is laptop-only');

test('exports: storyboard PDF (print), shot list Excel, full project zip → import as a new project', async ({ page }) => {
  await login(page);
  await newProject(page, 'تصدير', 'ad');
  await page.getByText('الستوري بورد').click();
  const rows = page.getByTestId('sb-row');
  await rows.nth(0).getByTestId('add-shot').click();
  await page.getByTestId('shot-desc').fill('لقطة للتصدير');
  await pasteImage(page, '#2e3d5c');
  await expect(page.getByTestId('gallery-tile')).toHaveCount(1);
  await rows.nth(1).getByTestId('add-shot').click();
  await page.getByTestId('editor-close').click();
  await saved(page);

  // 1) PDF = browser print of the A4 landscape pages
  await page.evaluate(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => { (window as unknown as { __printed: number }).__printed++; };
  });
  await page.getByTestId('open-export').click();
  await expect(page.locator('[data-print-page]')).toHaveCount(1);
  await expect(page.locator('[data-print-page]').first()).toContainText('لقطة للتصدير');
  // the real photo is used at full size (not the thumbnail)
  const src = await page.locator('[data-print-page] img').first().getAttribute('src');
  expect(src).toMatch(/^\/api\/images\/img-[^/]+$/);
  await page.getByTestId('export-pdf').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);

  // 2) Excel: a real .xlsx with Arabic headers, right-to-left
  await page.getByTestId('export-tab-table').click();
  const [xl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-xlsx').click()]);
  expect(xl.suggestedFilename()).toMatch(/\.xlsx$/);
  const xzip = await JSZip.loadAsync(await readFile((await xl.path())!));
  const sheet = await xzip.file('xl/worksheets/sheet1.xml')!.async('string');
  expect(sheet).toContain('rightToLeft="1"');
  expect(sheet).toContain('الوصف');
  expect(sheet).toContain('لقطة للتصدير');
  expect(sheet).toContain('1.1');

  // 3) full project zip with the original photo
  await page.getByTestId('export-tab-project').click();
  const [zd] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-zip').click()]);
  expect(zd.suggestedFilename()).toBe('تصدير.zip');
  const zpath = (await zd.path())!;
  const pz = await JSZip.loadAsync(await readFile(zpath));
  const pj = JSON.parse(await pz.file('project.json')!.async('string'));
  expect(pj.rows.scenes).toHaveLength(5);
  expect(pj.rows.shots).toHaveLength(2);
  const files = Object.keys(pz.files).filter((f) => f.startsWith('images/') && !pz.files[f].dir);
  expect(files).toHaveLength(1);

  // a broken file gives a clear message and creates nothing
  await page.getByTestId('import-input').setInputFiles({ name: 'bad.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip') });
  await expect(page.getByTestId('import-error')).toContainText('ليس نسخة مشروع صالحة');

  // import → preview → confirm → a NEW project opens with the same content
  await page.getByTestId('import-input').setInputFiles(zpath);
  await expect(page.getByTestId('import-preview')).toContainText('5 مشاهد · 2 لقطة · 1 صورة');
  await page.getByTestId('import-confirm').click();
  await expect(page.locator('[data-component=ProjectSwitcherTrigger]')).toContainText('تصدير (مستورد)');
  await page.getByText('الستوري بورد').click();
  await expect(page.getByTestId('shot-card').first()).toContainText('لقطة للتصدير');
  // the photo came through
  await page.getByTestId('shot-card').first().click();
  await expect(page.getByTestId('gallery-tile')).toHaveCount(1);
  const names = await page.evaluate(() => fetch('/api/projects').then((r) => r.json()).then((l: { name: string }[]) => l.map((p) => p.name)));
  expect(names).toContain('تصدير');
  expect(names).toContain('تصدير (مستورد)');
});
