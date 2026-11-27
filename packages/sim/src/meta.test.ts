import { describe, expect, it } from 'vitest';
import { autopilotDay, autopilotRun } from './autopilot';
import { settleDay } from './day';
import {
  PRICE_ADJUST_MAX,
  STOCK_BOWL_COST,
  STOCK_CAP,
  adjustPrice,
  buyStock,
  effectiveMenu,
  salePrice,
  stockCap,
  toggleMenu,
} from './prep';
import {
  buyEquipment,
  hireStaff,
  levelStaff,
  starUnlocks,
  trainMastery,
  unlockRecipe,
} from './progression';
import { planService } from './service';
import { createSimState } from './state';
import type { SimState } from './state';

const rich = (state: SimState, coins: number, rep: number): SimState => ({
  ...state,
  economy: { ...state.economy, fishCoins: coins, reputation: rep },
});

describe('prep', () => {
  it('buys stock for coins and tracks spend, clamped by cap and funds', () => {
    const s = createSimState(1, 'cart');
    const r = buyStock(s, 5);
    expect(r.ok && r.state.stock).toBe(s.stock + 5);
    expect(r.ok && r.state.economy.fishCoins).toBe(s.economy.fishCoins - 5 * STOCK_BOWL_COST);
    expect(r.ok && r.state.stockSpent).toBe(5 * STOCK_BOWL_COST);
    const broke = buyStock(rich(s, 2, 0), 5);
    expect(broke).toEqual({ ok: false, reason: 'need-coins' });
    const full = buyStock({ ...rich(s, 999, 0), stock: STOCK_CAP }, 1);
    expect(full).toEqual({ ok: false, reason: 'maxed' });
    const partial = buyStock(rich(s, 999, 0), 999);
    expect(partial.ok && partial.state.stock).toBe(STOCK_CAP);
  });

  it('grows the pantry with the venue so big tiers can stock a full kitchen', () => {
    expect(stockCap('cart')).toBe(STOCK_CAP);
    expect(stockCap('ramen-bar')).toBeGreaterThan(STOCK_CAP);
    expect(stockCap('grand-hall')).toBeGreaterThan(stockCap('ramen-bar'));
    const hall = { ...rich(createSimState(1, 'grand-hall'), 999, 5), stock: 0 };
    const filled = buyStock(hall, 999);
    expect(filled.ok && filled.state.stock).toBe(stockCap('grand-hall'));
  });

  it('keeps at least one dish on the menu and only toggles owned recipes', () => {
    const s = createSimState(1, 'cart');
    expect(toggleMenu(s, 'shoyu')).toEqual({ ok: false, reason: 'last-recipe' });
    expect(toggleMenu(s, 'miso')).toEqual({ ok: false, reason: 'not-owned' });
    const two = unlockRecipe(rich(s, 500, 3), 'miso');
    expect(two.ok).toBe(true);
    if (!two.ok) return;
    const off = toggleMenu(two.state, 'miso');
    expect(off.ok && off.state.menu).toEqual(['shoyu']);
    expect(effectiveMenu({ ...two.state, menu: [] })).toEqual(['shoyu']);
  });

  it('price steps change the sale price and clamp', () => {
    let s = createSimState(1, 'cart');
    const base = salePrice(s, 'shoyu');
    const up = adjustPrice(s, 'shoyu', 1);
    if (!up.ok) throw new Error('adjust');
    expect(salePrice(up.state, 'shoyu')).toBeGreaterThan(base);
    for (let i = 0; i < 10; i++) {
      const r = adjustPrice(s, 'shoyu', 1);
      if (r.ok) s = r.state;
    }
    expect(s.priceAdjust.shoyu).toBe(PRICE_ADJUST_MAX);
  });
});

describe('progression gating by Reputation Stars', () => {
  it('gates recipes, mastery, equipment and hiring by stars and coins', () => {
    const s = createSimState(1, 'cart');
    expect(unlockRecipe(rich(s, 999, 0.5), 'miso')).toEqual({ ok: false, reason: 'need-stars' });
    expect(unlockRecipe(rich(s, 10, 3), 'miso')).toEqual({ ok: false, reason: 'need-coins' });
    expect(unlockRecipe(s, 'shoyu')).toEqual({ ok: false, reason: 'already-owned' });
    expect(hireStaff(rich(s, 999, 0.5))).toEqual({ ok: false, reason: 'need-stars' });
    expect(buyEquipment(rich(s, 999, 0), 'signboard')).toEqual({ ok: false, reason: 'need-stars' });
    expect(trainMastery(s, 'miso')).toEqual({ ok: false, reason: 'not-owned' });
  });

  it('spends coins, unlocks the recipe onto the menu and trains mastery', () => {
    const s = rich(createSimState(1, 'cart'), 500, 3);
    const unlocked = unlockRecipe(s, 'miso');
    if (!unlocked.ok) throw new Error('unlock');
    expect(unlocked.state.unlockedRecipes).toContain('miso');
    expect(unlocked.state.menu).toContain('miso');
    expect(unlocked.state.economy.fishCoins).toBe(440);
    let trained = unlocked.state;
    for (let i = 0; i < 3; i++) {
      const r = trainMastery(trained, 'miso');
      if (!r.ok) throw new Error('train');
      trained = r.state;
    }
    expect(trained.mastery.miso).toBe(3);
    expect(salePrice(trained, 'miso')).toBeGreaterThan(salePrice(unlocked.state, 'miso'));
  });

  it('hires and levels staff, raising wages and keeping ids unique', () => {
    let s = rich(createSimState(1, 'cart'), 900, 4);
    const a = hireStaff(s);
    if (!a.ok) throw new Error('hire');
    s = a.state;
    const b = hireStaff(s);
    if (!b.ok) throw new Error('hire2');
    s = b.state;
    expect(new Set(s.staff.roster.map((m) => m.id)).size).toBe(2);
    const lv = levelStaff(s, s.staff.roster[0]!.id);
    if (!lv.ok) throw new Error('level');
    expect(lv.state.staff.roster[0]!.level).toBe(2);
    expect(lv.state.staff.roster[0]!.wage).toBeGreaterThan(s.staff.roster[0]!.wage);
    expect(levelStaff(s, 999)).toEqual({ ok: false, reason: 'unknown' });
  });

  it('reports newly crossed star gates as unlocks', () => {
    const s = createSimState(1, 'cart');
    const notes = starUnlocks(0.4, 2.1, s);
    expect(notes.join('|')).toContain('Miso Ramen recipe');
    expect(notes.join('|')).toContain('Tonkotsu Ramen recipe');
    expect(notes.join('|')).toContain('Stall expansion');
    expect(starUnlocks(2.1, 2.2, s)).toEqual([]);
  });
});

describe('settleDay', () => {
  it('is deterministic and rolls the clock to the next prep', () => {
    const s = createSimState(11, 'cart');
    const a = settleDay(s, planService(s));
    const b = settleDay(s, planService(s));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.state.clock).toEqual({ day: 2, phase: 'prep', tick: 0 });
    expect(a.state.lastReport).toEqual(a.report);
    expect(a.report.customersServed + a.report.customersLost).toBe(planService(s).visits.length);
  });

  it('accounts for coins: revenue + tips - wages - stock bought + goal rewards', () => {
    const base = createSimState(5, 'cart');
    const bought = buyStock(base, 10);
    if (!bought.ok) throw new Error('stock');
    const { state, report } = settleDay(bought.state, planService(bought.state));
    expect(report.costs).toBe(10 * STOCK_BOWL_COST);
    // Goal rewards are paid on top of the day's profit and are listed on the report.
    const goalCoins = report.goalsCompleted.reduce((sum, g) => sum + g.coins, 0);
    expect(state.economy.fishCoins).toBe(
      bought.state.economy.fishCoins + report.profit + 10 * STOCK_BOWL_COST + goalCoins,
    );
    expect(report.profit).toBe(report.revenue + report.tips - report.costs);
    expect(state.stock).toBe(report.stockLeft);
    expect(state.stockSpent).toBe(0);
  });

  it('turns customers away as complaints when stock runs out', () => {
    const s = { ...createSimState(5, 'cart'), stock: 1 };
    const { report } = settleDay(s, planService(s));
    expect(report.customersServed).toBeLessThanOrEqual(1);
    expect(report.complaintKinds['sold-out'] + report.complaintKinds.queue).toBeGreaterThan(0);
    expect(report.complaints).toBe(Object.values(report.complaintKinds).reduce((x, y) => x + y, 0));
  });

  it('staff add capacity beyond what the owner can cook alone', () => {
    const base = rich({ ...createSimState(21, 'small-shop'), stock: 40 }, 2000, 4);
    const solo = settleDay(base, planService(base)).report;
    let staffed = base;
    for (let i = 0; i < 3; i++) {
      const hired = hireStaff(staffed);
      if (hired.ok) staffed = hired.state;
    }
    const withStaff = settleDay(staffed, planService(staffed)).report;
    expect(solo.complaintKinds['too-slow']).toBeGreaterThan(0);
    expect(withStaff.customersServed).toBeGreaterThan(solo.customersServed);
  });

  it('never lets reputation leave 0..5', () => {
    const s = { ...createSimState(5, 'cart'), stock: 0 };
    expect(settleDay(s, planService(s)).state.economy.reputation).toBe(0);
  });
});

describe('autopilot curve', () => {
  it('is deterministic and grows revenue across a 10-day run', () => {
    const run = () => autopilotRun(createSimState(1337, 'cart'), 10);
    const a = run();
    expect(JSON.stringify(a)).toBe(JSON.stringify(run()));
    const last = a[a.length - 1]!;
    expect(last.clock.day).toBe(11);
    expect(last.economy.lifetimeEarned).toBeGreaterThan(
      createSimState(1, 'cart').economy.fishCoins,
    );
    expect(last.economy.reputation).toBeGreaterThan(0);
    expect(autopilotDay(createSimState(1337, 'cart')).report.day).toBe(1);
  });
});
