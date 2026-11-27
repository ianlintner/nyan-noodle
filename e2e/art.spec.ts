import { expect, test, type Page } from '@playwright/test';
import { bypassCoach } from './coachBypass';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface UpgradeLayout {
  details: Box[];
  buttons: Box[];
  /** Staff ids with a Level button on the current page. */
  levels: number[];
}

interface ArtWindow {
  __nyan?: { registry: { get(k: string): unknown } };
  __nyanTitle?: { newGame(): void };
  __nyanPrep?: { upgrades(): void };
  __nyanUpgrades?: { layout(): UpgradeLayout };
  __nyanService?: { select(i: number): void };
  __nyanSession?: {
    state: Record<string, unknown> & {
      staff: { roster: unknown[] };
      economy: Record<string, unknown>;
    };
    update(s: unknown): void;
  };
}

/** Default to the ignored test-results tree so local runs do not dirty committed art. */
const SHOT_DIR = process.env.ART_SHOT_DIR ?? 'test-results/art';

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function expectNoOverlap(layout: UpgradeLayout): void {
  expect(layout.details.length).toBeGreaterThan(0);
  expect(layout.buttons.length).toBeGreaterThan(0);
  for (const detail of layout.details) {
    for (const button of layout.buttons) {
      expect(
        intersects(detail, button),
        `detail ${JSON.stringify(detail)} overlaps button ${JSON.stringify(button)}`,
      ).toBe(false);
    }
  }
}

/** Wait for the game loop to settle after a resize or scene start. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/** Click a native 480x270 coordinate on the scaled canvas. */
async function clickNative(page: Page, x: number, y: number): Promise<void> {
  const box = (await page.locator('canvas').boundingBox())!;
  const k = box.width / 480;
  await page.mouse.click(box.x + x * k, box.y + y * k);
}

async function startUpgrades(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(
    () => (window as unknown as ArtWindow).__nyan?.registry.get('titleReady') === true,
  );
  await page.evaluate(() => (window as unknown as ArtWindow).__nyanTitle!.newGame());
  await page.waitForFunction(
    () => (window as unknown as ArtWindow).__nyan?.registry.get('prepReady') === true,
  );
  await page.evaluate(() => (window as unknown as ArtWindow).__nyanPrep!.upgrades());
  await page.waitForFunction(
    () => (window as unknown as ArtWindow).__nyan?.registry.get('upgradesReady') === true,
  );
}

test('upgrade rows keep detail text clear of buttons at both viewports', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await bypassCoach(page);
  await startUpgrades(page);

  for (const [width, height] of [
    [1280, 720],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await settle(page);
    expectNoOverlap(
      await page.evaluate(() => (window as unknown as ArtWindow).__nyanUpgrades!.layout()),
    );
  }

  await page.setViewportSize({ width: 1280, height: 720 });
  await settle(page);
  await page.screenshot({ path: `${SHOT_DIR}/upgrades-icons.png` });
});

test('all five staff cats keep a Level button through pagination', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await bypassCoach(page);
  await page.goto('/');
  await page.waitForFunction(
    () => (window as unknown as ArtWindow).__nyan?.registry.get('titleReady') === true,
  );
  await page.evaluate(() => (window as unknown as ArtWindow).__nyanTitle!.newGame());
  await page.waitForFunction(
    () => (window as unknown as ArtWindow).__nyan?.registry.get('prepReady') === true,
  );
  // Seed the full roster before the scene starts so its first render sees all five.
  await page.evaluate(() => {
    const session = (window as unknown as ArtWindow).__nyanSession!;
    session.update({
      ...session.state,
      staff: {
        roster: [1, 2, 3, 4, 5].map((id) => ({
          id,
          name: `Cat${id}`,
          level: 1,
          wage: 20,
          stations: 1,
        })),
      },
      economy: { ...session.state.economy, fishCoins: 900, reputation: 5 },
    });
    (window as unknown as ArtWindow).__nyanPrep!.upgrades();
  });
  await page.waitForFunction(
    () => (window as unknown as ArtWindow).__nyan?.registry.get('upgradesReady') === true,
  );

  const layout = () =>
    page.evaluate(() => (window as unknown as ArtWindow).__nyanUpgrades!.layout());
  const first = await layout();
  expect(first.levels).toEqual([1, 2, 3]);
  expectNoOverlap(first);

  // Next button sits at native (405..461, 161..173) on the staff panel.
  await clickNative(page, 433, 167);
  await settle(page);
  const second = await layout();
  expect(second.levels).toEqual([4, 5]);
  expectNoOverlap(second);
  expect([...first.levels, ...second.levels].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
});

test('shop exterior and kitchen stage render with the new set dressing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 720 });
  await bypassCoach(page);

  await page.goto('/?scene=shop');
  await page.waitForFunction(
    () => (window as unknown as ArtWindow).__nyan?.registry.get('shopReady') === true,
  );
  await settle(page);
  await page.screenshot({ path: `${SHOT_DIR}/shop-exterior.png` });

  await page.goto('/?scene=service');
  await page.waitForFunction(
    () => (window as unknown as ArtWindow).__nyan?.registry.get('serviceReady') === true,
  );
  await page.evaluate(() => (window as unknown as ArtWindow).__nyanService!.select(0));
  await settle(page);
  await page.screenshot({ path: `${SHOT_DIR}/kitchen-stage.png` });
  expect(errors).toEqual([]);
});
