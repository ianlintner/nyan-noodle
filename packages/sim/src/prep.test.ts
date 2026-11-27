import { describe, expect, it } from 'vitest';
import {
  NEIGHBOUR_PANTRY_BOWLS,
  STOCK_BOWL_COST,
  buyStock,
  neighbourPantry,
  pantryOffer,
  stockCap,
} from './prep';
import { createRng } from './rng';
import { SHOP_TIERS } from './shop';
import type { ShopTierId } from './shop';
import { createSimState } from './state';
import type { SimState } from './state';

function broke(over: Partial<SimState> = {}): SimState {
  const s = createSimState(42, 'cart');
  return { ...s, stock: 0, economy: { ...s.economy, fishCoins: 0 }, ...over };
}

describe('neighbour pantry', () => {
  it('is offered only when the cupboard is bare, buying is unaffordable and today is unused', () => {
    expect(pantryOffer(broke())).toBe(true);
    expect(
      pantryOffer(broke({ economy: { ...broke().economy, fishCoins: STOCK_BOWL_COST } })),
    ).toBe(false);
    expect(pantryOffer(broke({ stock: 1 }))).toBe(false);
    const used = neighbourPantry(broke());
    if (!used.ok) throw new Error(used.reason);
    expect(pantryOffer(used.state)).toBe(false);
    // A new day reopens the offer, even if all 5 bowls were sold yesterday.
    const tomorrow: SimState = {
      ...used.state,
      stock: 0,
      clock: { ...used.state.clock, day: used.state.clock.day + 1 },
    };
    expect(pantryOffer(tomorrow)).toBe(true);
  });

  it('grants 5 free bowls once a day without mutating the input', () => {
    const start = broke();
    const result = neighbourPantry(start);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.stock).toBe(NEIGHBOUR_PANTRY_BOWLS);
    expect(result.state.economy.fishCoins).toBe(0);
    expect(result.state.pantryDay).toBe(start.clock.day);
    expect(start.stock).toBe(0);
    expect(start.pantryDay).toBe(0);
    // Empty again (e.g. after service) but still the same day: no second favour.
    const again = neighbourPantry({ ...result.state, stock: 0 });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('pantry-used');
  });

  it('refuses the gift when it is not needed or already claimed today', () => {
    const stocked = neighbourPantry(broke({ stock: 2 }));
    expect(stocked.ok).toBe(false);
    if (!stocked.ok) expect(stocked.reason).toBe('has-stock');
    const solvent = neighbourPantry(
      broke({ economy: { ...broke().economy, fishCoins: STOCK_BOWL_COST } }),
    );
    expect(solvent.ok).toBe(false);
    if (!solvent.ok) expect(solvent.reason).toBe('can-afford');
    const day = broke().clock.day;
    const claimed = neighbourPantry(broke({ pantryDay: day }));
    expect(claimed.ok).toBe(false);
    if (!claimed.ok) expect(claimed.reason).toBe('pantry-used');
  });
});

describe('no dead end at Prep', () => {
  it('a seeded sweep of reachable stock/coins/tier states always has a way to open', () => {
    const rng = createRng(0x4e59414e);
    const tiers: readonly ShopTierId[] = SHOP_TIERS.map((t) => t.id);
    let brokeCases = 0;
    for (let i = 0; i < 900; i++) {
      const tierId = rng.pick(tiers);
      const cap = stockCap(tierId);
      const day = rng.int(1, 30);
      const stock = rng.int(0, cap);
      const fishCoins = rng.int(0, 12);
      // During Prep nothing spends stock, and service rolls the clock before the next
      // Prep. So a pantry used "today" cannot coexist with an empty pantry: if today's
      // favour was taken, its bowls are still on the shelf.
      const pantryDay = rng.int(0, day - 1);
      const base = createSimState(7, tierId);
      const state: SimState = {
        ...base,
        tierId,
        stock,
        pantryDay,
        clock: { ...base.clock, day },
        economy: { ...base.economy, fishCoins },
      };
      const bought = buyStock(state, cap);
      const gifted = neighbourPantry(state);
      expect(
        state.stock > 0 || bought.ok || gifted.ok,
        `tier=${tierId} day=${day} stock=${stock} coins=${fishCoins} pantryDay=${pantryDay}`,
      ).toBe(true);
      const opened = bought.ok ? bought.state : gifted.ok ? gifted.state : state;
      expect(opened.stock, `tier=${tierId} coins=${fishCoins}`).toBeGreaterThan(0);
      if (stock === 0 && fishCoins < STOCK_BOWL_COST) {
        brokeCases++;
        expect(gifted.ok).toBe(true);
      }
    }
    expect(brokeCases).toBeGreaterThan(0);
  });
});
