import { describe, expect, it } from 'vitest';
import { createSimState } from './state';
import { planService } from './service';
import { settleDay } from './day';
import { CHEF_TICKETS, CHEF_TICKETS_BY_TIER, chefTicketCap } from './chef';
import {
  GREET_PATIENCE_BEATS,
  NO_GREETS,
  collectBonus,
  collectMultiplier,
  greetBudget,
  spendGreet,
} from './interact';

describe('greeting', () => {
  const state = createSimState(2026, 'cart');
  const base = planService(state);

  it('with no greets is identical to the baseline plan', () => {
    expect(planService(state, undefined, new Map())).toEqual(base);
  });

  it('adds patience to the greeted cat only, deterministically', () => {
    const id = base.visits[0]!.customerId;
    const a = planService(state, undefined, new Map([[id, 1]]));
    const b = planService(state, undefined, new Map([[id, 1]]));
    expect(a).toEqual(b);
    for (const v of a.visits) {
      const was = base.visits.find((x) => x.customerId === v.customerId)!;
      expect(v.patienceBeats).toBe(
        was.patienceBeats + (v.customerId === id ? GREET_PATIENCE_BEATS : 0),
      );
    }
  });

  it('enforces the per-tier budget and the per-cat cap', () => {
    let ledger = NO_GREETS;
    for (let i = 0; i < greetBudget('cart'); i++) {
      const next = spendGreet(ledger, 'cart', i);
      expect(next).not.toBeNull();
      ledger = next!;
    }
    expect(spendGreet(ledger, 'cart', 99)).toBeNull();
    expect(greetBudget('grand-hall')).toBeGreaterThan(greetBudget('cart'));
    const one = spendGreet(NO_GREETS, 'grand-hall', 1)!;
    expect(spendGreet(spendGreet(one, 'grand-hall', 1)!, 'grand-hall', 1)).toBeNull();
  });
});

describe('collecting tips', () => {
  const state = createSimState(2026, 'cart');
  const plan = planService(state);
  const served = plan.visits.filter((v) => v.outcome === 'served').map((v) => v.customerId);

  it('never lowers tips and leaves everything else unchanged', () => {
    const none = settleDay(state, plan).report;
    const all = settleDay(state, plan, { collected: served }).report;
    expect(all.tips).toBeGreaterThanOrEqual(none.tips);
    expect(all.revenue).toBe(none.revenue);
    expect(all.reputation).toBe(none.reputation);
    expect(settleDay(state, plan, { collected: [] })).toEqual(settleDay(state, plan));
  });

  it('is deterministic and ignores unknown ids', () => {
    const a = settleDay(state, plan, { collected: [...served, 9999] });
    expect(a).toEqual(settleDay(state, plan, { collected: served }));
  });

  it('collect streak multiplier rises and caps', () => {
    expect(collectMultiplier(1)).toBe(1);
    expect(collectMultiplier(3)).toBeGreaterThan(collectMultiplier(2));
    expect(collectMultiplier(50)).toBe(collectMultiplier(6));
    expect(collectBonus(0, 1)).toBe(1);
  });
});

describe('hand-cook cap per tier', () => {
  it('starts at CHEF_TICKETS and never falls as tiers rise', () => {
    expect(chefTicketCap('cart')).toBe(CHEF_TICKETS);
    const caps = (['cart', 'stall', 'small-shop', 'ramen-bar', 'grand-hall'] as const).map(
      (t) => CHEF_TICKETS_BY_TIER[t],
    );
    expect(caps).toEqual([...caps].sort((a, b) => a - b));
    expect(caps[4]).toBeGreaterThan(caps[0]!);
  });
});
