import { expect, test, type Page } from '@playwright/test';

const SHOT_DIR = 'docs/playable';

async function clickNative(page: Page, x: number, y: number): Promise<void> {
  const box = (await page.locator('canvas').boundingBox())!;
  const k = box.width / 480;
  await page.mouse.click(box.x + x * k, box.y + y * k);
}

const ready = (page: Page, key: string) =>
  page.waitForFunction(
    (k) =>
      (
        window as unknown as { __nyan: { registry: { get(k: string): unknown } } }
      ).__nyan.registry.get(k) === true,
    key,
  );

type BrokeSnapshot = {
  stock: number;
  coins: number;
  pantryDay: number;
  day: number;
  offer: boolean;
};

const snapshot = (page: Page): Promise<BrokeSnapshot> =>
  page.evaluate(`(() => {
    const s = window.__nyanPrep.state();
    return {
      stock: s.stock,
      coins: s.economy.fishCoins,
      pantryDay: s.pantryDay,
      day: s.clock.day,
      offer: window.__nyanPrep.offer(),
    };
  })()`) as Promise<BrokeSnapshot>;

test('a broke, empty pantry can still open the shop with the neighbour lifeline', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page, 'titleReady');
  // Real click on "New game" (menu panel: content x=168..300, 2nd button).
  await clickNative(page, 240, 133);
  await ready(page, 'prepReady');
  await page.evaluate('window.__nyanPrep.forceBroke()');

  expect(await snapshot(page)).toMatchObject({ stock: 0, coins: 0, offer: true });

  // The old dead-end message must not let the player through.
  await clickNative(page, 414, 253);
  expect(await page.evaluate('window.__nyan.registry.get("serviceReady") === true')).toBe(false);

  await page.screenshot({ path: `${SHOT_DIR}/pantry-offer.png` });

  // The pantry button sits at native (308,129), 150x16; click its real canvas centre.
  await clickNative(page, 383, 137);
  const after = await snapshot(page);
  expect(after).toMatchObject({ stock: 5, coins: 0, pantryDay: after.day, offer: false });
  await page.screenshot({ path: `${SHOT_DIR}/pantry-taken.png` });

  await clickNative(page, 414, 253);
  await ready(page, 'serviceReady');
  expect(await page.evaluate('window.__nyanService.inSession()')).toBe(true);
});
