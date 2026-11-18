import { expect, test } from '@playwright/test';

interface ShopEvent {
  beat: number;
  customerId: number;
  type: 'spawn' | 'queue' | 'enter' | 'sit' | 'leave' | 'gone';
}
interface Counts {
  present: number;
  queued: number;
  seated: number;
  served: number;
  lost: number;
}
interface PlanVisit {
  outcome: string;
  arriveBeat: number;
  seatBeat: number | null;
}
interface ShopApi {
  events(): ShopEvent[];
  counts(): Counts;
  plan(): { seats: number; visits: PlanVisit[] };
  zoom(): number;
  done(): boolean;
  setZoom(z: number): void;
  /** Seated cats whose depth is not strictly above their stool's depth. */
  sortViolations(): number;
}
type ShopWindow = { __nyanShop?: ShopApi; __nyan?: { registry: { get(k: string): unknown } } };

for (const tier of ['cart', 'stall', 'small-shop'] as const) {
  test(`scripted day (${tier}): customers enter, queue, sit and leave`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`/?scene=shop&seed=2026&speed=8&tier=${tier}`);
    await page.waitForFunction(
      () => (window as unknown as ShopWindow).__nyan?.registry.get('shopReady') === true,
    );
    const api = <T>(fn: (a: ShopApi) => T): Promise<T> =>
      page.evaluate(`(${fn.toString()})(window.__nyanShop)`) as Promise<T>;
    const shoot = (name: string): Promise<Buffer> =>
      page.locator('canvas').screenshot({ path: `test-results/shop-${tier}-${name}.png` });

    expect(Number.isInteger(await api((a) => a.zoom()))).toBe(true);
    await shoot('start');

    let maxSeated = 0;
    let maxQueued = 0;
    let sortViolations = 0;
    let shotSeated = false;
    let shotQueue = false;
    const seats = await api((a) => a.plan().seats);

    for (let i = 0; i < 900; i++) {
      const c = await api((a) => a.counts());
      maxSeated = Math.max(maxSeated, c.seated);
      maxQueued = Math.max(maxQueued, c.queued);
      sortViolations += await api((a) => a.sortViolations());
      // Occupancy never exceeds the sim's seat count.
      expect(c.seated).toBeLessThanOrEqual(seats);
      if (!shotQueue && c.queued >= 1) {
        shotQueue = true;
        await shoot('queue');
      }
      if (!shotSeated && c.seated >= Math.min(seats, 2)) {
        shotSeated = true;
        await shoot('seated');
      }
      if (await api((a) => a.done())) break;
      await page.waitForTimeout(100);
    }

    expect(await api((a) => a.done())).toBe(true);
    expect(maxSeated).toBeGreaterThanOrEqual(Math.min(seats, 2));
    expect(sortViolations).toBe(0);

    const planned = (await api((a) => a.plan())).visits;
    if (planned.some((v) => v.seatBeat !== null && v.seatBeat > v.arriveBeat + 1)) {
      expect(maxQueued).toBeGreaterThanOrEqual(1);
    }

    const events = await api((a) => a.events());
    const byCustomer = new Map<number, ShopEvent['type'][]>();
    for (const e of events) {
      byCustomer.set(e.customerId, [...(byCustomer.get(e.customerId) ?? []), e.type]);
    }
    expect(byCustomer.size).toBe(planned.length);

    // Every served cat goes spawn -> enter -> sit -> leave -> gone, in that order.
    let served = 0;
    for (const types of byCustomer.values()) {
      if (types.includes('sit')) {
        served += 1;
        const idx = ['spawn', 'enter', 'sit', 'leave', 'gone'].map((t) =>
          types.indexOf(t as ShopEvent['type']),
        );
        expect(idx.every((n) => n >= 0)).toBe(true);
        expect([...idx].sort((a, b) => a - b)).toEqual(idx);
      } else {
        expect(types).toEqual(['spawn', 'leave', 'gone']);
      }
    }
    expect(served).toBe(planned.filter((p) => p.outcome === 'served').length);
    expect(served).toBeGreaterThan(0);

    const final = await api((a) => a.counts());
    expect(final.present).toBe(0);
    expect(final.served + final.lost).toBe(planned.length);

    // Camera zoom stays integer.
    await api((a) => a.setZoom(3));
    expect(await api((a) => a.zoom())).toBe(3);
    await shoot('zoom3');
    expect(errors).toEqual([]);
  });
}
