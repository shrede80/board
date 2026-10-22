import { expect, test, type Page } from '@playwright/test';
import { login, newProject, saved, shot } from './helpers';

/** Update 3, phase B: the shot plan (§6, §9) — laptop and phone. */
test.describe.configure({ mode: 'serial' });

const planRows = (page: Page) => page.evaluate(async () => {
  const r = (await fetch('/api/projects').then((x) => x.json())) as { id: string; name: string }[];
  const id = r.find((x) => x.name.startsWith('مخطط'))!.id;
  const s = (await fetch(`/api/projects/${id}`).then((x) => x.json())) as { rows: { planItems?: { id: string; kind: string; x: number; y: number; rot: number; props: Record<string, unknown> }[] } };
  return s.rows.planItems ?? [];
});

async function center(page: Page, sel: string) {
  const b = (await page.locator(sel).first().boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test('laptop: add a camera, rotate, change the lens, arrows, duplicate, delete, undo, PNG', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1000, 'laptop');
  await login(page);
  await newProject(page, 'مخطط الاستوديو', 'ad');
  // from the scene's ⋯ in the storyboard
  await page.getByText('الستوري بورد').click();
  await page.getByTestId('sb-row').first().getByTestId('row-dots').click();
  await page.getByTestId('m-plan').click();
  await expect(page.getByTestId('plan')).toBeVisible();
  await expect(page.getByTestId('plan-title')).toContainText('مخطط المشهد 01');
  await expect(page.getByTestId('plan-empty')).toBeVisible();

  // a camera from «معداتي»
  await page.getByTestId('plan-tab-كاميرات').click();
  await page.getByTestId('plan-add').filter({ hasText: 'ZV-E10' }).click();
  await expect(page.getByTestId('plan-props-camera')).toBeVisible();
  await expect(page.getByTestId('plan-fov')).toHaveText('52°'); // 24mm on APS-C
  await expect(page.getByTestId('plan-frame')).toContainText('2.9 م');
  await saved(page);
  let rows = await planRows(page);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ kind: 'camera', props: { focalMm: 24 } });
  const before0 = rows[0];

  // rotate with the handle (15° steps)
  const c = await center(page, '[data-pid] > g');
  const h = await center(page, '[data-testid=plan-h-rot]');
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 120, c.y, { steps: 8 }); // to the right of the camera → 90°
  await page.mouse.up();
  await saved(page);
  rows = await planRows(page);
  expect(rows[0].rot).toBe(90);

  // drag with the mouse: it moves and snaps to 25 cm
  const c1 = await center(page, '[data-pid] > g');
  await page.mouse.move(c1.x, c1.y);
  await page.mouse.down();
  await page.mouse.move(c1.x - 90, c1.y + 50, { steps: 8 });
  await page.mouse.up();
  await saved(page);
  rows = await planRows(page);
  expect(rows[0].x).toBeLessThan(before0.x);
  expect(Math.round(rows[0].x * 100) % 25).toBe(0);

  // the lens: 50mm → 26°, and the cone follows
  await page.getByTestId('plan-focal').fill('50');
  await expect(page.getByTestId('plan-fov')).toHaveText('26°');
  await expect(page.getByTestId('plan-cone')).toHaveAttribute('data-fov', '26');
  await expect(page.getByTestId('plan-cone-label')).toHaveText('A · 50mm · 26°');
  await page.getByTestId('plan-vertical').click();
  await expect(page.getByTestId('plan-fov')).toHaveText('15°');
  await page.getByTestId('plan-horizontal').click();
  await saved(page);

  // arrows: 5 cm a press, Shift to the next 25 cm line
  const x0 = (await planRows(page))[0].x;
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await saved(page);
  expect((await planRows(page))[0].x).toBeCloseTo(x0 + 0.1, 5);
  await page.keyboard.press('Shift+ArrowRight');
  await saved(page);
  const x2 = (await planRows(page))[0].x;
  expect(Math.round(x2 * 100) % 25).toBe(0);
  expect(x2).toBeGreaterThan(x0 + 0.1);

  // duplicate (Ctrl+D) gives the next letter; delete; undo
  await page.keyboard.press('Control+KeyD');
  await saved(page);
  rows = await planRows(page);
  expect(rows).toHaveLength(2);
  await expect(page.getByTestId('plan-props-camera').locator('.pl-letter')).toHaveText('B');
  await page.keyboard.press('Delete');
  await saved(page);
  expect(await planRows(page)).toHaveLength(1);
  await page.getByTestId('plan-undo').click();
  await saved(page);
  expect(await planRows(page)).toHaveLength(2);

  // L adds a light, P a person (nothing is selected after the delete, so no Esc here: it would close the plan)
  await page.getByTestId('plan-canvas').hover({ position: { x: 200, y: 200 } });
  await page.keyboard.press('KeyL');
  await expect(page.getByTestId('plan-props-light')).toBeVisible();
  await page.getByTestId('plan-mod-lt-softbox45').click();
  await saved(page);
  expect((await planRows(page)).find((r) => r.kind === 'light')?.props.modifier).toBe('lt-softbox45');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyP');
  await expect(page.getByTestId('plan-props-person')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('plan-fit').click();
  await page.waitForTimeout(400);
  await shot(page, 'plan-laptop');

  // the PNG for the team
  const dl = page.waitForEvent('download');
  await page.getByTestId('plan-export').click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe('مخطط-المشهد-01.png');
  if (process.env.SHOTS?.startsWith('/')) await file.saveAs(`${process.env.SHOTS}/plan-export.png`);

  // back to the scene: the mark shows on its row
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('plan')).toHaveCount(0);
  await expect(page.getByTestId('sb-row').first().getByTestId('row-plan-mark')).toBeVisible();
  // and from the scene editor (the «المخطط» field shows in «بسيط»)
  await page.getByTestId('sb-row').first().getByTestId('sb-row-head').click();
  await page.getByTestId('open-plan').click();
  await expect(page.getByTestId('plan')).toBeVisible();
  await expect(page.getByTestId('plan-legend')).toContainText('A');
  // «انسخ من مشهد» into scene 02: «أضف»
  await page.getByTestId('plan-back').click();
  await page.getByTestId('sb-row').nth(1).getByTestId('row-dots').click();
  await page.getByTestId('m-plan').click();
  await page.getByTestId('plan-copy').click();
  await page.getByTestId('plan-copy-add').first().click();
  await expect(page.locator('[data-pid]')).toHaveCount(4);
});

test('phone: add from the sheet, drag with a finger, turn with the handle, pinch to zoom', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 9999) > 500, 'phone');
  await login(page);
  // a project with one scene (made through the API, as the phone opens it from Home)
  await page.evaluate(async () => {
    const ops = [
      { op: 'create', entity: 'projects', id: 'pj-mpl', fields: { name: 'مخطط الجوال', aspect: '16:9' } },
      { op: 'create', entity: 'scenes', id: 'sc-mpl', fields: { projectId: 'pj-mpl', position: 1, name: 'السطح' } },
    ];
    await fetch('/api/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops }) });
  });
  await page.reload();
  await page.getByText('مخطط الجوال').first().click();
  await expect(page.getByTestId('m-scenes')).toBeVisible();
  await page.getByTestId('m-scene-dots').first().click();
  await page.getByTestId('m-plan').click();
  await expect(page.getByTestId('plan')).toBeVisible();

  // «+ عنصر» opens the sheet; a camera
  await page.getByTestId('plan-m-add').click();
  await expect(page.getByTestId('plan-sheet')).toBeVisible();
  await page.getByTestId('plan-add').filter({ hasText: 'iPhone' }).click();
  await expect(page.getByTestId('plan-props-camera')).toBeVisible();
  await page.getByTestId('plan-builtin-2x').click();
  await expect(page.getByTestId('plan-fov')).toHaveText('41°');
  await saved(page).catch(() => {});
  await page.getByTestId('plan-fit').click();
  // tap the empty plan: the sheet closes
  const cv = (await page.getByTestId('plan-canvas').boundingBox())!;
  await page.touchscreen.tap(cv.x + 30, cv.y + 40);
  await expect(page.getByTestId('plan-sheet')).toHaveCount(0);
  let rows = await planRows(page);
  expect(rows).toHaveLength(1);
  const before = rows[0];

  // drag with one finger (touch pointer events)
  const c = await center(page, '[data-pid] > g');
  // real touches (hit-tested by the browser) through the DevTools protocol
  const cdp = await page.context().newCDPSession(page);
  const fingers = new Map<number, { x: number; y: number }>();
  const touch = async (type: string, x: number, y: number, id = 1) => {
    if (type === 'pointerup') fingers.delete(id);
    else fingers.set(id, { x, y });
    const kind = type === 'pointerdown' ? 'touchStart' : type === 'pointermove' ? 'touchMove' : 'touchEnd';
    await cdp.send('Input.dispatchTouchEvent', { type: kind, touchPoints: [...fingers.entries()].map(([i, p]) => ({ x: p.x, y: p.y, id: i })) });
  };
  await touch('pointerdown', c.x, c.y);
  for (let i = 1; i <= 6; i++) await touch('pointermove', c.x + i * 12, c.y + i * 6);
  await touch('pointerup', c.x + 72, c.y + 36);
  await expect.poll(async () => (await planRows(page))[0].x, { timeout: 8000 }).not.toBe(before.x);

  // turn with the handle (44px touch area)
  await expect(page.getByTestId('plan-h-rot')).toBeVisible();
  const hb = (await page.getByTestId('plan-h-rot').locator('circle').first().boundingBox())!;
  expect(hb.width).toBeGreaterThanOrEqual(44);
  const c2 = await center(page, '[data-pid] > g');
  const h = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 };
  await touch('pointerdown', h.x, h.y);
  for (let i = 1; i <= 6; i++) await touch('pointermove', h.x + (c2.x + 100 - h.x) * (i / 6), h.y + (c2.y - h.y) * (i / 6));
  await touch('pointerup', c2.x + 100, c2.y);
  await expect.poll(async () => (await planRows(page))[0].rot, { timeout: 8000 }).toBe(90);

  await shot(page, 'plan-mobile');
  // two fingers on the empty plan zoom
  const scaleBefore = (await page.getByTestId('plan-scale').locator('i').boundingBox())!.width;
  const p0 = { x: cv.x + 60, y: cv.y + 120 };
  await touch('pointerdown', p0.x, p0.y, 1);
  await touch('pointerdown', p0.x + 40, p0.y, 2);
  for (let i = 1; i <= 5; i++) await touch('pointermove', p0.x + 40 + i * 20, p0.y, 2);
  await touch('pointerup', p0.x + 140, p0.y, 2);
  await touch('pointerup', p0.x, p0.y, 1);
  const scaleAfter = (await page.getByTestId('plan-scale').locator('i').boundingBox())!.width;
  expect(scaleAfter).not.toBe(scaleBefore);

  // the back gesture closes the plan, not the app
  await page.goBack();
  await expect(page.getByTestId('plan')).toHaveCount(0);
  await expect(page.getByTestId('m-scenes')).toBeVisible();
});
