import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

/**
 * Challenge phase B (UPDATE-2 §5, §4.7): sun times, the two linked cards, quick idea from the
 * card, the mirror, a new run and the archive. Run states are written straight into the test
 * database (the draw itself is random and covered by challenge.spec.ts and the server tests).
 */

const sql = (q: string) => execSync(`npx wrangler d1 execute DB --local --persist-to .wrangler/e2e --command ${JSON.stringify(q)}`, { stdio: 'ignore' });
test.beforeEach(() => sql('DELETE FROM challenge_days; DELETE FROM challenge_runs;'));

const deck = JSON.parse(readFileSync('updates/update-2/data/challenge-deck.json', 'utf8')) as { days: { day: number; stageId: string; double?: number; planning?: boolean; executionOf?: number }[]; sequence: { stagesInOrder: string[] } };
const planning = deck.days.find((d) => d.planning)!.day;
const execution = deck.days.find((d) => d.executionOf != null)!.day;
const byStage = (st: string) => deck.days.filter((d) => d.stageId === st).map((d) => d.day);

const DAY = 86_400_000;
/** A run where `order` (card numbers) are finished days 0…n−1; optionally one more drawn. */
function seedRun(order: number[], open?: number, status = 'active') {
  const now = Date.now();
  const t0 = now - 40 * DAY;
  const rows = order.map((c, i) => {
    const done = t0 + i * DAY;
    const j = JSON.stringify({ worked: `يوم ${i}`, tomorrow: i % 2 ? `قرار ${i}` : '' }).replace(/'/g, "''");
    return `('d${i}', 'owner', 'run1', ${c}, ${i}, 'done', ${done - 3600_000}, ${done}, '${j}', '[true,true,false,false,true]', 'https://vimeo.com/${i}', ${done}, ${done})`;
  });
  if (open != null) rows.push(`('d${order.length}', 'owner', 'run1', ${open}, ${order.length}, 'drawn', ${now - 60_000}, NULL, '{}', '[false,false,false,false,false]', '', ${now}, ${now})`);
  sql(
    `INSERT INTO challenge_runs (id, owner_id, status, deck_version, started_at, finished_at, burn_used, created_at, updated_at) VALUES ('run1', 'owner', '${status}', 1, ${t0}, ${status === 'done' ? now - DAY : 'NULL'}, 0, ${t0}, ${now});` +
      `INSERT INTO challenge_days (id, owner_id, run_id, card_id, seq, state, drawn_at, completed_at, journal, bts, film_url, created_at, updated_at) VALUES ${rows.join(',')};`,
  );
}
/** Every day before the stage that holds the linked pair (read from the file, not assumed). */
const pairStage = deck.days.find((d) => d.day === planning)!.stageId;
const order = deck.sequence.stagesInOrder;
const beforePair = () => [0, 1, ...order.slice(0, order.indexOf(pairStage)).flatMap(byStage)];
const afterPair = () => order.slice(order.indexOf(pairStage) + 1).flatMap(byStage);

async function home(page: Page) {
  await login(page);
  await expect(page.getByTestId('ch-home')).toBeVisible();
}

test('sun times on a time-bound card, «استخدم موقعي», and «فكرة سريعة» from ⋯', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 21.4858, longitude: 39.1925 }); // Jeddah
  seedRun([0], 1); // card 1 (time-bound) open
  await home(page);
  await page.getByTestId('ch-home-btn').click();
  await expect(page.getByTestId('ch-sun')).toBeVisible();
  await expect(page.getByTestId('ch-place')).toHaveText('الرياض');
  for (const id of ['ch-sunrise', 'ch-sunset']) await expect(page.getByTestId(id)).toHaveText(/^\d{1,2}:\d{2}[صم]$/);
  // golden hours: from sunrise to 40 min after, and from 40 min before sunset to sunset
  await expect(page.getByTestId('ch-golden-am')).toHaveText(/^\d{1,2}:\d{2}ص–\d{1,2}:\d{2}ص$/);
  await expect(page.getByTestId('ch-golden')).toHaveText(/^\d{1,2}:\d{2}م–\d{1,2}:\d{2}م$/);
  expect((await page.getByTestId('ch-golden-am').textContent())!.startsWith((await page.getByTestId('ch-sunrise').textContent())!)).toBe(true);
  expect((await page.getByTestId('ch-golden').textContent())!.endsWith((await page.getByTestId('ch-sunset').textContent())!)).toBe(true);
  const riyadhSunset = await page.getByTestId('ch-sunset').textContent();
  await page.getByTestId('ch-use-location').click();
  await expect(page.getByTestId('ch-place')).toHaveText('موقعي');
  // Jeddah is ~30 minutes west of Riyadh: the sunset moves later
  await expect(page.getByTestId('ch-sunset')).not.toHaveText(riyadhSunset!);
  // quick idea opens the idea sheet over the card, without closing it
  await page.getByTestId('ch-card-more').click();
  await page.getByTestId('ch-quick-idea').click();
  await expect(page.getByTestId('add-sheet')).toBeVisible();
  await page.keyboard.type('فكرة من وسط البطاقة');
  await page.getByRole('button', { name: /احفظ/ }).click();
  await expect(page.getByTestId('add-sheet')).toHaveCount(0);
  await expect(page.getByTestId('ch-face')).toBeVisible();
});

test('the planning card makes a project; its pair shows the live commitment and keeps it', async ({ page }) => {
  seedRun(beforePair(), planning);
  await home(page);
  await page.getByTestId('ch-home-btn').click();
  await page.getByTestId('ch-plan-open').click();
  await page.getByTestId('ch-plan-new').click();
  await expect(page.getByTestId('ch-layer')).toHaveCount(0);
  // the new project opens: named after the day, empty
  const projectId = await page.evaluate(async () => {
    const s = (await (await fetch('/api/challenge')).json()) as { days: { state: string; projectId: string | null }[] };
    return s.days.find((d) => d.state === 'drawn')!.projectId!;
  });
  expect(projectId).toBeTruthy();
  const p = await page.evaluate(async (id) => (await (await fetch(`/api/projects/${id}`)).json()) as { project: { name: string; aspect: string; stage: string } }, projectId);
  expect(p.project).toMatchObject({ name: `التحدي — اليوم ${beforePair().length}`, aspect: '16:9', stage: 'prep' });
  // plan 4 shots, 3 of them shot or approved
  await page.evaluate(async (pid) => {
    const ops: unknown[] = [{ op: 'create', entity: 'scenes', id: 'sc-ch', fields: { projectId: pid, name: 'م' } }];
    ['shot', 'approved', 'shot', 'planned'].forEach((status, i) => ops.push({ op: 'create', entity: 'shots', id: `sh-ch${i}`, fields: { projectId: pid, sceneId: 'sc-ch', status } }));
    await fetch('/api/ops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops }) });
  }, projectId);
  // the planning day is finished (yesterday) and its pair is drawn
  const n = beforePair().length;
  sql(`UPDATE challenge_days SET state = 'done', completed_at = ${Date.now() - DAY} WHERE id = 'd${n}';` +
    `INSERT INTO challenge_days (id, owner_id, run_id, card_id, seq, state, drawn_at, created_at, updated_at) VALUES ('dx', 'owner', 'run1', ${execution}, ${n + 1}, 'drawn', ${Date.now()}, ${Date.now()}, ${Date.now()});`);
  await page.goto('/');
  await expect(page.getByTestId('ch-home')).toBeVisible();
  await page.getByTestId('ch-home-btn').click();
  await expect(page.getByTestId('ch-commitment')).toContainText('75%');
  await expect(page.getByTestId('ch-commitment')).toContainText('3 من 4');
  // shown in the film step and saved on the day
  await page.getByTestId('ch-flip').click();
  await page.getByTestId('ch-log-day').click();
  for (let i = 0; i < 5; i++) await page.getByTestId('ch-skip').click();
  await expect(page.getByTestId('ch-journal').getByTestId('ch-commitment')).toContainText('75%');
  await expect.poll(async () => page.evaluate(async () => {
    const s = (await (await fetch('/api/challenge')).json()) as { days: { state: string; commitment: unknown }[] };
    return s.days.find((d) => d.state === 'drawn')!.commitment;
  })).toEqual({ shot: 3, total: 4 });
  // «افتح الستوري بورد»
  await page.getByTestId('ch-close').click();
  await page.getByTestId('ch-exec-open').click();
  await expect(page.getByTestId('ch-layer')).toHaveCount(0);
});

test('without a planning project the pair shows nothing about it', async ({ page }) => {
  const order = [...beforePair(), planning];
  seedRun(order, execution);
  await home(page);
  await page.getByTestId('ch-home-btn').click();
  await expect(page.getByTestId('ch-face')).toBeVisible();
  await expect(page.getByTestId('ch-exec')).toHaveCount(0);
});

test('the mirror after the last card, then «دورة جديدة» and the archive', async ({ page }) => {
  const rest = byStage(pairStage).filter((c) => c !== planning && c !== execution);
  seedRun([...beforePair(), planning, execution, ...rest, ...afterPair(), 20], undefined, 'done');
  await home(page);
  await expect(page.getByTestId('ch-home-btn')).toHaveText('المرآة');
  await page.getByTestId('ch-home-btn').click();
  await expect(page.getByTestId('ch-mirror')).toBeVisible();
  await expect(page.getByTestId('ch-mirror-done')).toHaveText('20');
  await expect(page.getByTestId('ch-mirror-bts')).toHaveText('60%');
  await expect(page.getByTestId('ch-mirror-decisions')).toHaveText('10');
  await expect(page.getByTestId('ch-mirror-film')).toHaveCount(2);
  await expect(page.getByTestId('ch-compare')).toBeVisible();
  await page.getByTestId('ch-new-run').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('ch-setup-item').first()).toBeVisible();
  await page.getByTestId('ch-close').click();
  await expect(page.getByTestId('ch-home-btn')).toHaveText('افتح بطاقة اليوم');
  await page.getByTestId('ch-home-count').click();
  await page.getByTestId('ch-open-archive').click();
  await page.getByTestId('ch-archive-run').click();
  await expect(page.locator('[data-testid=ch-frame][data-state=done]')).toHaveCount(20);
  await page.getByTestId('ch-open-mirror').click();
  await expect(page.getByTestId('ch-mirror-done')).toHaveText('20');
  await expect(page.getByTestId('ch-new-run')).toHaveCount(0);
});
