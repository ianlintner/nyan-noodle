import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bypassCoach } from './coachBypass';

interface Interact {
  cats: { id: number; x: number; y: number; patience: number }[];
  pops: { id: number; x: number; y: number }[];
  collected: number[];
  greetsLeft: number;
}
interface W {
  __nyan?: { registry: { get(k: string): unknown } };
  __nyanShop?: {
    interact(): Interact | null;
    plan(): { visits: { customerId: number; patienceBeats: number }[] };
    finishDay(): void;
    setSpeed(n: number): void;
    done(): boolean;
  };
  __nyanReport?: { report(): { tips: number; revenue: number } };
}

async function openShop(page: Page, speed: number): Promise<void> {
  await bypassCoach(page);
  await page.goto(`/?scene=shop&seed=2026&tier=cart&speed=${speed}`);
  await page.waitForFunction(
    () => (window as unknown as W).__nyan?.registry.get('shopReady') === true,
  );
}

const look = (page: Page): Promise<Interact> =>
  page.evaluate(() => (window as unknown as W).__nyanShop!.interact()!);

/** Play a service at speed; with `tap`, click every coin pop that shows up (real mouse). */
async function runDay(page: Page, tap: boolean): Promise<{ tips: number; taps: number }> {
  let taps = 0;
  for (let i = 0; i < 4000; i++) {
    const done = await page.evaluate(() => (window as unknown as W).__nyanShop!.done());
    if (done) break;
    if (tap) {
      const { pops } = await look(page);
      for (const pop of pops) {
        await page.mouse.click(pop.x, pop.y);
        taps += 1;
      }
    }
    await page.waitForTimeout(40);
  }
  await page.evaluate(() => (window as unknown as W).__nyanShop!.finishDay());
  await page.waitForFunction(() => !!(window as unknown as W).__nyanReport?.report);
  const report = await page.evaluate(() => (window as unknown as W).__nyanReport!.report());
  return { tips: report.tips, taps };
}

test('clicking a waiting cat on the canvas greets it and raises its patience', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await openShop(page, 1);
  await page.waitForFunction(() => {
    const i = (window as unknown as W).__nyanShop!.interact();
    return !!i && i.cats.length > 0;
  });
  const before = await look(page);
  const cat = before.cats[0]!;
  const budget = before.greetsLeft;
  const patienceOf = (id: number): Promise<number> =>
    page.evaluate(
      (cid) =>
        (window as unknown as W).__nyanShop!.plan().visits.find((v) => v.customerId === cid)!
          .patienceBeats,
      id,
    );
  const start = await patienceOf(cat.id);
  // The cat keeps walking up the queue, so re-read its spot right before the click.
  const now = (await look(page)).cats.find((c) => c.id === cat.id)!;
  await page.mouse.click(now.x, now.y);
  await expect.poll(() => patienceOf(cat.id)).toBeGreaterThan(start);
  expect((await look(page)).greetsLeft).toBe(budget - 1);
  await page.screenshot({ path: 'docs/playable/service-greet.png' });
  expect(errors).toEqual([]);
});

test('collecting tip pops raises the day tips above a no-tap run of the same seed', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const run = async (tap: boolean): Promise<{ tips: number; taps: number }> => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await openShop(page, 4);
    const out = await runDay(page, tap);
    await page.close();
    return out;
  };
  const idle = await run(false);
  const active = await run(true);
  expect(active.taps).toBeGreaterThan(0);
  expect(active.tips).toBeGreaterThan(idle.tips);
});

test('clicks on the pause overlay do not greet the cat underneath', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openShop(page, 1);
  await page.waitForFunction(() => {
    const i = (window as unknown as W).__nyanShop!.interact();
    return !!i && i.cats.length > 0;
  });
  const before = await look(page);
  const budget = before.greetsLeft;
  await page.keyboard.press('Escape');
  // The overlay pauses the scene but Phaser input still delivers pointer events.
  await page.mouse.click(before.cats[0]!.x, before.cats[0]!.y);
  await page.keyboard.press('Escape');
  expect((await look(page)).greetsLeft).toBe(budget);
});
