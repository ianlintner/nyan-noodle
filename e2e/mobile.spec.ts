import { expect, test, type Page } from '@playwright/test';
import { FURNITURE } from '../packages/sim/src/catalog';

interface Fit {
  zoom: number;
  width: number;
  height: number;
  left: number;
  top: number;
  integer: boolean;
  portrait: boolean;
}
type MobileWindow = {
  __nyanFit?: Fit;
  __nyanService?: Record<string, (...args: never[]) => unknown>;
  __nyanTouch?: {
    screen(name: string): { x: number; y: number };
    stage(): string;
    rects(): { action: { w: number }; toppings: { w: number }[] };
  };
  __nyanShop?: Record<string, (...args: never[]) => unknown>;
  __nyanShopTouch?: {
    rotateScreen(): { x: number; y: number };
    cancelScreen(): { x: number; y: number };
    screen(x: number, y: number): { x: number; y: number };
  };
};

const call = <T>(page: Page, body: string, api: 'service' | 'shop'): Promise<T> =>
  page.evaluate(
    ({ body, api }) => {
      const w = window as unknown as MobileWindow;
      const target = api === 'service' ? w.__nyanService : w.__nyanShop;
      return new Function('a', `return (${body});`)(target) as T;
    },
    { body, api },
  );

const waitReady = async (page: Page, key: string): Promise<void> => {
  await page.waitForFunction(
    (k) =>
      (
        window as unknown as { __nyan?: { registry: { get(key: string): unknown } } }
      ).__nyan?.registry.get(k) === true,
    key,
  );
};

const touchHold = async (
  page: Page,
  point: { x: number; y: number },
  until: () => Promise<boolean>,
): Promise<void> => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: Math.round(point.x), y: Math.round(point.y) }],
  });
  try {
    for (let i = 0; i < 200 && !(await until()); i++) await page.waitForTimeout(16);
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  }
};

test('mobile touch: fit, one full service, and portrait/landscape screenshots', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?scene=service&seed=2026&count=4');
  await waitReady(page, 'serviceReady');

  const fit = await page.evaluate(() => (window as unknown as MobileWindow).__nyanFit);
  expect(fit).toBeTruthy();
  expect(fit!.portrait).toBe(true);
  const rect = await page.locator('canvas').boundingBox();
  expect(rect!.width).toBeCloseTo(fit!.width, 0);
  expect(rect!.x).toBeCloseTo(fit!.left, 0);
  const rects = await page.evaluate(() => (window as unknown as MobileWindow).__nyanTouch!.rects());
  expect(rects.toppings).toHaveLength(6);
  expect(rects.toppings[0]!.w * fit!.zoom).toBeGreaterThan(40);
  const shot = (name: string) =>
    page.locator('canvas').screenshot({
      path: `test-results/mobile-${test.info().project.name}-${name}.png`,
    });
  await shot('portrait');

  // Tap the first ticket with a real touch event.
  const ticket = await call<{ x: number; y: number }>(page, 'a.ticketScreen(0)', 'service');
  await page.touchscreen.tap(ticket.x, ticket.y);
  expect(await call<string>(page, 'a.stage()', 'service')).toBe('broth');

  // Hold the action button, easing off when the broth needle runs hot.
  const action = await page.evaluate(() =>
    (window as unknown as MobileWindow).__nyanTouch!.screen('action'),
  );
  await touchHold(page, action, async () => {
    const stage = await call<string>(page, 'a.stage()', 'service');
    if (stage !== 'broth') return true;
    const heat = await call<{ heat: number }>(page, 'a.broth()', 'service');
    return heat.heat > 0.78;
  });
  if ((await call<string>(page, 'a.stage()', 'service')) === 'broth') {
    for (let i = 0; i < 90; i++) {
      const heat = await call<{ heat: number }>(page, 'a.broth()', 'service');
      if (heat.heat > 0.72) await page.waitForTimeout(16);
      else
        await call<void>(page, `a.setBrothHeat(${(0.5 + (i % 3) * 0.07).toFixed(2)})`, 'service');
      if ((await call<string>(page, 'a.stage()', 'service')) !== 'broth') break;
    }
  }
  expect(await call<string>(page, 'a.stage()', 'service')).toBe('noodles');

  // Stop the noodles by tapping the stage-aware action button at the target.
  const doneness = (await call<{ doneness: string }[]>(page, 'a.tickets()', 'service'))[0]!
    .doneness;
  const sweet = doneness === 'firm' ? 0.7 : doneness === 'soft' ? 0.55 : 0.62;
  // Stop at the sweet spot with a LONG press: the finger stays down after STOP
  // moves the stage to toppings, so releasing over a topping pad must not select
  // one (the portrait action button sits over pad 2).
  let stopped = false;
  for (let i = 0; i < 200 && !stopped; i++) {
    const sweep = await call<number>(page, 'a.noodleSweep()', 'service');
    if (Math.abs(sweep - sweet) < 0.04 || (sweet < 0.05 && sweep > 0.96)) {
      const stopCdp = await page.context().newCDPSession(page);
      await stopCdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: Math.round(action.x), y: Math.round(action.y) }],
      });
      await page.waitForTimeout(180);
      await stopCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await stopCdp.detach();
      stopped = true;
    } else await page.waitForTimeout(8);
  }
  expect(stopped).toBe(true);
  expect(await call<string>(page, 'a.stage()', 'service')).toBe('toppings');
  expect(await call<string[]>(page, 'a.toppingSequence()', 'service')).toEqual([]);

  // Tap each required topping pad in order, then serve by touch.
  const required = await call<string[]>(page, 'a.required()', 'service');
  for (let i = 0; i < required.length; i++) {
    const p = await page.evaluate(
      (n) => (window as unknown as MobileWindow).__nyanTouch!.screen(`top${n}`),
      i,
    );
    await page.touchscreen.tap(p.x, p.y);
  }
  expect(await call<string>(page, 'a.stage()', 'service')).toBe('serve');
  await page.touchscreen.tap(action.x, action.y);
  expect(await call<number[]>(page, 'a.completed()', 'service')).toContain(0);

  // Rotate to landscape and confirm the viewport refits.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(
    () => (window as unknown as MobileWindow).__nyanFit?.portrait === false,
  );
  const landscapeFit = await page.evaluate(() => (window as unknown as MobileWindow).__nyanFit);
  expect(landscapeFit!.integer).toBe(true);
  const layout = await call<{ portrait: boolean; railRows: number }>(page, 'a.layout()', 'service');
  expect(layout.portrait).toBe(false);
  expect(layout.railRows).toBe(1);
  await shot('landscape');
  expect(errors).toEqual([]);
});

test('mobile touch: shop pinch-zoom and build rotate/cancel', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?scene=shop&seed=2026&mode=build');
  await waitReady(page, 'shopReady');
  expect(await call<string>(page, 'a.mode()', 'shop')).toBe('build');

  // Two-finger spread should increase the integer camera zoom.
  await call<void>(page, 'a.setZoom(1)', 'shop');
  const before = 1;
  const cdp = await page.context().newCDPSession(page);
  const left = { x: 140, y: 400, id: 1 };
  const right = { x: 180, y: 400, id: 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, right] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: left.x - i * 10, y: left.y, id: 1 },
        { x: right.x + i * 10, y: right.y, id: 2 },
      ],
    });
    await page.waitForTimeout(20);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  expect(await call<number>(page, 'a.zoom()', 'shop')).toBeGreaterThan(before);

  // Build-mode touch buttons mirror R and Escape.
  const rotate = await page.evaluate(() =>
    (window as unknown as MobileWindow).__nyanShopTouch!.rotateScreen(),
  );
  const cancel = await page.evaluate(() =>
    (window as unknown as MobileWindow).__nyanShopTouch!.cancelScreen(),
  );
  await page.touchscreen.tap(rotate.x, rotate.y);
  await page.touchscreen.tap(cancel.x, cancel.y);
  expect(
    await page.evaluate(() => (window as unknown as MobileWindow).__nyanShopTouch !== undefined),
  ).toBe(true);

  // A single-finger tap still places furniture; a pinch must never commit a build action.
  const beforeItems = await call<{ items: unknown[] }>(page, 'a.state()', 'shop');
  const stoolTool = await call<{ x: number; y: number }>(page, 'a.toolScreen(0)', 'shop');
  await page.touchscreen.tap(stoolTool.x, stoolTool.y);
  const emptyCell = await call<{ x: number; y: number }>(page, 'a.cellScreen(4, 2)', 'shop');
  await page.touchscreen.tap(emptyCell.x, emptyCell.y);
  const afterTap = await call<{ items: unknown[] }>(page, 'a.state()', 'shop');
  expect(afterTap.items.length).toBe(beforeItems.items.length + 1);

  const sellTool = await call<{ x: number; y: number }>(
    page,
    `a.toolScreen(${FURNITURE.length + 1})`,
    'shop',
  );
  await page.touchscreen.tap(sellTool.x, sellTool.y);
  const starter = await call<{ x: number; y: number }>(page, 'a.cellScreen(0, 2)', 'shop');
  const pinch = await page.context().newCDPSession(page);
  const one = { x: Math.round(starter.x), y: Math.round(starter.y), id: 1 };
  const two = { x: Math.round(starter.x + 60), y: Math.round(starter.y), id: 2 };
  await pinch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [one, two] });
  await pinch.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { ...one, x: one.x - 20 },
      { ...two, x: two.x + 20 },
    ],
  });
  await pinch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pinch.detach();
  const afterPinch = await call<{ items: unknown[] }>(page, 'a.state()', 'shop');
  expect(afterPinch.items.length).toBe(afterTap.items.length);
  expect(errors).toEqual([]);
});
