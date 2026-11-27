import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { autopilotPrep, autopilotRun, createSimState } from '../packages/sim/src/index';
import type { SimState } from '../packages/sim/src/index';
import { bypassCoach } from './coachBypass';

/**
 * Goal ladder + Grand Opening: play real day 1 through the UI, see the finished goals paid on
 * the Report and ticked on Prep, then force the top tier to 5 stars and walk through the
 * milestone screen. Screenshots land in docs/playable/ (desktop project only).
 */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface W {
  __nyan?: { registry: { get(k: string): unknown } };
  __nyanTitle?: { newGame(): void };
  __nyanPrep?: { openShop(): void; refresh(): void };
  __nyanService?: { openDoors(): void };
  __nyanShop?: { setSpeed(n: number): void };
  __nyanReport?: {
    next(): void;
    upgrades(): void;
    report(): { goalsCompleted: { id: string; coins: number }[] };
    layout(): { panel: Box; lines: (Box & { text: string })[] };
  };
  __nyanGoals?: {
    current(): { def: { id: string }; done: boolean }[];
    completed(): string[];
    next(): string | null;
    opening(): string;
    forceGrandOpening(): string;
  };
  __nyanMilestone?: { stats(): { days: number; bowlsServed: number }; keepPlaying(): void };
  __nyanUpgrades?: { prep(): void };
  __nyanSession?: { state: SimState; update(s: SimState): void };
}

const SHOTS = 'docs/playable';
const flag = (page: Page, key: string, value: unknown = true) =>
  page.waitForFunction(
    ([k, v]) => (window as unknown as W).__nyan?.registry.get(k as string) === v,
    [key, value] as const,
    { timeout: 40_000 },
  );
const state = (page: Page): Promise<SimState> =>
  page.evaluate(() => (window as unknown as W).__nyanSession!.state);
const settleGoals = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
const shot = async (page: Page, info: TestInfo, name: string, w = 1280, h = 720) => {
  if (info.project.name !== 'chromium') return;
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

/** New game, then day 1 with the reference autopilot's prep; ends on the Report scene. */
async function playDayOne(page: Page): Promise<SimState> {
  await bypassCoach(page);
  await page.goto('/');
  await flag(page, 'titleReady');
  await page.evaluate(() => (window as unknown as W).__nyanTitle!.newGame());
  await flag(page, 'prepReady');
  const prepared = autopilotPrep(await state(page));
  await page.evaluate((s) => (window as unknown as W).__nyanSession!.update(s), prepared);
  await page.evaluate(() => (window as unknown as W).__nyanPrep!.openShop());
  await flag(page, 'serviceReady');
  await page.evaluate(() => (window as unknown as W).__nyanService!.openDoors());
  await flag(page, 'shopInSession');
  await page.evaluate(() => (window as unknown as W).__nyanShop!.setSpeed(24));
  await page.waitForFunction(
    () => (window as unknown as W).__nyanSession!.state.lastReport?.day === 1,
    undefined,
    { timeout: 60_000 },
  );
  await flag(page, 'reportReady');
  return state(page);
}

test('a finished goal is paid on the Report, ticked on Prep and the Grand Opening plays once', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`${e.stack ?? e}`));

  const day1 = await playDayOne(page);
  // Same decisions + no hand-cooking => the browser pays exactly what the headless sim pays.
  const expected = autopilotRun(createSimState(day1.seed, 'cart'), 1)[0]!;
  const paid = await page.evaluate(() => (window as unknown as W).__nyanReport!.report());
  expect(paid.goalsCompleted.length).toBeGreaterThan(0);
  expect(paid.goalsCompleted).toEqual(expected.lastReport!.goalsCompleted);
  expect(day1.goals.completed).toEqual(paid.goalsCompleted.map((g) => g.id));
  expect(day1.economy).toEqual(expected.economy);
  await shot(page, info, 'report-goal-complete');

  // Every goal line must sit inside the Takings panel, not under its bottom border.
  const reportLayout = await page.evaluate(() => (window as unknown as W).__nyanReport!.layout());
  expect(reportLayout.lines.length).toBeGreaterThan(0);
  for (const line of reportLayout.lines) {
    expect(
      line.y + line.height <= reportLayout.panel.y + reportLayout.panel.height,
      `goal line "${line.text}" ends below the panel`,
    ).toBe(true);
  }

  // Prep shows the same goals ticked off.
  await page.evaluate(() => (window as unknown as W).__nyanReport!.next());
  await flag(page, 'prepReady');
  const rows = await page.evaluate(() => (window as unknown as W).__nyanGoals!.current());
  expect(rows).toHaveLength(3);
  expect(day1.tierId).toBe('cart');
  expect(rows.filter((r) => r.done).map((r) => r.def.id)).toEqual(
    paid.goalsCompleted.map((g) => g.id),
  );
  await shot(page, info, 'prep-goals');
  await shot(page, info, 'prep-goals-390', 390, 844);
  await page.setViewportSize({ width: 1280, height: 720 });

  // All Cart goals are done: the panel must still tell the player what to do next.
  // Day 1 only pays part of the ladder, so seed the finished tier for this capture.
  const beforeNext = await state(page);
  await page.evaluate(() => {
    const session = (window as unknown as W).__nyanSession!;
    const s = session.state;
    session.update({
      ...s,
      goals: {
        ...s.goals,
        completed: (window as unknown as W).__nyanGoals!.current().map((r) => r.def.id),
      },
    });
    (window as unknown as W).__nyanPrep!.refresh();
  });
  await settleGoals(page);
  const next = await page.evaluate(() => (window as unknown as W).__nyanGoals!.next());
  expect(next).toContain('Next:');
  expect(next).toContain('in Build');
  await shot(page, info, 'prep-next-tier');
  await page.evaluate((s) => {
    (window as unknown as W).__nyanSession!.update(s);
    (window as unknown as W).__nyanPrep!.refresh();
  }, beforeNext);

  // Back on a Report, arm the Grand Opening: Next goes to the milestone, not Prep.
  await page.evaluate(() => (window as unknown as W).__nyanPrep!.openShop());
  await flag(page, 'serviceReady');
  await page.evaluate(() => (window as unknown as W).__nyanService!.openDoors());
  await flag(page, 'shopInSession');
  await page.evaluate(() => (window as unknown as W).__nyanShop!.setSpeed(24));
  await page.waitForFunction(
    () => (window as unknown as W).__nyanSession!.state.lastReport?.day === 2,
    undefined,
    { timeout: 60_000 },
  );
  await flag(page, 'reportReady');
  expect(await page.evaluate(() => (window as unknown as W).__nyanGoals!.forceGrandOpening())).toBe(
    'pending',
  );
  // Report -> Upgrades -> Back used to enter Prep directly and skip a pending celebration.
  await page.evaluate(() => (window as unknown as W).__nyanReport!.upgrades());
  await flag(page, 'upgradesReady');
  await page.evaluate(() => (window as unknown as W).__nyanUpgrades!.prep());
  await flag(page, 'milestoneReady');
  const stats = await page.evaluate(() => (window as unknown as W).__nyanMilestone!.stats());
  expect(stats.days).toBe(2);
  expect(stats.bowlsServed).toBeGreaterThan(0);
  await shot(page, info, 'milestone');

  await page.evaluate(() => (window as unknown as W).__nyanMilestone!.keepPlaying());
  await flag(page, 'prepReady');
  expect(await page.evaluate(() => (window as unknown as W).__nyanGoals!.opening())).toBe('seen');
  expect((await state(page)).tierId).toBe('grand-hall');
  expect(errors).toEqual([]);
});
