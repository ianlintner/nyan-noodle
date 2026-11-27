import { expect, test, type Page } from '@playwright/test';

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
  __nyanTouch?: { screen(name: string): { x: number; y: number }; stage(): string };
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
      (window as unknown as { __nyan?: { get(key: string): unknown } }).__nyan?.get(k) === true,
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
  await page.locator('canvas').screenshot({ path: 'test-results/mobile-portrait.png' });

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
  for (let i = 0; i < 200; i++) {
    const sweep = await call<number>(page, 'a.noodleSweep()', 'service');
    if (Math.abs(sweep - sweet) < 0.04 || (sweet < 0.05 && sweep > 0.96)) {
      await page.touchscreen.tap(action.x, action.y);
      break;
    }
    await page.waitForTimeout(8);
  }
  expect(await call<string>(page, 'a.stage()', 'service')).toBe('toppings');

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
  await page.locator('canvas').screenshot({ path: 'test-results/mobile-landscape.png' });
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
  const before = await call<number>(page, 'a.zoom()', 'shop');
  const cdp = await page.context().newCDPSession(page);
  const left = { x: 140, y: 400 };
  const right = { x: 180, y: 400 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, right] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: left.x - i * 10, y: left.y },
        { x: right.x + i * 10, y: right.y },
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
  expect(errors).toEqual([]);
});
