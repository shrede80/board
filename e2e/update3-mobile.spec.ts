import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

/** Update 3 on the phone: every visible button in the scene and shot editors is ≥ 44×44 (§2.3). */
test.describe.configure({ mode: 'serial' });
test.skip(({ viewport }) => (viewport?.width ?? 9999) > 500, 'phone only');

/** Visible tap targets smaller than 44×44 inside `root` (buttons, labels that act as buttons, links). */
export async function smallTargets(page: Page, root = '[data-testid=editor]') {
  return page.evaluate((sel) => {
    const out: string[] = [];
    const scope = document.querySelector(sel);
    if (!scope) return ['no ' + sel];
    const els = scope.querySelectorAll<HTMLElement>('button, a[href], label, [role=button], input[type=checkbox], input[type=radio]');
    for (const el of els) {
      if (el.tagName === 'LABEL' && !el.querySelector('input[type=color], input[type=file]') && !el.onclick) continue;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (!r.width || !r.height || st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) continue;
      if (r.bottom < 0 || r.top > innerHeight * 6) continue;
      if ((el as HTMLButtonElement).disabled) continue;
      if (r.width < 43.5 || r.height < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return out;
  }, root);
}

async function seed(page: Page) {
  // a project with a scene that has a shot, a linked note and a linked moodboard
  return page.evaluate(async () => {
    const id = (p: string) => `${p}-${crypto.randomUUID()}`;
    const pj = id('pj'), sc = id('sc'), sh = id('sh'), nt = id('nt'), mb = id('mb');
    const ops = [
      { op: 'create', entity: 'projects', id: pj, fields: { name: 'أهداف اللمس', aspect: '16:9' } },
      { op: 'create', entity: 'scenes', id: sc, fields: { projectId: pj, position: 1, name: 'المدخل' } },
      { op: 'create', entity: 'shots', id: sh, fields: { projectId: pj, sceneId: sc, position: 1, description: 'لقطة واسعة' } },
      { op: 'create', entity: 'notes', id: nt, fields: { projectId: pj, text: 'ملاحظة مرتبطة' } },
      { op: 'create', entity: 'moodboards', id: mb, fields: { projectId: pj, position: 1, title: 'دافئ' } },
      { op: 'create', entity: 'sceneLinks', id: id('sl'), fields: { projectId: pj, sceneId: sc, kind: 'note', refId: nt } },
      { op: 'create', entity: 'sceneLinks', id: id('sl'), fields: { projectId: pj, sceneId: sc, kind: 'moodboard', refId: mb } },
    ];
    const r = await fetch('/api/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops }) });
    if (!r.ok) throw new Error(await r.text());
    return pj;
  });
}

test('phone: tap targets in the scene and shot editors are at least 44×44', async ({ page }) => {
  await login(page);
  await seed(page);
  await page.reload();
  await expect(page.getByTestId('m-home')).toBeVisible();
  await page.getByText('أهداف اللمس').first().click();
  await expect(page.getByTestId('m-scenes')).toBeVisible();
  await page.getByTestId('m-scene-head').first().click();
  await expect(page.getByTestId('editor')).toBeVisible();
  await page.waitForTimeout(300);
  expect(await smallTargets(page), 'scene editor').toEqual([]);
  if (process.env.SHOTS) await page.getByTestId('editor').screenshot({ path: `${process.env.SHOTS}/m-scene-editor.png` });
  await page.getByTestId('editor-close').click();
  await page.getByTestId('m-strip-shot').first().click();
  await expect(page.getByTestId('editor')).toBeVisible();
  await page.waitForTimeout(300);
  expect(await smallTargets(page), 'shot editor').toEqual([]);
});
