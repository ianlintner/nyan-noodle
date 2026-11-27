import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getTier } from '../packages/sim/src/shop';
import { FURNITURE } from '../packages/sim/src/catalog';

interface Pt {
  x: number;
  y: number;
}
interface Item {
  id: number;
  kind: string;
  x: number;
  y: number;
  rot: number;
}
interface State {
  tierId: string;
  items: Item[];
  economy: { fishCoins: number; reputation: number };
}
interface Snap {
  id: number;
  phase: string;
  x: number;
  y: number;
  seat: number | null;
}
interface ShopApi {
  mode(): string;
  state(): State;
  message(): string;
  layoutSize(): { cols: number; rows: number };
  cellScreen(x: number, y: number): Pt;
  toolScreen(index: number): Pt;
  toggleScreen(): Pt;
  customers(): Snap[];
  counts(): { seated: number; served: number; lost: number; present: number };
  plan(): { seats: number; visits: { outcome: string; seatIndex: number | null }[] };
  done(): boolean;
}
type ShopWindow = { __nyanShop?: ShopApi; __nyan?: { registry: { get(k: string): unknown } } };

/** Catalog button order in the build panel. */
const TOOL = {
  stool: 0,
  table: 1,
  counter: 2,
  stove: 3,
  lantern: 4,
  plant: 5,
  // Action buttons follow the furniture catalog (order is FURNITURE, then move/sell/rotate/upgrade).
  move: FURNITURE.length,
  sell: FURNITURE.length + 1,
  rotate: FURNITURE.length + 2,
};
const UPGRADE = FURNITURE.length + 3;

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/?scene=shop&${query}`);
  await page.waitForFunction(
    () => (window as unknown as ShopWindow).__nyan?.registry.get('shopReady') === true,
  );
}

const api = <T>(page: Page, fn: (a: ShopApi) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__nyanShop)`) as Promise<T>;

async function clickTool(page: Page, index: number): Promise<void> {
  const pt = (await page.evaluate(`window.__nyanShop.toolScreen(${index})`)) as Pt;
  await page.mouse.click(pt.x, pt.y);
}

async function clickCell(page: Page, x: number, y: number): Promise<void> {
  const pt = (await page.evaluate(`window.__nyanShop.cellScreen(${x}, ${y})`)) as Pt;
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.click(pt.x, pt.y);
}

async function runServiceToEnd(page: Page): Promise<Snap[]> {
  const seatedSnaps: Snap[] = [];
  for (let i = 0; i < 900; i++) {
    const customers = await api(page, (a) => a.customers());
    seatedSnaps.push(...customers.filter((c) => c.phase === 'seated'));
    if (await api(page, (a) => a.done())) break;
    await page.waitForTimeout(100);
  }
  expect(await api(page, (a) => a.done())).toBe(true);
  return seatedSnaps;
}

test('builds a stool and serves a customer there', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await open(page, 'mode=build&seed=2026&speed=8&tier=cart');
  expect(await api(page, (a) => a.mode())).toBe('build');
  const shoot = (name: string): Promise<Buffer> =>
    page.locator('canvas').screenshot({ path: `test-results/build-${name}.png` });
  await shoot('start');

  // Sell both starter stools (refund 50% of 20 each).
  await clickTool(page, TOOL.sell);
  await clickCell(page, 0, 2);
  await clickCell(page, 2, 2);
  let state = await api(page, (a) => a.state());
  expect(state.items.filter((i) => i.kind === 'stool')).toHaveLength(0);
  expect(state.economy.fishCoins).toBe(40 + 10 + 10);

  // The doorway tile is protected: an invalid placement is refused and costs nothing.
  await clickTool(page, TOOL.stool);
  await clickCell(page, 2, 3);
  expect(await api(page, (a) => a.message())).toBe('Keep the doorway clear');
  state = await api(page, (a) => a.state());
  expect(state.items.filter((i) => i.kind === 'stool')).toHaveLength(0);
  expect(state.economy.fishCoins).toBe(60);

  // Hover shows the ghost; a valid click buys the stool.
  const target = await api(page, (a) => a.cellScreen(3, 2));
  await page.mouse.move(target.x, target.y);
  await shoot('ghost-valid');
  await page.mouse.click(target.x, target.y);
  state = await api(page, (a) => a.state());
  const stools = state.items.filter((i) => i.kind === 'stool');
  expect(stools).toHaveLength(1);
  expect(stools[0]).toMatchObject({ x: 3, y: 2 });
  expect(state.economy.fishCoins).toBe(40);
  await shoot('placed');

  // Rotate with R, then reopen: the new stool is the only seat in the shop.
  await clickTool(page, TOOL.move);
  await clickCell(page, 3, 2); // pick the stool up
  await page.keyboard.press('r');
  await clickCell(page, 3, 2); // drop it back where it was, now turned
  state = await api(page, (a) => a.state());
  expect(state.items.filter((i) => i.kind === 'stool')[0]).toMatchObject({ x: 3, y: 2, rot: 1 });
  expect(state.economy.fishCoins).toBe(40); // moving is free

  const toggle = await api(page, (a) => a.toggleScreen());
  await page.mouse.click(toggle.x, toggle.y);
  expect(await api(page, (a) => a.mode())).toBe('service');
  const plan = await api(page, (a) => a.plan());
  expect(plan.seats).toBe(1);

  const seated = await runServiceToEnd(page);
  const counts = await api(page, (a) => a.counts());
  expect(counts.served).toBeGreaterThan(0);
  // Every served visit used seat 0 — the stool we built — and the cat sat on its tile.
  const used = (await api(page, (a) => a.plan())).visits.filter((v) => v.outcome === 'served');
  expect(used.length).toBeGreaterThan(0);
  expect(used.every((v) => v.seatIndex === 0)).toBe(true);
  expect(seated.length).toBeGreaterThan(0);
  for (const s of seated) {
    expect(s.seat).toBe(0);
    expect(s.x).toBe((3 + 1) * 16 + 8); // stool tile centre
  }
  expect(errors).toEqual([]);
});

test('buying the next shop tier expands the grid and migrates the layout', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await open(page, 'mode=build&seed=2026&speed=8&tier=cart&coins=1000&rep=2');
  const shoot = (name: string): Promise<Buffer> =>
    page.locator('canvas').screenshot({ path: `test-results/build-${name}.png` });
  const before = await api(page, (a) => a.state());
  const size0 = await api(page, (a) => a.layoutSize());
  await shoot('tier-cart');

  await clickTool(page, UPGRADE);
  const after = await api(page, (a) => a.state());
  const size1 = await api(page, (a) => a.layoutSize());
  expect(after.tierId).toBe('stall');
  expect(after.economy.fishCoins).toBe(1000 - getTier('stall').unlockCost);
  expect(size1.cols).toBeGreaterThan(size0.cols);
  expect(size1.rows).toBeGreaterThan(size0.rows);
  // Layout migrated: every piece survived, shifted into the centre of the wider floor.
  expect(after.items).toHaveLength(before.items.length);
  expect(after.items.map((i) => i.x)).toEqual(before.items.map((i) => i.x + 1));
  await shoot('tier-stall');

  // The new tier has room for two more stools: buy them and serve.
  await clickTool(page, TOOL.stool);
  await clickCell(page, 4, 2);
  await clickCell(page, 6, 2);
  const grown = await api(page, (a) => a.state());
  expect(grown.items.filter((i) => i.kind === 'stool')).toHaveLength(4);
  expect(grown.economy.fishCoins).toBe(after.economy.fishCoins - 40);
  await shoot('tier-stall-furnished');

  const toggle = await api(page, (a) => a.toggleScreen());
  await page.mouse.click(toggle.x, toggle.y);
  // Four stools, but one stove only feeds three of them (SEATS_PER_STOVE).
  expect((await api(page, (a) => a.plan())).seats).toBe(3);
  await runServiceToEnd(page);
  expect((await api(page, (a) => a.counts())).served).toBeGreaterThan(0);

  // Can't skip ahead without the coins.
  await open(page, `mode=build&seed=2026&tier=cart&coins=${getTier('stall').unlockCost - 1}&rep=2`);
  await clickTool(page, UPGRADE);
  expect((await api(page, (a) => a.state())).tierId).toBe('cart');
  expect(await api(page, (a) => a.message())).toBe('Not enough Fish Coins');
  expect(errors).toEqual([]);
});
