import { expect, test, type Locator, type Page } from '@playwright/test';
import { login, newProject, saved } from './helpers';

test.describe.configure({ mode: 'serial' });
test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, 'board is laptop-only');

async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error('no box');
  return b;
}

/** Drags card `c` so its top lands `off` px below the top of card `a` (screen px). */
async function dragNearTop(page: Page, c: Locator, a: Locator, off: number, opts: { alt?: boolean; release?: boolean } = {}) {
  const bc = await box(c), ba = await box(a);
  await page.mouse.move(bc.x + 40, bc.y + 40);
  await page.mouse.down();
  if (opts.alt) await page.keyboard.down('Alt');
  await page.mouse.move(bc.x + 40, bc.y + 30, { steps: 3 });
  await page.mouse.move(bc.x + 40, ba.y + 40 + off, { steps: 10 });
  const guides = await page.getByTestId('guide').count();
  if (opts.release !== false) await page.mouse.up();
  if (opts.alt) await page.keyboard.up('Alt');
  return guides;
}

test('alignment: guides + snap, magnet off, Alt pauses, auto-arrange then undo', async ({ page }) => {
  await login(page);
  await newProject(page, 'محاذاة', 'ad');
  const cards = page.getByTestId('scene-card');
  await expect(cards).toHaveCount(5);
  // the magnet is on by default
  await expect(page.getByTestId('snap-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('snap-toggle')).toHaveAttribute('title', 'المحاذاة: تعمل');

  // scene 05 sits in the second row; bring it 4px below scene 01's top → guide + snap
  const a = cards.nth(0), c = cards.nth(4);
  let guides = await dragNearTop(page, c, a, 4, { release: false });
  expect(guides).toBeGreaterThan(0);
  await page.mouse.up();
  await expect(page.getByTestId('guide')).toHaveCount(0); // gone on drop
  expect(Math.abs((await box(c)).y - (await box(a)).y)).toBeLessThan(0.5);
  await saved(page);

  // no guide nearby → lands on the dot grid (24 world px). Guides win over the grid, so try
  // a few drop spots until one has no guide at release time.
  let gridChecked = false;
  for (const [dx, dy] of [[-37, 290], [-91, 330], [-143, 270], [53, 350], [-211, 310]]) {
    const before = await box(c);
    await page.mouse.move(before.x + 40, before.y + 40);
    await page.mouse.down();
    await page.mouse.move(before.x + 40 + dx, before.y + 40 + dy, { steps: 10 });
    const g = await page.getByTestId('guide').count();
    await page.mouse.up();
    await saved(page);
    if (g) continue;
    const pos = await page.evaluate(async () => {
      const r = (await fetch('/api/projects').then((x) => x.json())) as { id: string; name: string }[];
      const id = r.find((x) => x.name === 'محاذاة')!.id;
      const snap = (await fetch(`/api/projects/${id}`).then((x) => x.json())) as { rows: { scenes: { position: number; boardX: number; boardY: number }[] } };
      return snap.rows.scenes.sort((a, b) => a.position - b.position).map((s) => [s.boardX, s.boardY]);
    });
    const [x5, y5] = pos[4];
    expect(x5 % 24, `x ${x5}`).toBe(0);
    expect(y5 % 24, `y ${y5}`).toBe(0);
    gridChecked = true;
    break;
  }
  expect(gridChecked).toBe(true);

  await page.getByTitle('ملاءمة الكل').click();
  await page.waitForTimeout(100);
  // Alt held: no guides, no snap
  guides = await dragNearTop(page, c, a, 3, { alt: true });
  expect(guides).toBe(0);
  await saved(page);
  expect(Math.abs((await box(c)).y - (await box(a)).y - 3)).toBeLessThan(1.5);

  // magnet off: free movement
  await page.getByTestId('snap-toggle').click();
  await expect(page.getByTestId('snap-toggle')).toHaveAttribute('title', 'المحاذاة: متوقفة');
  guides = await dragNearTop(page, c, a, 5);
  expect(guides).toBe(0);
  await saved(page);
  expect(Math.abs((await box(c)).y - (await box(a)).y - 5)).toBeLessThan(1.5);
  // the choice is saved in settings
  const snapSetting = await page.evaluate(() => fetch('/api/settings').then((r) => r.json()).then((s: { boardSnap: boolean }) => s.boardSnap));
  expect(snapSetting).toBe(false);
  await page.getByTestId('snap-toggle').click();

  // auto-arrange: 01 top-right, then leftwards (RTL), one undo step restores
  const positionsBefore = await Promise.all([0, 1, 2, 3, 4].map(async (i) => box(cards.nth(i))));
  await page.getByTestId('auto-arrange').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'رُتّبت 5 مشاهد' })).toBeVisible();
  await saved(page);
  await page.waitForTimeout(700); // FLIP animation
  const after = await Promise.all([0, 1, 2, 3, 4].map(async (i) => box(cards.nth(i))));
  expect(Math.abs(after[0].y - after[1].y)).toBeLessThan(1);
  expect(after[0].x).toBeGreaterThan(after[1].x); // 02 is left of 01
  expect(after[1].x).toBeGreaterThan(after[2].x);
  // one undo brings every card back
  await page.getByTestId('undo').click();
  await saved(page);
  await page.waitForTimeout(200);
  const undone = await Promise.all([0, 1, 2, 3, 4].map(async (i) => box(cards.nth(i))));
  undone.forEach((b, i) => {
    expect(Math.abs(b.x - positionsBefore[i].x)).toBeLessThan(1);
    expect(Math.abs(b.y - positionsBefore[i].y)).toBeLessThan(1);
  });
});
