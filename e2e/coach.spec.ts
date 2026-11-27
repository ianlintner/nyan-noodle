import { expect, test, type Page, type TestInfo } from '@playwright/test';

/**
 * First-run coaching: a fresh settings slot shows one callout per scene, and every coached
 * screen exposes a "?" with keyboard/touch controls. Phaser text lives on the canvas, so the
 * assertions read the small read-only debug snapshot instead of DOM selectors.
 */
interface Snapshot {
  seen: string[];
  open: 'callout' | 'help' | null;
  id: string | null;
  text: string | null;
}
interface W {
  __nyan?: { registry: { get(key: string): unknown } };
  __nyanTitle?: { newGame(): void; continueGame(): Promise<void> };
  __nyanPrep?: { openShop(): void };
  __nyanService?: { openDoors(): void };
  __nyanShop?: { setSpeed(n: number): void };
  __nyanReport?: { upgrades(): void };
  __nyanSession?: { state: { lastReport?: { day: number } | null } };
  __nyanCoach?: { snapshot(): Snapshot; flush(): Promise<void>; reset(): Promise<void> };
}

test.use({ viewport: { width: 1280, height: 720 } });

const flag = (page: Page, key: string) =>
  page.waitForFunction((k) => (window as unknown as W).__nyan?.registry.get(k) === true, key, {
    timeout: 40_000,
  });
const snapshot = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => (window as unknown as W).__nyanCoach!.snapshot());

/** Native 480x270 coordinates -> real mouse click on the scaled canvas. */
async function clickNative(page: Page, x: number, y: number): Promise<void> {
  const box = (await page.locator('canvas').boundingBox())!;
  const k = box.width / 480;
  await page.mouse.click(box.x + x * k, box.y + y * k);
}

const shot = async (page: Page, info: TestInfo, name: string) => {
  if (info.project.name !== 'chromium') return;
  await page.waitForTimeout(150);
  await page.screenshot({ path: `docs/playable/${name}.png` });
};

test('a new save sees the Prep callout once and not after a reload', async ({ page }, info) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await flag(page, 'titleReady');
  await page.evaluate(() => (window as unknown as W).__nyanTitle!.newGame());
  await flag(page, 'prepReady');

  await expect.poll(() => snapshot(page)).toMatchObject({ open: 'callout', id: 'prep' });
  expect((await snapshot(page)).text).toContain('Open the shop');
  await shot(page, info, 'coach-prep');

  // Any tap away dismisses the callout without blocking the controls underneath.
  await clickNative(page, 240, 180);
  await expect.poll(() => snapshot(page)).toMatchObject({ open: null, id: null });
  await page.evaluate(() => (window as unknown as W).__nyanCoach!.flush());

  await page.reload();
  await flag(page, 'titleReady');
  await page.evaluate(() => (window as unknown as W).__nyanTitle!.continueGame());
  await flag(page, 'prepReady');
  await page.waitForTimeout(250);
  const after = await snapshot(page);
  expect(after.seen).toContain('prep');
  expect(after.open).toBeNull();
  expect(errors).toEqual([]);
});

test('? opens help on Prep, Kitchen, Shop, Report, Upgrades and Build', async ({ page }, info) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const openHelp = async (id: string, x: number, y: number, capture?: string) => {
    await clickNative(page, x, y);
    await expect.poll(() => snapshot(page)).toMatchObject({ open: 'help', id });
    const text = (await snapshot(page)).text ?? '';
    expect(text).toContain('KEYS');
    expect(text.length).toBeGreaterThan(20);
    if (capture) await shot(page, info, capture);
    await clickNative(page, x, y);
    await expect.poll(() => snapshot(page)).toMatchObject({ open: null, id: null });
  };

  await page.goto('/');
  await flag(page, 'titleReady');
  await page.evaluate(() => (window as unknown as W).__nyanTitle!.newGame());
  await flag(page, 'prepReady');
  await openHelp('prep', 242, 12);
  // The keyboard shortcut must work with no overlay open (callout already dismissed).
  await page.keyboard.press('h');
  await expect.poll(() => snapshot(page)).toMatchObject({ open: 'help', id: 'prep' });
  await page.waitForTimeout(200); // Phaser drains DOM key events once per frame
  await page.keyboard.press('h');
  await expect.poll(() => snapshot(page)).toMatchObject({ open: null });

  await page.evaluate(() => (window as unknown as W).__nyanPrep!.openShop());
  await flag(page, 'serviceReady');
  await openHelp('kitchen', 15, 235, 'help-kitchen');

  await page.evaluate(() => (window as unknown as W).__nyanService!.openDoors());
  await flag(page, 'shopInSession');
  await openHelp('shop', 242, 12);

  await page.evaluate(() => (window as unknown as W).__nyanShop!.setSpeed(24));
  await page.waitForFunction(
    () => (window as unknown as W).__nyanSession!.state.lastReport?.day === 1,
    undefined,
    { timeout: 60_000 },
  );
  await flag(page, 'reportReady');
  await openHelp('report', 10, 10);

  await page.evaluate(() => (window as unknown as W).__nyanReport!.upgrades());
  await flag(page, 'upgradesReady');
  await openHelp('upgrades', 242, 12);

  const build = await page.context().newPage();
  await build.goto('/?scene=shop&mode=build');
  await build.waitForFunction(
    () => (window as unknown as W).__nyan?.registry.get('shopReady') === true,
    undefined,
    { timeout: 40_000 },
  );
  const box = (await build.locator('canvas').boundingBox())!;
  const k = box.width / 480;
  await build.mouse.click(box.x + 242 * k, box.y + 12 * k);
  await expect
    .poll(() => build.evaluate(() => (window as unknown as W).__nyanCoach!.snapshot()))
    .toMatchObject({ open: 'help', id: 'build' });
  // Shop/Build use a zoomed world camera plus a HUD camera: overlay objects must be hidden
  // from the world camera or they are drawn twice (once transformed on top of the map).
  const doubled = await build.evaluate(() => {
    const game = (window as unknown as { __nyan: { scene: { getScene(k: string): unknown } } })
      .__nyan;
    const scene = game.scene.getScene('ShopScene') as {
      children: { list: { depth: number; cameraFilter: number }[] };
      cameras: { main: { id: number } };
    };
    const overlay = scene.children.list.filter((o) => o.depth === 950 || o.depth === 951);
    const drawnByWorld = overlay.filter((o) => (o.cameraFilter & scene.cameras.main.id) === 0);
    return { overlay: overlay.length, drawnByWorld: drawnByWorld.length };
  });
  expect(doubled.overlay).toBeGreaterThan(3);
  expect(doubled.drawnByWorld).toBe(0);
  await shot(build, info, 'help-build');
  await build.close();

  expect(errors).toEqual([]);
});
