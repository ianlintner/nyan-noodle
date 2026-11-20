import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type Phaser from 'phaser';

interface Report {
  day: number;
  customersServed: number;
  revenue: number;
  tips: number;
  profit: number;
  reputation: number;
}
interface Snapshot {
  clock: { day: number; phase: string };
  economy: { fishCoins: number; reputation: number; lifetimeEarned: number };
  stock: number;
  menu: string[];
  unlockedRecipes: string[];
  mastery: Record<string, number>;
  staff: { roster: unknown[] };
  revenueHistory: number[];
  lastReport: Report | null;
}
interface W {
  __nyan?: { registry: { get(k: string): unknown } };
  __nyanTitle?: {
    summary(): { day: number } | null;
    continueGame(): Promise<void>;
    newGame(): void;
  };
  __nyanPrep?: {
    state(): Snapshot;
    buy(n: number): void;
    toggle(id: string): void;
    price(id: string, d: number): void;
    openShop(): void;
    upgrades(): void;
  };
  __nyanShop?: { setSpeed(n: number): void; inSession(): boolean; done(): boolean };
  __nyanService?: {
    inSession(): boolean;
    select(i: number): void;
    setBrothHeat(h: number): void;
    setNoodleSweep(s: number): void;
    stopNoodles(): void;
    addToppingByIndex(i: number): void;
    serve(): void;
    tickets(): { doneness: string }[];
    required(): string[];
    qualities(): (number | null)[];
    openDoors(): void;
  };
  __nyanReport?: { report(): Report; state(): Snapshot; next(): void; upgrades(): void };
  __nyanUpgrades?: {
    state(): Snapshot;
    unlock(id: string): void;
    train(id: string): void;
    hire(): void;
    prep(): void;
  };
  __nyanSession?: {
    state: Snapshot;
    update(s: unknown): void;
  };
}

const SHOT_DIR = 'docs/daylog';

async function canvasPoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = (await page.locator('canvas').boundingBox())!;
  const k = box.width / 480;
  return { x: box.x + x * k, y: box.y + y * k };
}

async function clickNative(page: Page, x: number, y: number): Promise<void> {
  const p = await canvasPoint(page, x, y);
  await page.mouse.click(p.x, p.y);
}

const titleReady = (page: Page) =>
  page.waitForFunction(() => (window as unknown as W).__nyan?.registry.get('titleReady') === true);

/** In the kitchen (ServiceScene, session mode): optionally hand-cook ticket 0, then open. */
async function kitchen(page: Page, cookFirst: boolean): Promise<number | null> {
  await page.waitForFunction(
    () => (window as unknown as W).__nyan?.registry.get('serviceReady') === true,
  );
  expect(await page.evaluate(() => (window as unknown as W).__nyanService!.inSession())).toBe(true);
  let quality: number | null = null;
  if (cookFirst) {
    quality = await page.evaluate(() => {
      const k = (window as unknown as W).__nyanService!;
      k.select(0);
      for (let n = 0; n < 70; n++) k.setBrothHeat(n % 2 === 0 ? 0.6 : 0.7);
      const d = k.tickets()[0]!.doneness;
      k.setNoodleSweep(d === 'firm' ? 0.7 : d === 'soft' ? 0.55 : 0.62);
      k.stopNoodles();
      for (let i = 0; i < k.required().length; i++) k.addToppingByIndex(i);
      k.serve();
      return k.qualities()[0] ?? null;
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOT_DIR}/kitchen.png` });
    // Text-bounds probe: cooking-panel text (x < 160) stays inside the panel (156 x 216),
    // everything else inside the 480x270 canvas.
    const outside = await page.evaluate(() => {
      const game = (window as unknown as { __nyan: Phaser.Game }).__nyan;
      const scene = game.scene.getScene('ServiceScene');
      return scene.children.list
        .filter((o): o is Phaser.GameObjects.Text => o.type === 'Text')
        .map((t) => ({ text: t.text, b: t.getBounds() }))
        .filter(({ text, b }) => {
          if (!text) return false;
          const inCook = b.x >= 4 && b.x < 160 && b.y >= 34 && b.y < 216;
          const maxR = inCook ? 156 : 480;
          const maxB = inCook ? 216 : 270;
          return b.right > maxR || b.bottom > maxB || b.x < 0 || b.y < 0;
        })
        .map(({ text, b }) => `${text} @${b.x},${b.y},${b.right},${b.bottom}`);
    });
    expect(outside).toEqual([]);
  }
  await page.evaluate(() => (window as unknown as W).__nyanService!.openDoors());
  return quality;
}

async function playDay(page: Page, day: number): Promise<Report> {
  await page.waitForFunction(
    () => (window as unknown as W).__nyan?.registry.get('shopInSession') === true,
  );
  await page.evaluate(() => (window as unknown as W).__nyanShop!.setSpeed(16));
  await page.waitForFunction(
    (d) => (window as unknown as W).__nyanReport?.report().day === d,
    day,
    { timeout: 40_000 },
  );
  return page.evaluate(() => (window as unknown as W).__nyanReport!.report());
}

test.describe('day loop meta', () => {
  test('plays 3 days from the title screen, reloads, and the save is intact', async ({ page }) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/');
    await titleReady(page);
    expect(await page.evaluate(() => (window as unknown as W).__nyanTitle!.summary())).toBeNull();
    await page.screenshot({ path: `${SHOT_DIR}/title-fresh.png` });

    // Real mouse click on "New game" (menu panel: content x=168..300, 2nd button).
    await clickNative(page, 240, 133);
    await page.waitForFunction(
      () => (window as unknown as W).__nyan?.registry.get('prepReady') === true,
    );
    const day1 = await page.evaluate(() => (window as unknown as W).__nyanPrep!.state());
    expect(day1.clock.day).toBe(1);
    expect(day1.menu).toEqual(['shoyu']);

    // Prep: stock up and nudge the price, then screenshot the prep menu.
    await page.evaluate(() => {
      const prep = (window as unknown as W).__nyanPrep!;
      prep.buy(10);
      prep.price('shoyu', 1);
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOT_DIR}/prep.png` });

    const reports: Report[] = [];
    for (let day = 1; day <= 3; day++) {
      if (day === 1)
        await clickNative(page, 414, 253); // real click on "Open the shop!"
      else await page.evaluate(() => (window as unknown as W).__nyanPrep!.openShop());
      // Day 1: hand-cook the first ticket in the minigames; later days open straight away.
      const quality = await kitchen(page, day === 1);
      if (day === 1) expect(quality).toBeGreaterThanOrEqual(80);
      const report = await playDay(page, day);
      reports.push(report);
      expect(report.customersServed).toBeGreaterThan(0);
      if (day === 1) {
        await page.waitForTimeout(150);
        await page.screenshot({ path: `${SHOT_DIR}/report.png` });
      }
      // Autosave landed before moving on.
      await page.waitForFunction(
        (d) => (window as unknown as W).__nyan?.registry.get('savedDay') === d,
        day,
      );
      await page.evaluate(() => (window as unknown as W).__nyanReport!.next());
      await page.waitForFunction(
        () => (window as unknown as W).__nyan?.registry.get('prepReady') === true,
      );
      await page.evaluate(() => (window as unknown as W).__nyanPrep!.buy(10));
    }
    expect(reports.map((r) => r.day)).toEqual([1, 2, 3]);

    const before = await page.evaluate(() => (window as unknown as W).__nyanSession!.state);
    expect(before.clock.day).toBe(4);
    expect(before.revenueHistory).toHaveLength(3);
    expect(before.lastReport?.day).toBe(3);

    // The save really is in IndexedDB.
    const stored = await page.evaluate(
      () =>
        new Promise<string | null>((resolve, reject) => {
          const open = indexedDB.open('nyan-noodle', 1);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const get = open.result
              .transaction('kv', 'readonly')
              .objectStore('kv')
              .get('nyan-noodle/save');
            get.onsuccess = () => resolve((get.result as string | undefined) ?? null);
            get.onerror = () => reject(get.error);
          };
        }),
    );
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!).state.clock.day).toBe(4); // saved at the day-3 report, clock already rolled to day 4

    // Reload -> title offers Continue with the right summary -> state is identical.
    // (The day-4 stock purchase after the last report is not saved, so compare the saved state.)
    await page.reload();
    await titleReady(page);
    const summary = await page.evaluate(() => (window as unknown as W).__nyanTitle!.summary());
    expect(summary?.day).toBe(4);
    await page.screenshot({ path: `${SHOT_DIR}/title-continue.png` });
    await page.evaluate(() => (window as unknown as W).__nyanTitle!.continueGame());
    await page.waitForFunction(
      () => (window as unknown as W).__nyan?.registry.get('prepReady') === true,
    );
    const after = await page.evaluate(() => (window as unknown as W).__nyanPrep!.state());
    expect(after).toEqual(JSON.parse(stored!).state);
    expect(after.revenueHistory).toEqual(before.revenueHistory);
    expect(after.lastReport).toEqual(before.lastReport);
    expect(after.economy.lifetimeEarned).toBe(before.economy.lifetimeEarned);
    expect(errors).toEqual([]);
  });

  test('upgrade shop: unlock a recipe, train mastery, hire a cat; gated by stars', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/');
    await titleReady(page);
    await page.evaluate(() => (window as unknown as W).__nyanTitle!.newGame());
    await page.waitForFunction(
      () => (window as unknown as W).__nyan?.registry.get('prepReady') === true,
    );

    // Open the upgrade scene; with 0 stars every gated purchase is refused.
    await page.evaluate(() => (window as unknown as W).__nyanPrep!.upgrades());
    await page.waitForFunction(
      () => (window as unknown as W).__nyan?.registry.get('upgradesReady') === true,
    );
    await page.evaluate(() => {
      const up = (window as unknown as W).__nyanUpgrades!;
      up.unlock('tonkotsu');
      up.hire();
    });
    let s = await page.evaluate(() => (window as unknown as W).__nyanUpgrades!.state());
    expect(s.unlockedRecipes).toEqual(['shoyu']);
    expect(s.staff.roster).toHaveLength(0);

    // Earn the stars and coins, then buy.
    await page.evaluate(() => {
      const session = (window as unknown as W).__nyanSession!;
      session.update({
        ...session.state,
        economy: { ...session.state.economy, fishCoins: 900, reputation: 3 },
      });
      const up = (window as unknown as W).__nyanUpgrades!;
      up.unlock('miso');
      up.train('miso');
      up.train('shoyu');
      up.hire();
    });
    s = await page.evaluate(() => (window as unknown as W).__nyanUpgrades!.state());
    expect(s.unlockedRecipes).toEqual(['shoyu', 'miso']);
    expect(s.menu).toEqual(['shoyu', 'miso']);
    expect(s.mastery).toMatchObject({ shoyu: 1, miso: 1 });
    expect(s.staff.roster).toHaveLength(1);
    expect(s.economy.fishCoins).toBeLessThan(900);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOT_DIR}/upgrades.png` });
    expect(errors).toEqual([]);
  });
});
