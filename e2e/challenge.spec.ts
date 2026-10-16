import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

/**
 * «تحدي العشرين إطاراً» end to end (UPDATE-2 §7), on the laptop and the phone:
 * start → prep → card 1 → the journal step by step → lock → open early → draw → postpone →
 * burn → your journey. Secrecy is checked all along: no undrawn card's text ever reaches the page.
 *
 * Test names and failure messages never contain card text.
 */

// both projects share one local database: each test starts the challenge from scratch
test.beforeEach(() => {
  execSync(`npx wrangler d1 execute DB --local --persist-to .wrangler/e2e --command "DELETE FROM challenge_days; DELETE FROM challenge_runs;"`, { stdio: 'ignore' });
});

const deck = JSON.parse(readFileSync('updates/update-2/data/challenge-deck.json', 'utf8')) as {
  stages: Record<string, { label: string }>;
  days: { day: number; title: string; hook: string; idea: string }[];
};
// a title that is also a public word (a stage name, or a screen named in the brief) is not a secret
const stageNames = Object.values(deck.stages).map((s) => s.label);
const brief = readFileSync('updates/update-2/UPDATE-2.md', 'utf8');
const secretsOf = (id: number) => {
  const c = deck.days.find((d) => d.day === id)!;
  return [c.hook, c.idea, ...(stageNames.includes(c.title) || brief.includes(c.title) ? [] : [c.title])];
};

/** Fails (without printing the text) if any undrawn card's text is on the page or in a script. */
async function noLeak(page: Page, drawn: number[], scripts: string[]) {
  const html = await page.content();
  const all = html + scripts.join('\n');
  const leaked = deck.days.filter((d) => !drawn.includes(d.day)).filter((d) => secretsOf(d.day).some((t) => all.includes(t))).map((d) => d.day);
  expect(leaked, 'undrawn card text found').toEqual([]);
}

async function drawnIds(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    const r = await fetch('/api/challenge');
    const s = (await r.json()) as { days: { cardId: number }[] };
    return s.days.map((d) => d.cardId);
  });
}

async function openHome(page: Page) {
  await expect(page.getByTestId('ch-home')).toBeVisible();
}

test('the challenge: start, prep, day 1, journal, lock, early open, postpone, burn, journey', async ({ page }) => {
  test.setTimeout(180_000);
  const scripts: string[] = [];
  page.on('response', async (r) => {
    if (r.request().resourceType() === 'script') scripts.push(await r.text().catch(() => ''));
  });
  await login(page);
  await openHome(page);
  await expect(page.getByTestId('ch-home-btn')).toHaveText('ابدأ التحدي');
  await noLeak(page, [], scripts);

  // ---- prep: a checklist that is saved ----
  await page.getByTestId('ch-home-btn').click();
  await expect(page.getByTestId('ch-card')).toBeVisible();
  const items = page.getByTestId('ch-setup-item');
  await expect(items.first()).toBeVisible();
  await items.nth(0).click();
  await items.nth(2).click();
  await expect(items.nth(0)).toHaveAttribute('data-checked', '1');
  await page.waitForTimeout(1500);
  await page.reload();
  await openHome(page);
  await expect(page.getByTestId('ch-home-btn')).toHaveText('افتح بطاقة اليوم');
  await page.getByTestId('ch-home-btn').click();
  await expect(page.getByTestId('ch-setup-item').nth(0)).toHaveAttribute('data-checked', '1');
  await expect(page.getByTestId('ch-setup-item').nth(1)).toHaveAttribute('data-checked', '0');
  await expect(page.getByTestId('ch-setup-item').nth(2)).toHaveAttribute('data-checked', '1');
  // no back side on prep, no postpone/burn
  await expect(page.getByTestId('ch-flip')).toHaveCount(0);
  await page.getByTestId('ch-prep-done').click();
  await openHome(page);

  // ---- card 1: available at once after prep (no lock) ----
  await expect(page.getByTestId('ch-home-btn')).toHaveText('اسحب بطاقة اليوم');
  await page.getByTestId('ch-home-btn').click();
  await expect(page.getByTestId('ch-draw')).toBeVisible();
  await expect(page.getByTestId('ch-left')).toHaveText('بطاقة واحدة باقية');
  await page.getByTestId('ch-draw-btn').click();
  await expect(page.getByTestId('ch-face')).toBeVisible();
  await noLeak(page, await drawnIds(page), scripts);
  // the back is not there before «أنهيت»
  await expect(page.getByTestId('ch-back')).toHaveCount(0);
  await page.getByTestId('ch-flip').click();
  await expect(page.getByTestId('ch-back')).toBeVisible();
  await page.getByTestId('ch-log-day').click();

  // ---- the journal, one question per screen ----
  const j = page.getByTestId('ch-journal');
  await expect(j).toHaveAttribute('data-step', '0');
  await page.getByTestId('ch-bts-item').nth(0).click();
  // voice memo from the fake microphone: record, stop, listen, it is saved
  await page.getByTestId('ch-voice-rec').click();
  await expect(page.getByTestId('ch-voice')).toHaveAttribute('data-state', 'rec');
  await page.waitForTimeout(1500);
  await page.getByTestId('ch-voice-stop').click();
  await expect(page.getByTestId('ch-voice')).toHaveAttribute('data-state', 'saved', { timeout: 15_000 });
  await expect(page.getByTestId('ch-bts-item').nth(2)).toHaveAttribute('data-checked', '1');
  await page.getByTestId('ch-voice-play').click();
  // a BTS photo
  await page.getByTestId('ch-bts-pics-input').setInputFiles({ name: 'bts.png', mimeType: 'image/png', buffer: await pngBuffer(page) });
  await expect(page.getByTestId('ch-bts-pics-img')).toHaveCount(1, { timeout: 15_000 });
  await page.getByTestId('ch-next').click();
  await expect(j).toHaveAttribute('data-step', '1');
  await page.getByTestId('ch-a-worked').fill('الضوء الجانبي اشتغل');
  await page.getByTestId('ch-next').click();
  await page.getByTestId('ch-skip').click(); // «وش اللي ما نجح؟» skipped
  await expect(j).toHaveAttribute('data-step', '3');
  await page.getByTestId('ch-a-regret').fill('لقطة الظل على الجدار');
  await expect(page.getByTestId('ch-send-regret')).toBeVisible(); // on by default
  await page.getByTestId('ch-next').click();
  await page.getByTestId('ch-a-tomorrow').fill('أبدأ قبل الغروب بساعة');
  await page.getByTestId('ch-next').click();
  await expect(j).toHaveAttribute('data-step', '5');
  // 3 of 5 answered: worked, regret, tomorrow
  await expect(page.getByTestId('ch-answers')).toContainText('جاوبت 3');
  await page.getByTestId('ch-film').fill('https://vimeo.com/123');
  await page.getByTestId('ch-stills-input').setInputFiles({ name: 'still.png', mimeType: 'image/png', buffer: await pngBuffer(page) });
  await expect(page.getByTestId('ch-stills-img')).toHaveCount(1, { timeout: 15_000 });
  await page.getByTestId('ch-journal-done').click();
  await openHome(page);

  // ---- the regret went to the ideas box ----
  if ((page.viewportSize()?.width ?? 0) < 760) {
    await page.getByTestId('m-tab-ideas').click();
    await expect(page.getByText('لقطة الظل على الجدار').first()).toBeVisible();
    await page.getByTestId('m-tab-home').click();
  } else {
    await expect(page.getByTestId('ideas-box').getByText('لقطة الظل على الجدار').first()).toBeVisible();
  }

  // ---- locked until midnight; «أحتاج أفتحها اليوم» ----
  await expect(page.getByTestId('ch-home-btn')).toContainText('بطاقة بكرة');
  await expect(page.getByTestId('ch-home-btn')).toBeDisabled();
  await page.getByTestId('ch-override').first().click();
  await expect(page.getByTestId('ch-draw')).toBeVisible();
  await page.getByTestId('ch-draw-btn').click();
  await expect(page.getByTestId('ch-face')).toBeVisible();
  // yesterday's decision on top of today's card
  await expect(page.getByTestId('ch-yesterday')).toContainText('أبدأ قبل الغروب بساعة');
  const overrode = await page.evaluate(async () => {
    const s = (await (await fetch('/api/challenge')).json()) as { days: { state: string; overrode: boolean }[] };
    return s.days.find((d) => d.state === 'drawn')!.overrode;
  });
  expect(overrode).toBe(true);
  let drawn = await drawnIds(page);
  await noLeak(page, drawn, scripts);

  // ---- postpone: another card at once ----
  await page.getByTestId('ch-card-more').click();
  await page.getByTestId('ch-postpone').click();
  await expect.poll(async () => (await drawnIds(page)).length).toBe(drawn.length + 1);
  await expect(page.getByTestId('ch-menu')).toHaveCount(0);
  await expect(page.getByTestId('ch-face')).toBeVisible();
  drawn = await drawnIds(page);
  await noLeak(page, drawn, scripts);

  // ---- burn, with a reason ----
  await page.getByTestId('ch-card-more').click();
  await page.getByTestId('ch-burn').click();
  await page.getByTestId('ch-burn-reason').fill('ما فيه وقت اليوم');
  await page.getByTestId('ch-burn-ok').click();
  await openHome(page);

  // ---- your journey ----
  await page.getByTestId('ch-home-count').click();
  await expect(page.getByTestId('ch-journey')).toBeVisible();
  await expect(page.getByTestId('ch-done-count')).toHaveText('1');
  await expect(page.getByTestId('ch-done-line')).toHaveText('من 20 · محروقة 1');
  const frames = page.getByTestId('ch-frame');
  await expect(frames).toHaveCount(20);
  await expect(frames.nth(0)).toHaveAttribute('data-state', 'done');
  await expect(frames.nth(1)).toHaveAttribute('data-state', 'burned');
  await expect(frames.nth(2)).toHaveAttribute('data-state', 'current');
  // coming frames: the number and «···», no title, no requirement icon
  const coming = page.locator('[data-testid=ch-frame][data-state=coming]');
  await expect(coming).toHaveCount(17);
  for (const t of await coming.allTextContents()) expect(t).toMatch(/^\d{1,2}···$/);
  expect(await coming.locator('svg').count()).toBe(0);
  await noLeak(page, drawn, scripts);
  // the log and the ten rules
  await page.getByTestId('ch-open-log').click();
  await expect(page.getByTestId('ch-log-row')).toHaveCount(2);
  await page.getByTestId('ch-close').click();
  await page.getByTestId('ch-open-rules').click();
  await expect(page.getByTestId('ch-rules').locator('li')).toHaveCount(10);
  // a finished day opens its card and journal (editable later)
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('ch-rules')).toHaveCount(0);
  await frames.nth(0).click();
  await expect(page.getByTestId('ch-face')).toBeVisible();
  await page.getByTestId('ch-flip').click();
  await page.getByTestId('ch-log-day').click();
  await page.getByTestId('ch-next').click();
  await expect(page.getByTestId('ch-a-worked')).toHaveValue('الضوء الجانبي اشتغل');
});

test('the journal refuses «سجّل اليوم» under 3 answers', async ({ page }) => {
  await login(page);
  await openHome(page);
  await page.getByTestId('ch-home-btn').click();
  await page.getByTestId('ch-prep-done').click();
  await page.getByTestId('ch-home-btn').click();
  await page.getByTestId('ch-draw-btn').click();
  await page.getByTestId('ch-flip').click();
  await page.getByTestId('ch-log-day').click();
  await page.getByTestId('ch-next').click();
  await page.getByTestId('ch-a-worked').fill('شي');
  for (let i = 0; i < 4; i++) await page.getByTestId('ch-skip').click().catch(() => {});
  await expect(page.getByTestId('ch-journal')).toHaveAttribute('data-step', '5');
  await expect(page.getByTestId('ch-journal-done')).toBeDisabled();
  await page.getByTestId('ch-folder-copy').click();
  await page.getByTestId('ch-film').fill('https://youtu.be/x');
  await expect(page.getByTestId('ch-answers')).toContainText('جاوبت 2'); // film link and folder count once
  await expect(page.getByTestId('ch-journal-done')).toBeDisabled();
});

/** A small real PNG made in the page. */
async function pngBuffer(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const cv = document.createElement('canvas');
    cv.width = 320;
    cv.height = 180;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#c27a32';
    g.fillRect(0, 0, 320, 180);
    return cv.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(b64, 'base64');
}

test('phone: the back gesture closes the focus screens one by one', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 760, 'phone only');
  await login(page);
  await openHome(page);
  await page.getByTestId('ch-home-btn').click();
  await page.getByTestId('ch-prep-done').click();
  await page.getByTestId('ch-home-count').click();
  await expect(page.getByTestId('ch-journey')).toBeVisible();
  await page.getByTestId('ch-open-rules').click();
  await expect(page.getByTestId('ch-rules')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('ch-rules')).toHaveCount(0);
  await expect(page.getByTestId('ch-journey')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('ch-layer')).toHaveCount(0);
  await expect(page.getByTestId('ch-home')).toBeVisible();
});
