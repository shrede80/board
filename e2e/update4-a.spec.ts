import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { expect, test, type Page } from '@playwright/test';
import { login, shot, smallTargets } from './helpers';

/** Update 4, phase A: import and export on the phone (UPDATE-4 أ). */
test.describe.configure({ mode: 'serial' });
test.skip(({ viewport }) => (viewport?.width ?? 9999) > 500, 'phone only');

const NAME = 'مشروع الجوال للتصدير';

/** The phone's share sheet, recorded: the files handed to navigator.share. */
async function fakeShare(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: { name: string; type: string; data: number[] }[]; __prints: number };
    w.__shared = [];
    w.__prints = 0;
    const nav = navigator as unknown as { canShare: () => boolean; share: (d: ShareData) => Promise<void> };
    nav.canShare = () => true;
    nav.share = async (d) => {
      for (const f of d.files ?? []) w.__shared.push({ name: f.name, type: f.type, data: [...new Uint8Array(await f.arrayBuffer())] });
    };
    window.print = () => { w.__prints++; };
  });
}
const shared = (page: Page) => page.evaluate(() => (window as unknown as { __shared: { name: string; type: string; data: number[] }[] }).__shared);

async function seed(page: Page) {
  await page.evaluate(async (name) => {
    const ops = [
      { op: 'create', entity: 'projects', id: 'pj-u4a', fields: { name, aspect: '16:9', client: 'عميل' } },
      { op: 'create', entity: 'scenes', id: 'sc-u4a1', fields: { projectId: 'pj-u4a', position: 1, name: 'الوصول' } },
      { op: 'create', entity: 'scenes', id: 'sc-u4a2', fields: { projectId: 'pj-u4a', position: 2, name: 'المقابلة' } },
      { op: 'create', entity: 'shots', id: 'sh-u4a1', fields: { projectId: 'pj-u4a', sceneId: 'sc-u4a1', position: 1, description: 'لقطة واسعة' } },
      { op: 'create', entity: 'shots', id: 'sh-u4a2', fields: { projectId: 'pj-u4a', sceneId: 'sc-u4a2', position: 1, description: 'لقطة قريبة' } },
    ];
    const r = await fetch('/api/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops }) });
    if (!r.ok) throw new Error(await r.text());
  }, NAME);
}

async function openExport(page: Page) {
  await page.goto('/');
  await page.getByText(NAME, { exact: true }).first().click();
  await expect(page.getByTestId('m-scenes')).toBeVisible();
  await page.getByTestId('m-project-more').click();
  await page.getByTestId('pm-export').click();
  await expect(page.getByTestId('export-tab-project')).toBeVisible();
}

test('phone: «تصدير…» in the project menu — Excel, project file and PDF; the files are sound; every button ≥ 44', async ({ page }) => {
  await fakeShare(page);
  await login(page);
  await seed(page);
  await openExport(page);
  await shot(page, 'u4a-export-pdf');
  expect(await smallTargets(page, '[data-component=ExportDialog]'), 'export dialog (pdf)').toEqual([]);

  // PDF: the print sheet (phone: share → save to Files); the pages are there, one per four shots
  await page.getByTestId('export-tab-pdf').click();
  await page.getByTestId('export-pdf').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1);
  expect(await page.locator('[data-print-page]').count()).toBeGreaterThan(0);

  // Excel: handed to the share sheet as a real .xlsx
  await page.getByTestId('export-tab-table').click();
  expect(await smallTargets(page, '[data-component=ExportDialog]'), 'export dialog (table)').toEqual([]);
  await page.getByTestId('export-xlsx').click();
  await expect.poll(async () => (await shared(page)).length).toBe(1);
  const xl = (await shared(page))[0];
  expect(xl.name).toBe(`${NAME} — قائمة اللقطات.xlsx`);
  const xz = await JSZip.loadAsync(Buffer.from(xl.data));
  expect(Object.keys(xz.files)).toContain('xl/workbook.xml');
  expect(await xz.file('xl/worksheets/sheet1.xml')!.async('string')).toContain('<row');

  // the project file: a zip with project.json and the right counts
  await page.getByTestId('export-tab-project').click();
  expect(await smallTargets(page, '[data-component=ExportDialog]'), 'export dialog (project)').toEqual([]);
  await page.getByTestId('export-zip').click();
  await expect.poll(async () => (await shared(page)).length).toBe(2);
  const zf = (await shared(page))[1];
  expect(zf.name).toBe(`${NAME}.zip`);
  const zz = await JSZip.loadAsync(Buffer.from(zf.data));
  const pj = JSON.parse(await zz.file('project.json')!.async('string'));
  expect(pj.project.name).toBe(NAME);
  expect(pj.rows.scenes).toHaveLength(2);
  expect(pj.rows.shots).toHaveLength(2);
  // keep the file for the import test
  const fs = await import('node:fs');
  fs.mkdirSync('test-results/u4a', { recursive: true });
  fs.writeFileSync('test-results/u4a/export.zip', Buffer.from(zf.data));
});

test('phone: the project file goes through download when the phone has no share sheet', async ({ page }) => {
  await login(page);
  await openExport(page);
  await page.getByTestId('export-tab-table').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('export-xlsx').click();
  const d = await dl;
  expect(d.suggestedFilename()).toBe(`${NAME} — قائمة اللقطات.xlsx`);
});

test('phone: «استيراد مشروع» on Home (beside «+ مشروع» and in the empty state) takes the exported .zip', async ({ page }) => {
  await login(page);
  await page.goto('/');
  await expect(page.getByTestId('m-import')).toBeVisible();
  expect(await smallTargets(page, '[data-testid=my-projects]'), 'home projects').toEqual([]);
  await page.getByTestId('m-import').click();
  await expect(page.getByTestId('import-input')).toBeAttached();
  expect(await smallTargets(page, '[data-component=ImportDialog]'), 'import dialog').toEqual([]);
  await shot(page, 'u4a-import');
  await page.getByTestId('import-input').setInputFiles({ name: 'export.zip', mimeType: 'application/zip', buffer: readFileSync('test-results/u4a/export.zip') });
  await expect(page.getByTestId('import-preview')).toContainText(NAME);
  await expect(page.getByTestId('import-preview')).toContainText('2 مشاهد');
  expect(await smallTargets(page, '[data-component=ImportDialog]'), 'import preview').toEqual([]);
  await page.getByTestId('import-confirm').click();
  // the imported project opens
  await expect(page.getByTestId('m-scenes')).toBeVisible();
  await expect(page.getByTestId('project-name')).toContainText(`${NAME} (مستورد)`);
  await expect(page.getByTestId('m-scene')).toHaveCount(2);
  // …and shows in the list
  await page.goto('/');
  await expect(page.getByText(`${NAME} (مستورد)`).first()).toBeVisible();

  // the empty state offers the same two buttons (no projects → «ما فيه مشاريع بعد»)
  await page.route('**/api/projects', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: [] }) : r.continue()));
  await page.reload();
  await expect(page.getByText('ما فيه مشاريع بعد.')).toBeVisible();
  await expect(page.getByTestId('m-import-empty')).toBeVisible();
  await expect(page.getByTestId('m-new-empty')).toBeVisible();
  await page.getByTestId('m-import-empty').click();
  await expect(page.getByTestId('import-input')).toBeAttached();
});
