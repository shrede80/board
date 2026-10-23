import { readFileSync } from 'node:fs';
import { test, type Page } from '@playwright/test';
import { seedProjects } from '../shared/seed';
import { login } from './helpers';

/**
 * The automatic sweep of UPDATE-3 §2.7 (final check): laptop and phone, light and dark, every main
 * screen with the demo projects. Logs console errors, failed requests, horizontal overflow, small
 * tap targets (phone, < 44×44) and buttons that overlap each other. Runs only on request:
 *   SWEEP=1 npx playwright test e2e/sweep.spec.ts
 * Prints one «SWEEP» line per finding (no data from the user's projects: it runs on demo data).
 */
test.skip(!process.env.SWEEP, 'run with SWEEP=1');
test.setTimeout(600_000);

const TARGETS = 'button, a[href], [role=button], input[type=checkbox], input[type=radio], select';

function audit(page: Page, mobile: boolean) {
  return page.evaluate(({ mobile, sel }) => {
    const out: string[] = [];
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && Number(st.opacity) > 0.05 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    };
    const name = (el: Element) => `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? '#' + el.getAttribute('data-testid') : ''} "${(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)}"`;
    // overflow: the page itself, and visible elements sticking out of the window
    const se = document.scrollingElement!;
    if (se.scrollWidth > innerWidth + 1) out.push(`overflow page ${se.scrollWidth} > ${innerWidth}`);
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if ((r.right > innerWidth + 2 || r.left < -2) && getComputedStyle(el).position !== 'fixed') {
        // only report it when no ancestor clips it (a scrolling row is fine)
        let p = el.parentElement, clipped = false;
        while (p && p !== document.body) {
          const o = getComputedStyle(p);
          if (/(auto|scroll|hidden|clip)/.test(o.overflowX + o.overflow)) { clipped = true; break; }
          p = p.parentElement;
        }
        if (!clipped) out.push(`overflow ${name(el)} ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
    }
    // reachable = what a tap at its middle actually hits (not hidden under a window, a sheet or the plan)
    const reach = (el: Element) => {
      const r = el.getBoundingClientRect();
      const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
      const top = document.elementFromPoint(x, y);
      return !!top && (el === top || el.contains(top) || top.contains(el));
    };
    const targets = [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => vis(el) && !(el as HTMLButtonElement).disabled && !el.closest('[aria-hidden=true]') && reach(el));
    if (mobile) {
      for (const el of targets) {
        const r = el.getBoundingClientRect();
        if (r.width < 43.5 || r.height < 43.5) out.push(`small ${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    // overlapping buttons: two targets whose boxes cross by more than 4px, neither inside the other
    for (let i = 0; i < targets.length; i++) {
      for (let j = i + 1; j < targets.length; j++) {
        const a = targets[i], b = targets[j];
        if (a.contains(b) || b.contains(a)) continue;
        const r = a.getBoundingClientRect(), q = b.getBoundingClientRect();
        const w = Math.min(r.right, q.right) - Math.max(r.left, q.left), h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
        // both can be tapped (each one's middle reaches it) and their boxes cross
        if (w > 4 && h > 4) out.push(`overlap ${name(a)} × ${name(b)}`);
      }
    }
    return out;
  }, { mobile, sel: TARGETS });
}

async function seed(page: Page) {
  const seedJson = JSON.parse(readFileSync('prototype/data/seed.json', 'utf8'));
  for (const p of seedProjects(seedJson).reverse()) {
    await page.evaluate(async (body) => {
      await fetch('/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    }, { project: p, keepName: true });
  }
  // a plan, a project template and a scene template on the first project
  await page.evaluate(async () => {
    const list = (await fetch('/api/projects').then((r) => r.json())) as { id: string }[];
    const pid = list[0].id;
    const s = (await fetch(`/api/projects/${pid}`).then((r) => r.json())) as { rows: { scenes: { id: string }[] } };
    const sc = s.rows.scenes[0].id;
    const it = (id: string, kind: string, x: number, y: number, f: Record<string, unknown> = {}) => ({ op: 'create', entity: 'planItems', id, fields: { projectId: pid, sceneId: sc, kind, x, y, rot: 0, w: 0.8, h: 0.8, label: '', props: {}, ...f } });
    const ops = [
      it('pl-s1', 'camera', 3, 4, { refId: 'cam-zve10', label: 'A', props: { focalMm: 35, range: 3 } }),
      it('pl-s2', 'light', 5, 1, { refId: 'lt-hs60b', rot: 225, label: 'HS60B', props: { modifier: 'lt-softbox45', cct: 5600, range: 2.5 } }),
      it('pl-s3', 'person', 3, 2, { label: 'الضيف', color: '#c27a32' }),
      it('pl-s4', 'furniture', 3, 2.7, { w: 1.6, h: 0.8, label: 'طاولة', props: { type: 'table' } }),
      it('pl-s5', 'arrow', 0.5, 3, { label: 'حركة', color: '#3b6fd8', props: { points: [[0, 0], [1, -0.5], [2, 0]], dashed: true, curve: true } }),
    ];
    await fetch('/api/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops }) });
    await fetch(`/api/projects/${pid}/template`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'قالب: تجربة' }) });
    await fetch(`/api/projects/${pid}/template`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'مشهد تجربة', sceneId: sc }) });
  });
}

test('sweep', async ({ page, viewport }) => {
  const mobile = (viewport?.width ?? 0) < 500;
  const device = mobile ? 'phone' : 'laptop';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message.slice(0, 140)}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console ${m.text().slice(0, 140)}`));
  page.on('response', (r) => r.status() >= 400 && !(r.status() === 401 && /\/api\/(auth|home|projects)/.test(r.url())) && errors.push(`http ${r.status()} ${new URL(r.url()).pathname}`));
  await login(page);
  await seed(page);
  const report = async (screen: string, theme: string) => {
    await page.waitForTimeout(500);
    for (const f of [...errors.splice(0), ...(await audit(page, mobile))]) console.log(`SWEEP ${device} ${theme} ${screen} :: ${f}`);
  };
  const step = async (screen: string, theme: string, go: () => Promise<unknown>) => {
    try {
      await go();
      await report(screen, theme);
    } catch (e) {
      console.log(`SWEEP ${device} ${theme} ${screen} :: could not open (${String(e).split('\n')[0].slice(0, 100)})`);
    }
  };
  const esc = () => page.keyboard.press('Escape');

  for (const theme of ['light', 'dark']) {
    await page.goto('/');
    await page.evaluate((t) => document.documentElement.setAttribute('data-sb-theme', t), theme);
    const keepTheme = () => page.evaluate((t) => document.documentElement.setAttribute('data-sb-theme', t), theme);
    await page.waitForTimeout(800);
    await keepTheme();
    await step('home', theme, async () => page.getByTestId('home').or(page.getByTestId('my-projects')).first().waitFor());
    await step('new-project', theme, async () => { await page.getByTestId('new-project').click(); await page.getByTestId('np-name').waitFor(); });
    await esc();
    if (!mobile) {
      await step('search', theme, async () => { await page.keyboard.press('Control+KeyK'); await page.getByTestId('search-input').fill('مشهد'); await page.waitForTimeout(500); });
      await esc();
      await step('board', theme, async () => { await page.getByTestId('project-card').first().click(); await page.getByTestId('project-name').waitFor(); await keepTheme(); });
      await step('storyboard', theme, async () => { await page.getByText('الستوري بورد').first().click(); await page.getByTestId('sb-row').first().waitFor(); });
      await step('scene-editor', theme, async () => { await page.getByTestId('sb-row').first().getByTestId('sb-row-head').click(); await page.getByTestId('editor').waitFor(); });
      await step('fields', theme, async () => { await page.getByTestId('fields-btn').click(); await page.waitForTimeout(300); });
      await esc();
      await esc();
      await step('shot-editor', theme, async () => { await page.getByTestId('shot-card').first().click(); await page.getByTestId('editor').waitFor(); });
      await esc();
      await step('scene-add-menu', theme, async () => { await page.getByTestId('dock-scene').click(); await page.getByTestId('scene-add-menu').waitFor(); });
      await esc();
      await step('plan', theme, async () => { await page.getByTestId('sb-row').first().getByTestId('row-dots').click(); await page.getByTestId('m-plan').click(); await page.getByTestId('plan').waitFor(); });
      await step('plan-selected', theme, async () => { await page.locator('[data-pid="pl-s1"] > g').click({ force: true }); await page.getByTestId('plan-props-camera').waitFor(); });
      await esc();
      await esc();
      await step('shortcuts', theme, async () => { await page.keyboard.press('Shift+Slash'); await page.waitForTimeout(400); });
      await esc();
      await step('export', theme, async () => { await page.getByTestId('open-export').click(); await page.waitForTimeout(600); });
      await esc();
      await step('templates-home', theme, async () => { await page.getByTestId('crumb-home').click(); await page.getByTestId('my-templates').scrollIntoViewIfNeeded(); });
      await step('template-open', theme, async () => { await page.getByTestId('template-card').first().click(); await page.getByTestId('tpl-badge').first().waitFor(); });
      await step('save-template', theme, async () => { await page.getByTestId('crumb-home').click(); await page.getByTestId('project-dots').first().click(); await page.getByTestId('hm-save-tpl').click(); await page.getByTestId('save-template').waitFor(); });
      await esc();
      for (const label of ['معداتي', 'سلة المحذوفات', 'الإعدادات']) {
        await step(label, theme, async () => { await page.getByTestId('menu').click(); await page.getByText(label, { exact: true }).first().click(); await page.waitForTimeout(600); });
        await page.goto('/');
        await keepTheme();
      }
      await step('ideas', theme, async () => { await page.getByTestId('ideas-all').click(); await page.waitForTimeout(500); });
    } else {
      await step('project', theme, async () => { await page.getByTestId('my-projects').getByRole('button').first().click(); await page.getByTestId('m-scenes').waitFor(); await keepTheme(); });
      await step('scene-menu', theme, async () => { await page.getByTestId('m-scene-dots').first().click(); await page.getByTestId('m-plan').waitFor(); });
      await esc();
      await step('scene-add-menu', theme, async () => { await page.getByTestId('m-add-scene').scrollIntoViewIfNeeded(); await page.getByTestId('m-add-scene').click(); await page.getByTestId('scene-add-menu').waitFor(); });
      await esc();
      await step('scene-editor', theme, async () => { await page.getByTestId('m-scene-head').first().click(); await page.getByTestId('editor').waitFor(); });
      await page.goBack();
      await step('plan', theme, async () => { await page.getByTestId('m-scene-dots').first().click(); await page.getByTestId('m-plan').click(); await page.getByTestId('plan').waitFor(); });
      await step('plan-sheet', theme, async () => { await page.getByTestId('plan-m-add').click(); await page.getByTestId('plan-sheet').waitFor(); });
      await page.goBack();
      await page.goBack();
      await step('shots-tab', theme, async () => { await page.getByText('اللقطات', { exact: true }).first().click(); await page.waitForTimeout(400); });
      await step('library-tab', theme, async () => { await page.getByText('المكتبة', { exact: true }).first().click(); await page.waitForTimeout(400); });
      await step('add-sheet', theme, async () => { await page.getByTestId('m-add').click(); await page.waitForTimeout(400); });
      await page.goBack();
      await step('ideas', theme, async () => { await page.getByTestId('m-tab-ideas').click(); await page.waitForTimeout(400); });
      await step('more', theme, async () => { await page.getByTestId('m-tab-more').click(); await page.waitForTimeout(400); });
      await step('home-templates', theme, async () => { await page.getByTestId('m-tab-home').click(); await page.getByTestId('my-templates').scrollIntoViewIfNeeded(); });
    }
  }
});
