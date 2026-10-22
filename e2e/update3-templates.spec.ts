import { expect, test, type Page } from '@playwright/test';
import { login, saved, shot } from './helpers';

/** Update 3, phase C: saved templates (§7, §9) — laptop and phone. */
test.describe.configure({ mode: 'serial' });

const api = (page: Page, ops: unknown[]) => page.evaluate(async (o) => {
  const r = await fetch('/api/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: o }) });
  if (!r.ok) throw new Error(await r.text());
}, ops);
const rows = (page: Page, id: string) => page.evaluate(async (pid) => (await fetch(`/api/projects/${pid}`).then((r) => r.json())) as { rows: Record<string, { id: string; deletedAt: number | null; [k: string]: unknown }[]> }, id);
const projects = (page: Page) => page.evaluate(async () => (await fetch('/api/projects').then((r) => r.json())) as { id: string; name: string; templateKind: string | null }[]);

test('laptop: save a project as a template, a new project from it matches; a scene template goes into another project', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1000, 'laptop');
  await login(page);
  await api(page, [
    { op: 'create', entity: 'projects', id: 'pj-tsrc', fields: { name: 'عقار الياسمين', client: 'شركة النخبة', aspect: '9:16' } },
    { op: 'create', entity: 'characters', id: 'ch-t1', fields: { projectId: 'pj-tsrc', name: 'المقدّم' } },
    { op: 'create', entity: 'characters', id: 'ch-t2', fields: { projectId: 'pj-tsrc', name: 'الضيف' } },
    { op: 'create', entity: 'scenes', id: 'sc-t1', fields: { projectId: 'pj-tsrc', position: 1, name: 'الوصول' } },
    { op: 'create', entity: 'scenes', id: 'sc-t2', fields: { projectId: 'pj-tsrc', position: 2, name: 'مقابلة الصالة' } },
    { op: 'create', entity: 'shots', id: 'sh-t1', fields: { projectId: 'pj-tsrc', sceneId: 'sc-t1', position: 1, description: 'درون واسعة', status: 'shot' } },
    { op: 'create', entity: 'shots', id: 'sh-t2', fields: { projectId: 'pj-tsrc', sceneId: 'sc-t2', position: 1, description: 'قريبة للضيف' } },
    { op: 'create', entity: 'shots', id: 'sh-t3', fields: { projectId: 'pj-tsrc', sceneId: 'sc-t2', position: 2, description: 'عكسية للمقدّم' } },
    { op: 'create', entity: 'sceneCharacters', id: 'sc-t2:ch-t1', fields: { projectId: 'pj-tsrc', sceneId: 'sc-t2', characterId: 'ch-t1' } },
    { op: 'create', entity: 'sceneCharacters', id: 'sc-t2:ch-t2', fields: { projectId: 'pj-tsrc', sceneId: 'sc-t2', characterId: 'ch-t2' } },
    { op: 'create', entity: 'planItems', id: 'pl-t1', fields: { projectId: 'pj-tsrc', sceneId: 'sc-t2', kind: 'camera', refId: 'cam-zve10', x: 2, y: 3, label: 'A' } },
    { op: 'create', entity: 'planItems', id: 'pl-t2', fields: { projectId: 'pj-tsrc', sceneId: 'sc-t2', kind: 'person', refId: 'ch-t2', x: 2, y: 1, label: 'الضيف' } },
    // another project that already has «المقدّم»
    { op: 'create', entity: 'projects', id: 'pj-tdst', fields: { name: 'مقابلات الشركة' } },
    { op: 'create', entity: 'characters', id: 'ch-d1', fields: { projectId: 'pj-tdst', name: 'المقدّم' } },
    { op: 'create', entity: 'scenes', id: 'sc-d1', fields: { projectId: 'pj-tdst', position: 1, name: 'افتتاحية' } },
  ]);
  await page.reload();
  // no templates yet: «قوالبي» is hidden
  await expect(page.getByTestId('home')).toBeVisible();
  await expect(page.getByTestId('my-templates')).toHaveCount(0);

  // Home ⋯ → «احفظ كقالب»
  const card = page.locator('[data-testid=project-card][data-project-id=pj-tsrc]');
  await card.getByTestId('project-dots').click();
  await page.getByTestId('hm-save-tpl').click();
  await expect(page.getByTestId('save-template')).toBeVisible();
  await expect(page.getByTestId('tpl-name')).toHaveValue('قالب: عقار الياسمين');
  await page.getByTestId('tpl-name').fill('قالب: إعلان عقار');
  await shot(page, 'tpl-save');
  await page.getByTestId('tpl-save').click();
  await expect(page.getByTestId('template-card')).toHaveCount(1);
  await expect(page.getByTestId('template-card')).toContainText('قالب: إعلان عقار');
  await expect(page.getByTestId('template-card')).toContainText('2 مشاهد · 3 لقطة · مخطط');
  // not in «مشاريعي», and the original didn't change
  await expect(page.getByTestId('my-projects').getByText('قالب: إعلان عقار')).toHaveCount(0);
  const src = await rows(page, 'pj-tsrc');
  expect(src.rows.shots.find((r) => r.id === 'sh-t1')?.status).toBe('shot');

  // «مشروع جديد» → «قوالبي» → the content matches
  await page.getByTestId('new-project').click();
  await page.getByTestId('np-name').fill('عقار الملقا');
  await page.getByTestId('np-my-template').filter({ hasText: 'إعلان عقار' }).click();
  await shot(page, 'tpl-new');
  await page.getByTestId('np-create').click();
  await expect(page.getByTestId('project-name')).toHaveText('عقار الملقا');
  const made = (await projects(page)).find((p) => p.name === 'عقار الملقا')!;
  expect(made.templateKind).toBeNull();
  const m = await rows(page, made.id);
  const live = <T extends { deletedAt: number | null }>(l: T[]) => l.filter((r) => !r.deletedAt);
  expect(live(m.rows.scenes).map((r) => r.name).sort()).toEqual(['الوصول', 'مقابلة الصالة']);
  expect(live(m.rows.shots).map((r) => [r.description, r.status]).sort()).toEqual([['درون واسعة', 'planned'], ['عكسية للمقدّم', 'planned'], ['قريبة للضيف', 'planned']]);
  expect(live(m.rows.planItems)).toHaveLength(2);
  expect(live(m.rows.characters).map((r) => r.name).sort()).toEqual(['الضيف', 'المقدّم']);

  // a scene template: storyboard ⋯ on the scene row of the original
  await page.getByTestId('crumb-home').click();
  await page.locator('[data-testid=project-card][data-project-id=pj-tsrc]').click();
  await page.getByText('الستوري بورد').click();
  await page.getByTestId('sb-row').nth(1).getByTestId('row-dots').click();
  await page.getByTestId('m-save-scene-tpl').click();
  await expect(page.getByTestId('tpl-name')).toHaveValue('مقابلة الصالة');
  await page.getByTestId('tpl-name').fill('مقابلة بكاميرتين');
  await page.getByTestId('tpl-save').click();
  await expect(page.getByText('انحفظ قالب المشهد «مقابلة بكاميرتين»')).toBeVisible();

  // into the other project from «+ مشهد»
  await page.getByTestId('crumb-home').click();
  await expect(page.getByTestId('scene-template').filter({ hasText: 'مقابلة بكاميرتين' })).toBeVisible();
  await shot(page, 'tpl-home');
  await page.locator('[data-testid=project-card][data-project-id=pj-tdst]').click();
  await page.getByTestId('dock-scene').click();
  await expect(page.getByTestId('scene-add-menu')).toBeVisible();
  await shot(page, 'tpl-scene-menu');
  await page.getByTestId('add-scene-tpl').filter({ hasText: 'مقابلة بكاميرتين' }).click();
  await expect(page.getByText('انضاف المشهد من القالب')).toBeVisible();
  await saved(page);
  const d = await rows(page, 'pj-tdst');
  const sc = live(d.rows.scenes).find((r) => r.name === 'مقابلة الصالة')!;
  expect(sc).toBeTruthy();
  expect(live(d.rows.shots).filter((r) => r.sceneId === sc.id).map((r) => r.description)).toEqual(['قريبة للضيف', 'عكسية للمقدّم']);
  // «المقدّم» linked to the one already here, «الضيف» added
  expect(live(d.rows.characters).map((r) => r.name).sort()).toEqual(['الضيف', 'المقدّم']);
  const links = live(d.rows.sceneCharacters).filter((r) => r.sceneId === sc.id).map((r) => r.characterId);
  expect(links).toContain('ch-d1');
  const plan = live(d.rows.planItems).filter((r) => r.sceneId === sc.id);
  expect(plan).toHaveLength(2);
  const guest = live(d.rows.characters).find((r) => r.name === 'الضيف')!.id;
  expect(plan.find((r) => r.kind === 'person')?.refId).toBe(guest);
  // one undo step takes it all back
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+KeyZ');
  await saved(page);
  const u = await rows(page, 'pj-tdst');
  expect(live(u.rows.scenes).map((r) => r.name)).toEqual(['افتتاحية']);

  // the template opens and edits like a project, with the «قالب» badge
  await page.getByTestId('crumb-home').click();
  await page.getByTestId('template-card').click();
  await expect(page.getByTestId('project-name')).toHaveText('قالب: إعلان عقار');
  await expect(page.getByTestId('tpl-badge')).toBeVisible();
  // the search shows it with the badge
  await page.getByTestId('crumb-home').click();
  await page.keyboard.press('Control+KeyK');
  await page.getByTestId('search-input').fill('إعلان عقار');
  await expect(page.getByTestId('search-hit').filter({ hasText: 'قالب: إعلان عقار' }).getByTestId('tpl-badge')).toBeVisible();
});

test('phone: «قوالبي» on Home, the template in «مشروع جديد», «+ مشهد» with the scene templates', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 9999) > 500, 'phone');
  await login(page);
  // templates come from the laptop test (same database); make sure there is one of each
  let list = await projects(page);
  if (!list.some((p) => p.templateKind === 'scene')) {
    await api(page, [
      { op: 'create', entity: 'projects', id: 'pj-mt', fields: { name: 'مصدر الجوال' } },
      { op: 'create', entity: 'scenes', id: 'sc-mt', fields: { projectId: 'pj-mt', position: 1, name: 'ريفيل درون' } },
      { op: 'create', entity: 'shots', id: 'sh-mt', fields: { projectId: 'pj-mt', sceneId: 'sc-mt', position: 1, description: 'صعود' } },
    ]);
    await page.evaluate(async () => {
      await fetch('/api/projects/pj-mt/template', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'ريفيل درون في الذهبية', sceneId: 'sc-mt' }) });
      await fetch('/api/projects/pj-mt/template', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'قالب: مصدر الجوال' }) });
    });
    list = await projects(page);
  }
  const sceneTpl = list.find((p) => p.templateKind === 'scene')!;
  await api(page, [
    { op: 'create', entity: 'projects', id: 'pj-mdst', fields: { name: 'ريل الجوال' } },
    { op: 'create', entity: 'scenes', id: 'sc-mdst', fields: { projectId: 'pj-mdst', position: 1, name: 'البداية' } },
  ]);
  await page.reload();
  await expect(page.getByTestId('my-templates')).toBeVisible();
  await expect(page.getByTestId('scene-template').first()).toBeVisible();
  await expect(page.getByTestId('my-projects').getByText(sceneTpl.name)).toHaveCount(0);
  await page.getByTestId('my-templates').scrollIntoViewIfNeeded();
  await shot(page, 'tpl-mobile-home');
  // «مشروع جديد» lists «قوالبي»
  await page.getByTestId('new-project').click();
  await expect(page.getByTestId('np-my-template').first()).toBeVisible();
  await page.keyboard.press('Escape');

  // «+ مشهد» in a project: the menu with the scene templates
  await page.getByText('ريل الجوال').first().click();
  await expect(page.getByTestId('m-scenes')).toBeVisible();
  await page.getByTestId('m-add-scene').click();
  await expect(page.getByTestId('scene-add-menu')).toBeVisible();
  await page.getByTestId('add-scene-tpl').filter({ hasText: sceneTpl.name }).click();
  await expect(page.getByTestId('m-scene')).toHaveCount(2);
  // the editor opened on the new scene; back closes it
  await page.goBack();
  await expect(page.getByTestId('m-scene')).toHaveCount(2);
});
