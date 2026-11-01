import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { login, shot, smallTargets } from './helpers';

/** Update 4, phase B: the free board by finger on the phone (UPDATE-4 ب). Real touches through the DevTools protocol. */
test.describe.configure({ mode: 'serial' });
test.skip(({ viewport }) => (viewport?.width ?? 9999) > 500, 'phone only');

const NAME = 'لوحة الجوال';

async function seed(page: Page, id: string, name: string, extra = 0) {
  await page.evaluate(async ([pid, nm, ex]) => {
    const ops: unknown[] = [
      { op: 'create', entity: 'projects', id: pid, fields: { name: nm, aspect: '16:9' } },
      { op: 'create', entity: 'scenes', id: `${pid}-s1`, fields: { projectId: pid, position: 1, name: 'الوصول', boardX: 40, boardY: 40 } },
      { op: 'create', entity: 'scenes', id: `${pid}-s2`, fields: { projectId: pid, position: 2, name: 'المقابلة', boardX: 400, boardY: 60 } },
      { op: 'create', entity: 'notes', id: `${pid}-n1`, fields: { projectId: pid, text: 'فكرة الإضاءة' } },
      { op: 'create', entity: 'notes', id: `${pid}-n2`, fields: { projectId: pid, text: 'ملاحظة ثانية' } },
      { op: 'create', entity: 'boardCards', id: `${pid}-c1`, fields: { projectId: pid, kind: 'note', refId: `${pid}-n1`, x: 60, y: 360, z: 1 } },
      { op: 'create', entity: 'boardCards', id: `${pid}-c2`, fields: { projectId: pid, kind: 'note', refId: `${pid}-n2`, x: 420, y: 380, z: 2 } },
    ];
    for (let i = 0; i < (ex as number); i++) {
      ops.push({ op: 'create', entity: 'notes', id: `${pid}-x${i}`, fields: { projectId: pid, text: `ملاحظة ${i}` } });
      ops.push({ op: 'create', entity: 'boardCards', id: `${pid}-xc${i}`, fields: { projectId: pid, kind: 'note', refId: `${pid}-x${i}`, x: 40 + (i % 10) * 260, y: 700 + Math.floor(i / 10) * 200, z: 3 + i } });
    }
    const r = await fetch('/api/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops }) });
    if (!r.ok) throw new Error(await r.text());
  }, [id, name, extra] as const);
}
const cards = (page: Page, pid: string) => page.evaluate(async (id) => {
  const s = (await fetch(`/api/projects/${id}`).then((r) => r.json())) as { rows: { boardCards: { id: string; x: number; y: number; w: number | null; deletedAt: number | null }[]; scenes: { id: string; boardX: number; boardY: number }[] } };
  return { cards: s.rows.boardCards.filter((c) => !c.deletedAt), scenes: s.rows.scenes };
}, pid);

async function openBoard(page: Page, name: string) {
  await page.goto('/');
  await page.getByText(name, { exact: true }).first().click();
  await expect(page.getByTestId('m-scenes')).toBeVisible();
  await page.getByText('لوحة الأفكار', { exact: true }).first().click();
  await expect(page.getByTestId('board')).toBeVisible();
  await page.waitForTimeout(500); // the first fit
}

/** A finger (or two) through the DevTools protocol: what a real phone sends. */
function fingers(cdp: CDPSession) {
  const down = new Map<number, { x: number; y: number }>();
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd') => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [...down.entries()].map(([id, p]) => ({ x: p.x, y: p.y, id })) });
  return {
    start: async (id: number, x: number, y: number) => { down.set(id, { x, y }); await send('touchStart'); },
    move: async (id: number, x: number, y: number) => { down.set(id, { x, y }); await send('touchMove'); },
    end: async () => { down.clear(); await send('touchEnd'); },
    drag: async (x: number, y: number, dx: number, dy: number, steps = 8) => {
      down.set(1, { x, y });
      await send('touchStart');
      for (let i = 1; i <= steps; i++) { down.set(1, { x: x + (dx * i) / steps, y: y + (dy * i) / steps }); await send('touchMove'); }
      down.clear();
      await send('touchEnd');
    },
    tap: async (x: number, y: number) => { down.set(1, { x, y }); await send('touchStart'); down.clear(); await send('touchEnd'); },
  };
}
const centre = async (page: Page, sel: string) => {
  const b = (await page.locator(sel).first().boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
};
const view = (page: Page) => page.evaluate(() => (document.querySelector('[data-testid=world]') as HTMLElement).style.transform);

test('phone: the «لوحة الأفكار» tab — drag an item, pan, tap selects, handles, add, multi-select, long-press menu, pinch', async ({ page }) => {
  await login(page);
  await seed(page, 'pj-u4b', NAME);
  await openBoard(page, NAME);
  const cdp = await page.context().newCDPSession(page);
  const f = fingers(cdp);
  await expect(page.locator('[data-testid=card-note]')).toHaveCount(2);
  await expect(page.getByTestId('scene-card')).toHaveCount(2);
  await shot(page, 'u4b-board');

  // one finger on an item drags it; it lands on the grid
  const before = (await cards(page, 'pj-u4b')).cards.find((c) => c.id === 'pj-u4b-c1')!;
  const n1 = await centre(page, '[data-item-id="pj-u4b-c1"]');
  await f.drag(n1.x, n1.y, 60, -70);
  await expect.poll(async () => (await cards(page, 'pj-u4b')).cards.find((c) => c.id === 'pj-u4b-c1')!.y, { timeout: 8000 }).not.toBe(before.y);
  const after = (await cards(page, 'pj-u4b')).cards.find((c) => c.id === 'pj-u4b-c1')!;
  expect(after.x).not.toBe(before.x);
  // a drag doesn't open the item
  await expect(page.getByTestId('editor')).toHaveCount(0);

  // a tap selects (and doesn't open); the bar for the selection shows
  const n2 = await centre(page, '[data-item-id="pj-u4b-c2"]');
  await f.tap(n2.x, n2.y);
  await expect(page.getByTestId('m-board-selbar')).toBeVisible();
  await expect(page.getByTestId('m-board-count')).toHaveCount(0); // one item: no counter
  await expect(page.getByTestId('editor')).toHaveCount(0);

  // the handles are outside the item, and their touch area is at least 44×44
  const hb = (await page.locator('[data-testid=handle-e]').boundingBox())!;
  expect(hb.width).toBeGreaterThanOrEqual(43.5);
  expect(hb.height).toBeGreaterThanOrEqual(43.5);
  const item = (await page.locator('[data-item-id="pj-u4b-c2"]').boundingBox())!;
  expect(hb.x).toBeGreaterThanOrEqual(item.x + item.width - 2); // starts at the edge, reaches outward
  const w0 = item.width;
  await f.drag(hb.x + 22, hb.y + 22, 50, 0);
  await expect.poll(async () => (await cards(page, 'pj-u4b')).cards.find((c) => c.id === 'pj-u4b-c2')!.w, { timeout: 8000 }).not.toBeNull();
  expect((await page.locator('[data-item-id="pj-u4b-c2"]').boundingBox())!.width).toBeGreaterThan(w0 + 20);

  // one finger on the empty board pans it (no marquee, selection cleared)
  const v0 = await view(page);
  await f.drag(200, 250, 40, 30);
  expect(await view(page)).not.toBe(v0);
  await expect(page.getByTestId('m-board-selbar')).toHaveCount(0);

  // two fingers zoom
  const bb = (await page.getByTestId('board').boundingBox())!;
  const mx = bb.x + bb.width / 2, my = bb.y + bb.height / 2 - 60;
  const z0 = await view(page);
  await f.start(1, mx - 30, my);
  await f.start(2, mx + 30, my);
  for (let i = 1; i <= 6; i++) { await f.move(1, mx - 30 - i * 12, my); await f.move(2, mx + 30 + i * 12, my); }
  await f.end();
  expect(await view(page)).not.toBe(z0);

  // «+ عنصر» adds a note in the middle; one more undo step takes it back
  await page.getByTestId('m-board-fit').click();
  await page.waitForTimeout(300);
  const nCards = (await cards(page, 'pj-u4b')).cards.length;
  await page.getByTestId('m-board-add').click();
  await expect(page.getByTestId('m-board-add-sheet')).toBeVisible();
  expect(await smallTargets(page, '[data-testid=m-board-add-sheet]'), 'add sheet').toEqual([]);
  await page.getByTestId('m-board-add-heading').click();
  await expect.poll(async () => (await cards(page, 'pj-u4b')).cards.length, { timeout: 8000 }).toBe(nCards + 1);
  await page.getByTestId('m-board-undo').click();
  await expect.poll(async () => (await cards(page, 'pj-u4b')).cards.length, { timeout: 8000 }).toBe(nCards);
  await page.getByTestId('m-board-redo').click();
  await expect.poll(async () => (await cards(page, 'pj-u4b')).cards.length, { timeout: 8000 }).toBe(nCards + 1);

  // multi-select: «تحديد», tap two items, align the tops
  await page.keyboard.press('Escape'); // the new heading is being named: leave that first
  await page.getByTestId('m-board-fit').click();
  await page.waitForTimeout(300);
  await page.getByTestId('m-board-select').click();
  const a = await centre(page, '[data-item-id="pj-u4b-c1"]');
  await f.tap(a.x, a.y);
  const b = await centre(page, '[data-item-id="pj-u4b-c2"]');
  await f.tap(b.x, b.y);
  await expect(page.getByTestId('m-board-count')).toHaveText('2');
  expect(await smallTargets(page, '[data-testid=m-board-selbar]'), 'selection bar').toEqual([]);
  await shot(page, 'u4b-multi');
  await page.getByTestId('m-board-align').click();
  await page.getByTestId('m-align-top').click();
  await expect.poll(async () => { const c = (await cards(page, 'pj-u4b')).cards; return c.find((x) => x.id === 'pj-u4b-c1')!.y === c.find((x) => x.id === 'pj-u4b-c2')!.y; }, { timeout: 8000 }).toBe(true);
  await page.getByTestId('m-board-select').click(); // back to single mode

  // dragging keeps the magnet: the guide line shows while an item lines up with another (here: the tops are already equal)
  await page.getByTestId('m-board-fit').click();
  await page.waitForTimeout(300);
  const g1 = await centre(page, '[data-item-id="pj-u4b-c1"]');
  await f.start(1, g1.x, g1.y);
  for (let i = 1; i <= 4; i++) await f.move(1, g1.x - i * 5, g1.y);
  await expect(page.getByTestId('guide').first()).toBeAttached();
  await f.end();

  // the ⋯ sheet: auto-arrange, magnet, zoom — all 44px to tap
  await page.getByTestId('m-board-more').click();
  await expect(page.getByTestId('m-board-more-sheet')).toBeVisible();
  expect(await smallTargets(page, '[data-testid=m-board-more-sheet]'), 'more sheet').toEqual([]);
  await page.getByTestId('m-board-snap').click();
  await expect(page.getByTestId('m-board-snap')).toContainText('متوقفة');
  await page.getByTestId('m-board-snap').click();
  await expect(page.getByTestId('m-board-snap')).toContainText('تعمل');
  await page.getByTestId('m-board-arrange').click();
  await expect(page.getByTestId('toast')).toContainText(/ترتّب|مرتّبة/);
  expect(await smallTargets(page, '[data-testid=m-board-selbar]'), 'selection bar').toEqual([]);

  // long press on an item opens the same menu as the laptop's right click
  await page.keyboard.press('Escape');
  const lp = await centre(page, '[data-item-id="pj-u4b-c2"]');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: lp.x, y: lp.y, id: 1 }] });
  await page.waitForTimeout(800);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByTestId('item-menu')).toBeVisible();
  await expect(page.getByTestId('item-menu').getByTestId('m-delete')).toBeVisible();
  expect(await smallTargets(page, '[data-testid=item-menu]'), 'item menu').toEqual([]);
  await page.keyboard.press('Escape');

  // the page behind doesn't scroll while the board is edited
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test('phone: 100 items stay smooth (CPU 4× slower)', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  await seed(page, 'pj-u4bp', 'لوحة كبيرة', 100);
  await openBoard(page, 'لوحة كبيرة');
  await expect(page.locator('[data-testid=card-note]')).toHaveCount(102);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const f = fingers(cdp);
  const measure = async (label: string, act: () => Promise<void>) => {
    await page.evaluate(() => { const w = window as unknown as { __f: number[]; __run: boolean }; w.__f = []; let last = performance.now(); const tick = (t: number) => { w.__f.push(t - last); last = t; if (w.__run) requestAnimationFrame(tick); }; w.__run = true; requestAnimationFrame(tick); });
    await act();
    const fr: number[] = await page.evaluate(() => { const w = window as unknown as { __f: number[]; __run: boolean }; w.__run = false; return w.__f.slice(1); });
    fr.sort((x, y) => x - y);
    const p50 = fr[Math.floor(fr.length * 0.5)], p95 = fr[Math.floor(fr.length * 0.95)];
    console.log('PERF', label, 'frames', fr.length, 'p50', p50?.toFixed(1), 'p95', p95?.toFixed(1), 'max', fr.at(-1)?.toFixed(1));
    return { p50, p95 };
  };
  const bb = (await page.getByTestId('board').boundingBox())!;
  const pan = await measure('pan', async () => { const x = bb.x + 30, y = bb.y + 20; await f.drag(x, y, 120, 90, 30); });
  const el = await centre(page, '[data-item-id="pj-u4bp-c1"]');
  const move = await measure('drag item', async () => { await f.drag(el.x, el.y, 80, 60, 30); });
  // 60 fps = 16.7 ms a frame. The strict check runs on a production build (PW_PROD=1): the dev build draws slower
  const prod = !!process.env.PW_PROD;
  for (const m of [pan, move]) {
    expect(m.p50).toBeLessThan(20);
    expect(m.p95).toBeLessThan(prod ? 34 : 120);
  }
});
