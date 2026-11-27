import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { autopilotPrep, autopilotRun, createSimState } from '../packages/sim/src/index';
import type { SimState } from '../packages/sim/src/index';
import { bypassCoach } from './coachBypass';

/**
 * MVP integration playthrough: the real game (title -> prep -> kitchen -> shop service ->
 * report, autosave) is driven for 8 days, with the reference autopilot making the prep
 * decisions in Node. Because nobody hand-cooks, the browser run must match the headless
 * sim day for day, and it must reach Stall and Small Shop on the balance schedule.
 */
interface W {
  __nyan?: { registry: { get(k: string): unknown } };
  __nyanTitle?: { newGame(): void };
  __nyanPrep?: { openShop(): void };
  __nyanService?: { openDoors(): void; inSession(): boolean };
  __nyanShop?: { setSpeed(n: number): void; done(): boolean };
  __nyanReport?: { next(): void };
  __nyanSession?: { state: SimState; update(s: SimState): void };
}

const DAYS = 8;
const SEED_DIR = 'docs/mvp';
const flag = (page: Page, key: string, value: unknown = true) =>
  page.waitForFunction(
    ([k, v]) => (window as unknown as W).__nyan?.registry.get(k as string) === v,
    [key, value] as const,
    { timeout: 40_000 },
  );
const session = (page: Page): Promise<SimState> =>
  page.evaluate(() => (window as unknown as W).__nyanSession!.state);

test('8-day playthrough matches the headless sim and climbs Cart -> Stall -> Small Shop', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await bypassCoach(page);
  await page.goto('/');
  await flag(page, 'titleReady');
  await page.screenshot({ path: `${SEED_DIR}/01-title.png` });
  await page.evaluate(() => (window as unknown as W).__nyanTitle!.newGame());
  await flag(page, 'prepReady');

  const seed = (await session(page)).seed;
  const expected = autopilotRun(createSimState(seed, 'cart'), DAYS);
  const tiers: string[] = [];
  const shot = new Set<string>();

  for (let day = 1; day <= DAYS; day++) {
    const prepared = autopilotPrep(await session(page));
    await page.evaluate((s) => (window as unknown as W).__nyanSession!.update(s), prepared);
    if (day === 1) await page.screenshot({ path: `${SEED_DIR}/02-prep.png` });
    await page.evaluate(() => (window as unknown as W).__nyanPrep!.openShop());
    await flag(page, 'serviceReady');
    if (day === 1) await page.screenshot({ path: `${SEED_DIR}/03-kitchen.png` });
    await page.evaluate(() => (window as unknown as W).__nyanService!.openDoors());
    await flag(page, 'shopInSession');
    if (!shot.has(prepared.tierId)) {
      // Mid-service view of each tier the first time it opens (slow, so cats are seated).
      shot.add(prepared.tierId);
      await page.evaluate(() => (window as unknown as W).__nyanShop!.setSpeed(4));
      await page.waitForTimeout(2500);
      expect(await page.evaluate(() => (window as unknown as W).__nyanShop!.done())).toBe(false);
      await page.screenshot({ path: `${SEED_DIR}/04-service-${prepared.tierId}.png` });
    }
    await page.evaluate(() => (window as unknown as W).__nyanShop!.setSpeed(24));
    await page.waitForFunction(
      (d) => {
        const s = (window as unknown as W).__nyanSession!.state;
        return s.lastReport?.day === d;
      },
      day,
      { timeout: 60_000 },
    );
    await flag(page, 'savedDay', day);
    const now = await session(page);
    tiers.push(now.tierId);
    // Same decisions + no hand-cooking => identical to the headless sim.
    expect(now.lastReport).toEqual(expected[day - 1]!.lastReport);
    expect(now.economy).toEqual(expected[day - 1]!.economy);
    if (day === DAYS) await page.screenshot({ path: `${SEED_DIR}/05-report.png` });
    await page.evaluate(() => (window as unknown as W).__nyanReport!.next());
    await flag(page, 'prepReady');
  }

  expect(tiers.indexOf('stall') + 1).toBeLessThanOrEqual(4);
  const shopDay = tiers.indexOf('small-shop') + 1;
  expect(shopDay).toBeGreaterThanOrEqual(6);
  expect(shopDay).toBeLessThanOrEqual(8);
  expect(errors).toEqual([]);
});
