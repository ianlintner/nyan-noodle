import { expect, test } from '@playwright/test';
import { bypassCoach } from './coachBypass';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ArtWindow {
  __nyan?: { registry: { get(k: string): unknown } };
  __nyanTitle?: { newGame(): void };
  __nyanPrep?: { upgrades(): void };
  __nyanUpgrades?: {
    layout(): { details: Box[]; buttons: Box[] };
  };
  __nyanService?: { select(i: number): void };
}

const SHOT_DIR = 'docs/playable';

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

test('upgrade rows keep detail text clear of buttons at both viewports', async ({ page }) => {
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
  await page.evaluate(() => (window as unknown as ArtWindow).__nyanPrep!.upgrades());
  await page.waitForFunction(
    () => (window as unknown as ArtWindow).__nyan?.registry.get('upgradesReady') === true,
  );

  for (const [width, height] of [
    [1280, 720],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120);
    const boxes = await page.evaluate(() =>
      (window as unknown as ArtWindow).__nyanUpgrades!.layout(),
    );
    expect(boxes.details.length).toBeGreaterThan(0);
    expect(boxes.buttons.length).toBeGreaterThan(0);
    for (const detail of boxes.details) {
      for (const button of boxes.buttons) {
        expect(
          intersects(detail, button),
          `detail ${JSON.stringify(detail)} overlaps button ${JSON.stringify(button)}`,
        ).toBe(false);
      }
    }
  }

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${SHOT_DIR}/upgrades-icons.png` });
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
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/shop-exterior.png` });

  await page.goto('/?scene=service');
  await page.waitForFunction(
    () => (window as unknown as ArtWindow).__nyan?.registry.get('serviceReady') === true,
  );
  await page.evaluate(() => (window as unknown as ArtWindow).__nyanService!.select(0));
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/kitchen-stage.png` });
  expect(errors).toEqual([]);
});
