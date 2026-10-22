import { expect, test, type Locator, type Page } from '@playwright/test';
import { login, newProject, pasteImage, saved } from './helpers';

/**
 * Update 3, phase A1: storyboard fixes (§2.1, §2.2), arrow keys that align like the mouse
 * (§3.1) and handles that never resize by mistake (§3.2). Laptop only (the free board).
 */
test.describe.configure({ mode: 'serial' });
test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, 'laptop only');

async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error('no box');
  return b;
}
const hit = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width - 0.5 && a.x + a.width > b.x + 0.5 && a.y < b.y + b.height - 0.5 && a.y + a.height > b.y + 0.5;

async function settled(page: Page, l: Locator) {
  let last = '';
  for (let i = 0; i < 40; i++) {
    const b = await box(l);
    const now = `${b.x.toFixed(1)},${b.y.toFixed(1)},${b.width.toFixed(1)},${b.height.toFixed(1)}`;
    if (now === last) return;
    last = now;
    await page.waitForTimeout(100);
  }
  throw new Error('never settled');
}

/** Alt-drag (no snapping) card `c` so its top lands `off` screen px below the top of `a`. */
async function altDragBelow(page: Page, c: Locator, a: Locator, off: number) {
  await settled(page, c);
  await settled(page, a);
  const bc = await box(c), ba = await box(a);
  await page.mouse.move(bc.x + 40, bc.y + 40);
  await page.mouse.down();
  await page.keyboard.down('Alt');
  await page.mouse.move(bc.x + 40, bc.y + 30, { steps: 3 });
  await page.mouse.move(bc.x + 40, ba.y + 40 + off, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await saved(page);
}

async function clearSelection(page: Page) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
}

test('storyboard: «+ لقطة» never covers a shot, the dock never covers the last row', async ({ page }) => {
  await login(page);
  await newProject(page, 'ستوري بورد ٣', 'ad');
  await page.getByText('الستوري بورد').click();
  const rows = page.getByTestId('sb-row');
  await expect(rows.first()).toBeVisible();
  // a long row: 9 shots from the small button in the scene head
  for (let i = 0; i < 9; i++) await rows.first().getByTestId('row-add-shot').click();
  await saved(page);
  await expect(page.getByTestId('editor')).toBeVisible();
  const check = async () => {
    const row = rows.first();
    await row.locator('.sb-shots').evaluate((el) => (el.scrollLeft = -1e6));
    await row.locator('.sb-shots').evaluate((el) => (el.scrollLeft = 1e6));
    await page.waitForTimeout(150);
    const add = await box(row.getByTestId('add-shot'));
    for (const c of await row.getByTestId('shot-card').all()) expect(hit(add, await box(c))).toBe(false);
    // and halfway along, too
    await row.locator('.sb-shots').evaluate((el) => (el.scrollLeft = el.scrollLeft / 2));
    const add2 = await box(row.getByTestId('add-shot'));
    for (const c of await row.getByTestId('shot-card').all()) expect(hit(add2, await box(c))).toBe(false);
    await expect(row.getByTestId('row-add-shot')).toBeInViewport();
  };
  await check(); // editor open
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('editor')).toHaveCount(0);
  await check(); // editor closed

  // scrolling shrinks the dock to one «+»; at the end the last row stays clear of the dock
  await rows.last().getByTestId('row-add-shot').click();
  await page.keyboard.press('Escape');
  await saved(page);
  const sb = page.getByTestId('storyboard');
  await sb.hover();
  await page.mouse.wheel(0, 400);
  await expect(page.getByTestId('dock-mini')).toBeVisible();
  await sb.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 3000 });
  await page.waitForTimeout(300);
  const dock = await box(page.getByTestId('dock'));
  const lastRowCards = rows.last().getByTestId('shot-card');
  const last = await box(lastRowCards.last());
  expect(last.y + last.height).toBeLessThanOrEqual(dock.y);
});

test('arrow keys align like the mouse: guides, Shift stops at the edge, Alt jumps, one undo', async ({ page }) => {
  await login(page);
  await newProject(page, 'أسهم', 'ad');
  const cards = page.getByTestId('scene-card');
  await expect(cards).toHaveCount(5);
  const a = cards.nth(0), c = cards.nth(4);

  // 6px below scene 01's top, then ↑ press by press: a horizontal guide appears when the tops meet
  await altDragBelow(page, c, a, 6);
  await clearSelection(page);
  await c.click({ position: { x: 40, y: 40 } });
  await page.keyboard.press('Escape'); // close the editor the click opened, keep the selection
  let met = false;
  for (let i = 0; i < 40 && !met; i++) {
    await page.keyboard.press('ArrowUp');
    const dy = (await box(c)).y - (await box(a)).y;
    const h = await page.locator('[data-testid=guide][data-dir=h]').count();
    if (Math.abs(dy) < 0.3) {
      expect(h, 'guide when the tops meet').toBeGreaterThan(0);
      met = true;
    } else expect(dy, 'never passes the edge on the way').toBeGreaterThan(0);
  }
  expect(met).toBe(true);
  // the guides fade after the keys stop
  await expect(page.getByTestId('guide')).toHaveCount(0, { timeout: 2500 });
  await saved(page);

  // Shift + ↑ from 6px below stops on the edge and does not pass it
  await page.keyboard.press('Escape');
  await altDragBelow(page, c, a, 6);
  await c.click({ position: { x: 40, y: 40 } });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+ArrowUp');
  expect(Math.abs((await box(c)).y - (await box(a)).y)).toBeLessThan(0.3);
  await expect(page.getByTestId('nudge-hud')).toContainText('وقف عند خط المحاذاة');
  await expect(page.getByTestId('nudge-hud')).toContainText('01');
  await saved(page);

  // Alt + → jumps straight to an edge or centre of another card
  const before = await box(c);
  await page.keyboard.press('Alt+ArrowRight');
  const after = await box(c);
  expect(after.x).toBeGreaterThan(before.x);
  await expect(page.getByTestId('nudge-hud')).toContainText('قفز لخط المحاذاة');
  const edgesX = async (l: Locator) => {
    const b = await box(l);
    return [b.x, b.x + b.width / 2, b.x + b.width];
  };
  const mine = await edgesX(c);
  let aligned = false;
  for (let i = 0; i < 4; i++) for (const t of await edgesX(cards.nth(i))) for (const m of mine) if (Math.abs(t - m) < 0.6) aligned = true;
  expect(aligned).toBe(true);
  await saved(page);

  // ↑ ×10 then Ctrl+Z: back in one step (a pause first: presses in a row are one step)
  await page.waitForTimeout(1700);
  const start = await box(c);
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowUp');
  await saved(page);
  expect((await box(c)).y).toBeLessThan(start.y - 2);
  await page.keyboard.press('Control+z');
  await saved(page);
  expect(Math.abs((await box(c)).y - start.y)).toBeLessThan(0.3);
  // one request after the keys stop, not one per press
  const reqs: string[] = [];
  page.on('request', (r) => r.url().includes('/api/ops') && reqs.push(r.url()));
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
  await saved(page);
  expect(reqs.length).toBe(1);
});

test('handles: inside = move, sides crop the photo, corners keep the ratio, frame rim 14px', async ({ page }) => {
  await login(page);
  await newProject(page, 'مقابض', 'ad');
  const cards = page.getByTestId('scene-card');
  await expect(cards).toHaveCount(5);
  const sc = cards.nth(1);
  await settled(page, sc);
  await sc.click({ position: { x: 60, y: 60 } });
  await page.keyboard.press('Escape');
  await expect(sc.getByTestId('handle-e')).toBeVisible();

  // grab the selected card 4px inside its right edge and drag: it moves, its size stays
  const b0 = await box(sc);
  await page.mouse.move(b0.x + b0.width - 4, b0.y + 80);
  await page.mouse.down();
  await page.mouse.move(b0.x + b0.width - 40, b0.y + 120, { steps: 8 });
  await page.mouse.up();
  await saved(page);
  const b1 = await box(sc);
  expect(Math.abs(b1.width - b0.width)).toBeLessThan(0.5);
  expect(Math.abs(b1.x - b0.x)).toBeGreaterThan(10);

  // side handle of a scene: wider, the photo keeps its height (cropped)
  const photo = sc.locator('[data-photo]').first();
  const ph0 = (await box(photo)).height;
  const he = await box(sc.getByTestId('handle-e'));
  await page.mouse.move(he.x + he.width / 2, he.y + he.height / 2);
  await page.mouse.down();
  await page.mouse.move(he.x + he.width / 2 + 70, he.y + he.height / 2 + 30, { steps: 8 });
  await page.mouse.up();
  await saved(page);
  expect((await box(sc)).width).toBeGreaterThan(b1.width + 20);
  expect(Math.abs((await box(photo)).height - ph0)).toBeLessThan(1);
  // double-click a handle: the default size, the photo follows the width again
  await sc.getByTestId('handle-e').dblclick();
  await saved(page);
  expect(Math.abs((await box(sc)).width - b1.width)).toBeLessThan(1);
  expect(Math.abs((await box(photo)).height - ph0)).toBeLessThan(1);

  // an image card
  await clearSelection(page);
  await page.getByTestId('board').click({ position: { x: 300, y: 600 } });
  await pasteImage(page);
  const img = page.getByTestId('card-image');
  await expect(img).toHaveCount(1);
  await saved(page);
  await settled(page, img);
  await clearSelection(page);
  await img.click({ position: { x: 30, y: 30 } });
  const pic = img.locator('[data-photo]');
  const i0 = await box(img), p0 = await box(pic);
  // side: width only, the photo height stays
  const ie = await box(img.getByTestId('handle-e'));
  await page.mouse.move(ie.x + ie.width / 2, ie.y + ie.height / 2);
  await page.mouse.down();
  await page.mouse.move(ie.x + ie.width / 2 + 80, ie.y + ie.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  await saved(page);
  const i1 = await box(img), p1 = await box(pic);
  expect(i1.width).toBeGreaterThan(i0.width + 30);
  expect(Math.abs(p1.height - p0.height)).toBeLessThan(1);
  // bottom handle: only the photo height
  const is = await box(img.getByTestId('handle-s'));
  await page.mouse.move(is.x + is.width / 2, is.y + is.height / 2);
  await page.mouse.down();
  await page.mouse.move(is.x + is.width / 2 + 30, is.y + is.height / 2 + 50, { steps: 8 });
  await page.mouse.up();
  await saved(page);
  const p2 = await box(pic);
  expect(Math.abs((await box(img)).width - i1.width)).toBeLessThan(1);
  expect(p2.height).toBeGreaterThan(p1.height + 20);
  // corner: the ratio stays
  const ratio = p2.width / p2.height;
  const ic = await box(img.getByTestId('handle-se'));
  await page.mouse.move(ic.x + ic.width / 2, ic.y + ic.height / 2);
  await page.mouse.down();
  await page.mouse.move(ic.x + ic.width / 2 + 90, ic.y + ic.height / 2 - 60, { steps: 8 });
  await page.mouse.up();
  await saved(page);
  const p3 = await box(pic);
  expect(p3.width).toBeGreaterThan(p2.width + 20);
  expect(Math.abs(p3.width / p3.height - ratio)).toBeLessThan(0.03);
  // the photo is cropped, never stretched
  expect(await pic.evaluate((el) => getComputedStyle(el).backgroundSize)).toContain('cover');

  // frame rim: 14 screen px at 50% and at 200%
  await clearSelection(page);
  await page.getByTestId('dock-frame').click();
  const frame = page.getByTestId('card-frame');
  await expect(frame).toHaveCount(1);
  await page.keyboard.press('Escape');
  await saved(page);
  const zoomTo = async (target: number) => {
    const board = await box(page.getByTestId('board'));
    await page.mouse.move(board.x + board.width / 2, board.y + board.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -5000); // clamps at 200%
    await page.waitForTimeout(50);
    if (target < 2) await page.mouse.wheel(0, Math.log(2 / target) / 0.0025);
    await page.keyboard.up('Control');
    await expect(page.getByText(`${Math.round(target * 100)}%`, { exact: true })).toBeVisible();
  };
  for (const zt of [0.5, 2]) {
    await zoomTo(zt);
    const rim = await box(frame.getByTestId('frame-edge'));
    expect(Math.abs(rim.height - 14), `rim at ${zt}`).toBeLessThan(0.6);
  }
});
