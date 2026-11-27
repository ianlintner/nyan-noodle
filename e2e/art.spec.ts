import { expect, test, type Page } from '@playwright/test';
import { bypassCoach } from './coachBypass';

interface NativeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface StageArt {
  stage: NativeBox & { text: string };
  status: NativeBox & { text: string };
  pot: NativeBox;
  basket: NativeBox;
  header: (NativeBox & { text: string }) | null;
  ticketNames: (NativeBox & { text: string })[];
}

interface UpgradeLayout {
  panels: Box[];
  titles: Box[];
  /** Rendered title strings, so e2e can prove a seeded level is actually on screen. */
  labels: string[];
  details: Box[];
  buttons: Box[];
  next?: Box;
  /** Staff ids with a Level button on the current page. */
  levels: number[];
}

interface ArtWindow {
  __nyan?: { registry: { get(k: string): unknown } };
  __nyanTitle?: { newGame(): void };
  __nyanPrep?: { upgrades(): void };
  __nyanUpgrades?: { layout(): UpgradeLayout };
  __nyanService?: {
    select(i: number): void;
    layout(): { cooking: Box; rail: Box };
    stageArt(): StageArt;
  };
  __nyanWorld?: {
    exterior(): readonly (NativeBox & { frame: string })[];
  };
  __nyanSession?: {
    state: Record<string, unknown> & {
      staff: { roster: unknown[] };
      equipment: Record<string, number>;
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

function intersectsNative(a: NativeBox, b: NativeBox): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function insidePanel(inner: NativeBox, outer: Box): boolean {
  return (
    inner.x >= outer.x - 1 &&
    inner.y >= outer.y - 1 &&
    inner.x + inner.width <= outer.x + outer.w + 1 &&
    inner.y + inner.height <= outer.y + outer.h + 1
  );
}

/** Every row label/detail must stay inside the panel it was drawn in. */
function expectInsidePanels(layout: UpgradeLayout): void {
  expect(layout.panels.length).toBeGreaterThan(0);
  for (const text of [...layout.titles, ...layout.details]) {
    const panel = layout.panels.find(
      (p) => text.x >= p.x && text.x < p.x + p.w && text.y >= p.y && text.y < p.y + p.h,
    );
    expect(panel, `text ${JSON.stringify(text)} is outside every panel`).toBeTruthy();
    if (!panel) continue;
    expect(
      text.x + text.w <= panel.x + panel.w - 2,
      `text ${JSON.stringify(text)} overflows panel ${JSON.stringify(panel)}`,
    ).toBe(true);
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
    const layout = await page.evaluate(() =>
      (window as unknown as ArtWindow).__nyanUpgrades!.layout(),
    );
    expectNoOverlap(layout);
    expectInsidePanels(layout);
  }

  await page.setViewportSize({ width: 1280, height: 720 });
  await settle(page);
  await page.screenshot({ path: `${SHOT_DIR}/upgrades-icons.png` });
});

test('upgraded equipment titles stay inside their panel at both viewports', async ({ page }) => {
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
  // Seed before the scene starts so the longest title (Signboard L1) is actually rendered.
  await page.evaluate(() => {
    const session = (window as unknown as ArtWindow).__nyanSession!;
    session.update({
      ...session.state,
      equipment: { knives: 1, burner: 2, signboard: 1 },
      economy: { ...session.state.economy, fishCoins: 900, reputation: 5 },
    });
    (window as unknown as ArtWindow).__nyanPrep!.upgrades();
  });
  await page.waitForFunction(
    () => (window as unknown as ArtWindow).__nyan?.registry.get('upgradesReady') === true,
  );

  for (const [width, height] of [
    [1280, 720],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await settle(page);
    const layout = await page.evaluate(() =>
      (window as unknown as ArtWindow).__nyanUpgrades!.layout(),
    );
    expect(layout.labels).toContain('Sharp Knives L1 ★1.5');
    expect(layout.labels).toContain('Big Burner L2 ★3.5');
    expect(layout.labels).toContain('Neon Signboard L1 ★2.5');
    expectNoOverlap(layout);
    expectInsidePanels(layout);
  }
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
  expectInsidePanels(first);
  expect(first.next).toBeTruthy();

  const next = first.next!;
  await clickNative(page, next.x + next.w / 2, next.y + next.h / 2);
  await settle(page);
  const second = await layout();
  expect(second.levels).toEqual([4, 5]);
  expectNoOverlap(second);
  expectInsidePanels(second);
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
  const exterior = await page.evaluate(() =>
    (window as unknown as ArtWindow).__nyanWorld!.exterior(),
  );
  expect(exterior.length).toBeGreaterThan(20);
  const frames = new Set(exterior.map((d) => d.frame));
  for (const frame of ['tile/floor_stone', 'furniture/noren', 'furniture/lantern']) {
    expect(frames.has(frame), `shop exterior is missing ${frame}`).toBe(true);
  }

  await page.goto('/?scene=service');
  await page.waitForFunction(
    () => (window as unknown as ArtWindow).__nyan?.registry.get('serviceReady') === true,
  );
  await page.evaluate(() => (window as unknown as ArtWindow).__nyanService!.select(0));
  await settle(page);
  await page.screenshot({ path: `${SHOT_DIR}/kitchen-stage.png` });
  const art = await page.evaluate(() => (window as unknown as ArtWindow).__nyanService!.stageArt());
  const serviceLayout = await page.evaluate(() =>
    (window as unknown as ArtWindow).__nyanService!.layout(),
  );
  for (const [name, box] of [
    ['stage text', art.stage],
    ['status text', art.status],
    ['pot sprite', art.pot],
    ['basket sprite', art.basket],
  ] as const) {
    expect(insidePanel(box, serviceLayout.cooking), `${name} outside the cooking panel`).toBe(true);
  }
  expect(art.pot.width).toBeGreaterThanOrEqual(24);
  expect(art.basket.height).toBeGreaterThanOrEqual(24);
  expect(art.ticketNames.length).toBeGreaterThan(0);
  for (const name of art.ticketNames) {
    expect(insidePanel(name, serviceLayout.rail), `ticket name "${name.text}" outside rail`).toBe(
      true,
    );
    if (art.header) {
      expect(
        intersectsNative(art.header, name),
        `Cooking header covers ticket name "${name.text}"`,
      ).toBe(false);
    }
  }
  expect(errors).toEqual([]);
});
