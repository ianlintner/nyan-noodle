import { describe, expect, it } from 'vitest';
import { RECIPES, TOPPINGS, INGREDIENTS, STARTING_RECIPES } from './recipes';
import { SHOP_TIERS, getTier, nextTier } from './shop';
import { createClock, tickClock } from './clock';
import { COATS, createCustomer, regularPatienceBonus } from './customers';
import { createStaff, dailyWages, stationCapacity } from './staff';
import { createEconomy, bowlPrice, bowlCost, reputationGain, MAX_REPUTATION } from './economy';
import { generateOrder, dailyDemand } from './orders';
import { createSimState, SIM_VERSION } from './state';
import { createRng } from './rng';
import { autopilotDay, autopilotRun } from './autopilot';

describe('recipes', () => {
  it('defines three recipes (only shoyu is owned at the start)', () => {
    expect(STARTING_RECIPES).toEqual(['shoyu']);
    expect(RECIPES.shoyu!.name).toBe('Shoyu Ramen');
    expect(RECIPES.miso!.name).toBe('Miso Ramen');
    expect(RECIPES.tonkotsu!.name).toBe('Tonkotsu Ramen');
    expect(RECIPES.shoyu!.broth).toBe('broth-shoyu');
    expect(RECIPES.miso!.broth).toBe('broth-miso');
    expect(RECIPES.tonkotsu!.broth).toBe('broth-tonkotsu');
  });

  it('every recipe references known ingredients and toppings', () => {
    for (const recipe of Object.values(RECIPES)) {
      expect(INGREDIENTS[recipe.broth]).toBeDefined();
      for (const topping of recipe.availableToppings) {
        expect(TOPPINGS[topping]).toBeDefined();
      }
    }
  });
});

describe('shop tiers', () => {
  it('orders Cart -> Stall -> Small Shop with growing capacity', () => {
    const [cart, stall, small] = SHOP_TIERS;
    expect([cart!.id, stall!.id, small!.id]).toEqual(['cart', 'stall', 'small-shop']);
    expect(small!.seats).toBeGreaterThan(stall!.seats);
    expect(stall!.seats).toBeGreaterThan(cart!.seats);
    expect(small!.stoves).toBeGreaterThan(cart!.stoves);
    expect(getTier('cart').id).toBe('cart');
  });

  it('nextTier chains correctly and is null at the top', () => {
    expect(nextTier('cart')!.id).toBe('stall');
    expect(nextTier('stall')!.id).toBe('small-shop');
    expect(nextTier('small-shop')).toBeNull();
  });
});

describe('clock', () => {
  it('advances through prep -> service -> close -> build -> next day', () => {
    let clock = createClock();
    expect(clock.phase).toBe('prep');
    clock = tickClock(clock); // prep -> service
    expect(clock.phase).toBe('service');
    // Burn the rest of service (11 more ticks), then observe the wrap.
    for (let i = 0; i < 11; i++) clock = tickClock(clock);
    expect(clock.phase).toBe('service');
    const phases: string[] = [];
    for (let i = 0; i < 3; i++) {
      clock = tickClock(clock);
      phases.push(clock.phase);
    }
    expect(phases).toEqual(['close', 'build', 'prep']);
    expect(clock.day).toBe(2);
  });
});

describe('customers', () => {
  it('applies coat patience modifier and rounds', () => {
    const tabby = createCustomer(1, 'tabby', { recipeOrder: ['shoyu'], likedToppings: [] }, 20);
    const sakura = createCustomer(2, 'sakura', { recipeOrder: ['miso'], likedToppings: [] }, 20);
    expect(sakura.patience).toBeGreaterThan(tabby.patience);
    expect(COATS.black.patienceModifier).toBeLessThan(COATS.grey.patienceModifier);
  });

  it('regulars gain a patience bonus', () => {
    const customer = createCustomer(
      1,
      'tabby',
      { recipeOrder: ['shoyu'], likedToppings: [] },
      20,
      1,
    );
    expect(customer.isRegular).toBe(true);
    expect(regularPatienceBonus(customer)).toBe(2);
  });
});

describe('staff', () => {
  it('computes wages and station capacity', () => {
    const a = createStaff(1, 'Momo', 1);
    const b = createStaff(2, 'Taro', 4);
    const model = { roster: [a, b] };
    expect(dailyWages(model)).toBe(20 + 50);
    expect(stationCapacity(model, 1)).toBe(1 + a.stations + b.stations);
    expect(stationCapacity({ roster: [] }, 1)).toBe(1);
  });
});

describe('economy', () => {
  it('prices bowls above cost and scales with reputation', () => {
    const priceLow = bowlPrice('shoyu', [], 0);
    const priceHigh = bowlPrice('shoyu', [], 5);
    expect(priceHigh).toBeGreaterThan(priceLow);
    expect(bowlPrice('tonkotsu', ['egg'], 0)).toBeGreaterThan(bowlCost('tonkotsu', ['egg']));
  });

  it('reputation gain shrinks near the cap', () => {
    expect(reputationGain(0)).toBeGreaterThan(reputationGain(4));
    expect(reputationGain(MAX_REPUTATION)).toBe(0);
  });

  it('starts with seed coins', () => {
    expect(createEconomy(40).fishCoins).toBe(40);
  });
});

describe('orders', () => {
  it('generates a deterministic order with valid recipe and toppings', () => {
    const rng = createRng(5);
    const customer = createCustomer(
      1,
      'tabby',
      { recipeOrder: ['shoyu', 'miso'], likedToppings: ['egg'] },
      20,
    );
    const order = generateOrder(0, customer, 0, bowlPrice, rng);
    expect(['shoyu', 'miso']).toContain(order.recipeId);
    for (const topping of order.extraToppings) {
      expect(RECIPES[order.recipeId]!.availableToppings).toContain(topping);
    }
    expect(order.price).toBeGreaterThan(0);
    expect(order.patienceRemaining).toBe(customer.patience);
  });

  it('demand grows with reputation and is bounded below', () => {
    const low = dailyDemand(1, 0, createRng(3));
    const high = dailyDemand(1, 5, createRng(3));
    expect(dailyDemand(1, 0, createRng(999))).toBeGreaterThanOrEqual(1);
    expect(high).toBeGreaterThan(low);
  });
});

describe('simulation', () => {
  it('creates a serializable initial state', () => {
    const state = createSimState(42, 'cart');
    expect(state.version).toBe(SIM_VERSION);
    expect(state.clock.day).toBe(1);
    expect(state.unlockedRecipes).toEqual(['shoyu']);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('advances a day and records a revenue history entry', () => {
    const state = createSimState(7, 'cart');
    const next = autopilotDay(state).state;
    expect(next.clock.day).toBe(2);
    expect(next.lastReport).not.toBeNull();
    expect(next.revenueHistory).toHaveLength(1);
    expect(next.economy.reputation).toBeGreaterThanOrEqual(0);
  });

  it('is byte-identical across runs for a fixed seed (30 days)', () => {
    const run = () => {
      const initial = createSimState(1337, 'cart');
      const final = autopilotRun(initial, 30).at(-1);
      return JSON.stringify(final);
    };
    const a = run();
    const b = run();
    expect(a).toBe(b);
    expect(a).not.toBe(JSON.stringify(autopilotRun(createSimState(999, 'cart'), 30).at(-1)));
  });

  it('revenue curve grows as reputation rises', () => {
    const final30 = autopilotRun(createSimState(42, 'cart'), 30).at(-1)!;
    expect(final30.revenueHistory).toHaveLength(30);
    const firstDays = final30.revenueHistory.slice(0, 7).reduce((a, b) => a + b, 0);
    const lastDays = final30.revenueHistory.slice(-7).reduce((a, b) => a + b, 0);
    // With demand scaling to reputation, later days should not shrink overall.
    expect(lastDays).toBeGreaterThanOrEqual(firstDays);
  });
});
