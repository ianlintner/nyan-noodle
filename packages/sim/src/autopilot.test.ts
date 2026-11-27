import { describe, expect, it } from 'vitest';
import { autopilotPrep, autopilotRun, stockReserve } from './autopilot';
import { playerCapacity, staffCapacity } from './day';
import { NEIGHBOUR_PANTRY_BOWLS, STOCK_BOWL_COST, stockCap } from './prep';
import { STAFF_HIRE_COST, hireStaff } from './progression';
import { createSimState } from './state';
import type { SimState } from './state';

const capacity = (s: SimState): number => playerCapacity(s) + staffCapacity(s);
const stockedTarget = (s: SimState): number => Math.min(capacity(s), stockCap(s.tierId));

describe('autopilot stock reserve', () => {
  it('counts existing stock and the pantry cap', () => {
    const s = createSimState(3, 'cart');
    const empty = { ...s, stock: 0 };
    expect(stockReserve(empty)).toBeGreaterThanOrEqual(stockedTarget(empty) * STOCK_BOWL_COST);
    const full = { ...s, stock: stockedTarget(s) };
    expect(stockReserve(full)).toBeLessThan(stockReserve(empty) + 1);
    expect(stockReserve(full)).toBeLessThanOrEqual(stockReserve(empty));
  });

  it('skips a hire that would leave too little to stock the bigger kitchen', () => {
    // A furnished Small Shop with every dish owned, well short of the Ramen Bar's star gate,
    // so the hire is the first purchase on offer and the autopilot is not saving.
    const base = createSimState(7, 'small-shop');
    const empty: SimState = {
      ...base,
      stock: 0,
      unlockedRecipes: ['shoyu', 'miso', 'tonkotsu'],
      menu: ['shoyu', 'miso', 'tonkotsu'],
      economy: { ...base.economy, reputation: 2 },
    };
    const withCoins = (fishCoins: number): SimState => ({
      ...empty,
      economy: { ...empty.economy, fishCoins },
    });
    const hired = hireStaff(withCoins(10_000));
    if (!hired.ok) throw new Error(hired.reason);
    expect(capacity(hired.state)).toBeGreaterThan(capacity(empty));
    const needed = STAFF_HIRE_COST + stockReserve({ ...hired.state, stock: 0 });
    // Enough for the hire plus today's stock, but not for the hire's extra bowls.
    const tight = STAFF_HIRE_COST + stockReserve(empty);
    expect(tight).toBeLessThan(needed);
    const prepped = autopilotPrep(withCoins(tight));
    expect(prepped.staff.roster).toHaveLength(empty.staff.roster.length);
    expect(prepped.stock).toBeGreaterThanOrEqual(stockedTarget(prepped));
    // Control: with the bigger kitchen's stock money on hand, the same hire goes through.
    const roomy = autopilotPrep(withCoins(needed));
    expect(roomy.staff.roster).toHaveLength(empty.staff.roster.length + 1);
    expect(roomy.stock).toBeGreaterThanOrEqual(stockedTarget(roomy));
  });

  it('takes the neighbour pantry if it starts broke and empty', () => {
    const s = createSimState(3, 'cart');
    const broke: SimState = {
      ...s,
      stock: 0,
      pantryDay: 0,
      economy: { ...s.economy, fishCoins: 0 },
    };
    const prepped = autopilotPrep(broke);
    expect(prepped.stock).toBe(NEIGHBOUR_PANTRY_BOWLS);
    expect(prepped.pantryDay).toBe(prepped.clock.day);
    expect(prepped.economy.fishCoins).toBe(0);
  });

  it('always leaves enough to stock the kitchen it built when it started solvent', () => {
    for (const seed of [1, 2, 42, 1337]) {
      for (const day of autopilotRun(createSimState(seed, 'cart'), 30)) {
        if (day.economy.fishCoins < stockReserve(day)) continue;
        const prepped = autopilotPrep(day);
        expect(prepped.stock).toBeGreaterThanOrEqual(stockedTarget(prepped));
      }
    }
  });
});
