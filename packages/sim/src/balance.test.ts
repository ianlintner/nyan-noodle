import { describe, expect, it } from 'vitest';
import { autopilotRun } from './autopilot';
import { furnishToCapacity, nextFurnishing } from './furnish';
import { upgradeTier } from './build';
import { activeSeats, validateLayout } from './layoutRules';
import { getTier } from './shop';
import type { ShopTierId } from './shop';
import { createSimState } from './state';
import type { SimState } from './state';

const SEEDS = [1, 2, 3, 42, 99, 1337, 2024, 7777];

/** 1-based day on which the reference player first serves in `tier` (0 = never). */
function firstDayAt(history: readonly SimState[], tier: ShopTierId): number {
  return history.findIndex((s) => s.tierId === tier) + 1;
}

describe('balance: Cart -> Stall -> Small Shop pacing', () => {
  it.each(SEEDS)('seed %i reaches Stall by day 4 and Small Shop within days 6-8', (seed) => {
    const history = autopilotRun(createSimState(seed, 'cart'), 10);
    const stall = firstDayAt(history, 'stall');
    const shop = firstDayAt(history, 'small-shop');
    expect(stall).toBeGreaterThanOrEqual(2);
    expect(stall).toBeLessThanOrEqual(4);
    expect(shop).toBeGreaterThanOrEqual(6);
    expect(shop).toBeLessThanOrEqual(8);
  });

  it('daily takings grow tier over tier and the reference player never goes broke', () => {
    const history = autopilotRun(createSimState(1337, 'cart'), 10);
    const takings = (tier: ShopTierId): number[] =>
      history
        .filter((s) => s.tierId === tier && s.lastReport)
        .map((s) => s.lastReport!.revenue + s.lastReport!.tips);
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(takings('stall'))).toBeGreaterThan(mean(takings('cart')) * 1.5);
    expect(mean(takings('small-shop'))).toBeGreaterThan(mean(takings('stall')) * 1.3);
    for (const s of history) expect(s.economy.fishCoins).toBeGreaterThanOrEqual(0);
  });
});

describe('furnishToCapacity', () => {
  const rich = (s: SimState): SimState => ({
    ...s,
    economy: { ...s.economy, fishCoins: 5000, reputation: 5 },
  });

  it('fills a freshly upgraded tier to its seat cap with a valid layout', () => {
    for (const tier of ['stall', 'small-shop'] as const) {
      let s = rich(createSimState(5, 'cart'));
      while (s.tierId !== tier) {
        const up = upgradeTier(s);
        if (!up.ok) throw new Error(up.reason);
        s = up.state;
      }
      const furnished = furnishToCapacity(s, 5000);
      expect(activeSeats(tier, furnished.items)).toHaveLength(getTier(tier).seats);
      expect(validateLayout(tier, furnished.items)).toEqual([]);
      expect(nextFurnishing(furnished)).toBeNull();
    }
  });

  it('respects the budget and changes nothing when the shop is already full', () => {
    const cart = createSimState(5, 'cart');
    expect(nextFurnishing(cart)).toBeNull();
    expect(furnishToCapacity(cart, 1000)).toBe(cart);
    const up = upgradeTier(rich(cart));
    if (!up.ok) throw new Error(up.reason);
    const poor = furnishToCapacity(up.state, 19);
    expect(poor.items).toHaveLength(up.state.items.length);
  });
});
