import { describe, expect, it } from 'vitest';
import { autopilotDay, autopilotRun } from './autopilot';
import { upgradeTier } from './build';
import { planDay, settleDay } from './day';
import {
  GOALS,
  acknowledgeOpening,
  atGrandOpening,
  createGoals,
  currentGoals,
  evaluateGoals,
  goalsForTier,
  openingPending,
  openingStats,
} from './goals';
import { MAX_REPUTATION } from './economy';
import { SHOP_TIERS } from './shop';
import type { ShopTierId } from './shop';
import { createSimState } from './state';
import type { SimState } from './state';
import { createSave, parseSave, serializeSave } from './save';

const SEEDS = [1, 2, 3, 42, 99, 1337, 2024, 7777];
const NO_DAY = { served: 0, perfectBowls: 0 };

const withRep = (s: SimState, reputation: number): SimState => ({
  ...s,
  economy: { ...s.economy, reputation },
});

/**
 * First day each of Stall / Small Shop / Ramen Bar / Grand Hall opened under the reference
 * autopilot BEFORE goal rewards existed (main d4f5dd1), 35 days, per seed above.
 */
const BASELINE_TIER_DAYS: Readonly<Record<number, readonly number[]>> = {
  1: [3, 7, 12, 22],
  2: [3, 6, 12, 21],
  3: [3, 6, 12, 21],
  42: [3, 7, 13, 22],
  99: [3, 7, 13, 22],
  1337: [3, 7, 13, 22],
  2024: [3, 7, 12, 22],
  7777: [3, 8, 13, 23],
};
const UPGRADE_TIERS: readonly ShopTierId[] = ['stall', 'small-shop', 'ramen-bar', 'grand-hall'];

describe('goal definitions', () => {
  it('gives every tier exactly three goals with unique ids and sane rewards', () => {
    for (const tier of SHOP_TIERS) expect(goalsForTier(tier.id)).toHaveLength(3);
    expect(new Set(GOALS.map((g) => g.id)).size).toBe(GOALS.length);
    for (const g of GOALS) {
      expect(g.target).toBeGreaterThan(0);
      expect(g.rewardCoins + g.rewardStars).toBeGreaterThan(0);
      // Rewards stay a rounding error next to the tier gates, so the balance curve holds.
      expect(g.rewardCoins).toBeLessThanOrEqual(100);
      expect(g.rewardStars).toBeLessThanOrEqual(0.1);
    }
  });
});

describe('evaluateGoals', () => {
  it('pays a completed goal once, in coins, and records it', () => {
    const start = withRep(createSimState(7, 'cart'), 0.6);
    const first = evaluateGoals(start, NO_DAY);
    expect(first.completions.map((c) => c.id)).toEqual(['cart-stars']);
    expect(first.state.economy.fishCoins).toBe(start.economy.fishCoins + 10);
    expect(first.state.economy.lifetimeEarned).toBe(start.economy.lifetimeEarned + 10);
    expect(first.state.goals.completed).toEqual(['cart-stars']);
    // Same state again: nothing more is owed.
    const again = evaluateGoals(first.state, NO_DAY);
    expect(again.completions).toEqual([]);
    expect(again.state.economy.fishCoins).toBe(first.state.economy.fishCoins);
    expect(again.state.goals.completed).toEqual(['cart-stars']);
  });

  it('reads per-day stats for served and Perfect goals', () => {
    const start = createSimState(7, 'small-shop');
    const quiet = evaluateGoals(start, { served: 5, perfectBowls: 2 });
    expect(quiet.completions).toEqual([]);
    const great = evaluateGoals(start, { served: 5, perfectBowls: 3 });
    expect(great.completions.map((c) => c.id)).toEqual(['shop-perfect']);
  });

  it('only evaluates the current tier', () => {
    // 5 stars satisfies cart-stars and shop-stars, but only the Small Shop goal is live.
    const s = withRep(createSimState(7, 'small-shop'), 5);
    expect(evaluateGoals(s, NO_DAY).completions.map((c) => c.id)).toEqual(['shop-stars']);
  });

  it('pays Perfect-bowl goals in coins plus a little reputation, capped at the maximum', () => {
    const start = withRep(createSimState(7, 'small-shop'), 2);
    const paid = evaluateGoals(start, { served: 9, perfectBowls: 3 });
    const [done] = paid.completions;
    expect(done).toMatchObject({ id: 'shop-perfect', coins: 15, stars: 0.05 });
    expect(paid.state.economy.fishCoins).toBe(start.economy.fishCoins + 15);
    expect(paid.state.economy.reputation).toBe(2.05);
    // A reward at the star cap cannot push reputation past it.
    const capped = evaluateGoals(withRep(start, MAX_REPUTATION), { served: 9, perfectBowls: 3 });
    expect(capped.state.economy.reputation).toBe(MAX_REPUTATION);
  });

  it('counts goal payouts in lifetime earnings, like sales and tips', () => {
    const start = withRep(createSimState(7, 'cart'), 0.6);
    const paid = evaluateGoals(start, NO_DAY);
    const coins = paid.completions.reduce((sum, g) => sum + g.coins, 0);
    expect(coins).toBeGreaterThan(0);
    expect(paid.state.economy.fishCoins).toBe(start.economy.fishCoins + coins);
    expect(paid.state.economy.lifetimeEarned).toBe(start.economy.lifetimeEarned + coins);
  });

  it('reports progress clamped to the target, and done goals as full', () => {
    const s = withRep(createSimState(7, 'cart'), 0.25);
    const [served, regulars, stars] = currentGoals(s);
    expect(served!.value).toBe(0);
    expect(regulars!.done).toBe(false);
    expect(stars!.value).toBe(0.25);
    const done = evaluateGoals(withRep(s, 4), NO_DAY).state;
    const after = currentGoals(done).find((g) => g.def.id === 'cart-stars')!;
    expect(after.done).toBe(true);
    expect(after.value).toBe(after.def.target);
  });
});

describe('Grand Opening milestone', () => {
  const hall = (rep: number): SimState => withRep(createSimState(7, 'grand-hall'), rep);

  it('arms only in the top tier at full stars, then shows once', () => {
    expect(atGrandOpening(hall(4.9))).toBe(false);
    expect(atGrandOpening(withRep(createSimState(7, 'ramen-bar'), 5))).toBe(false);
    expect(atGrandOpening(hall(5))).toBe(true);

    expect(openingPending(evaluateGoals(hall(4.9), NO_DAY).state)).toBe(false);
    const armed = evaluateGoals(hall(5), NO_DAY).state;
    expect(armed.goals.opening).toBe('pending');
    expect(openingPending(armed)).toBe(true);

    const seen = acknowledgeOpening(armed);
    expect(seen.goals.opening).toBe('seen');
    // Evaluating again never re-arms a milestone that was already shown.
    expect(evaluateGoals(seen, NO_DAY).state.goals.opening).toBe('seen');
    // Acknowledging something that is not pending changes nothing.
    const locked = createSimState(7, 'cart');
    expect(acknowledgeOpening(locked)).toBe(locked);
  });

  it('arms when the Grand Hall is bought at five stars, before any next service', () => {
    const bar = withRep(createSimState(7, 'ramen-bar'), MAX_REPUTATION);
    const rich: SimState = { ...bar, economy: { ...bar.economy, fishCoins: 100_000 } };
    const purchase = upgradeTier(rich);
    expect(purchase.ok).toBe(true);
    if (!purchase.ok) return;
    expect(purchase.state.tierId).toBe('grand-hall');
    expect(purchase.state.goals.opening).toBe('pending');
    // A poor day afterwards cannot hide a milestone already earned at purchase time.
    const later = autopilotDay({
      ...purchase.state,
      economy: { ...purchase.state.economy, reputation: MAX_REPUTATION - 1 },
    });
    expect(later.state.goals.opening).toBe('pending');
  });

  it('summarises days, bowls and the best regular', () => {
    const base = hall(5);
    const reg = (id: number, affection: number, visits: number) => ({
      id,
      name: `Cat ${id}`,
      coat: 'tabby' as const,
      breed: 'calico' as const,
      trait: 'picky' as const,
      favoriteRecipe: 'shoyu' as const,
      visits,
      affection,
      lastSeenDay: 1,
    });
    expect(openingStats(base).bestRegular).toBeNull();
    const s: SimState = {
      ...base,
      clock: { ...base.clock, day: 31 },
      goals: { ...base.goals, bowlsServed: 812 },
      regulars: [reg(0, 4, 9), reg(1, 9, 5), reg(2, 9, 8)],
    };
    expect(openingStats(s)).toEqual({
      days: 30,
      bowlsServed: 812,
      bestRegular: { name: 'Cat 2', affection: 9 },
    });
  });
});

describe('goals through settleDay (reference autopilot)', () => {
  it('records completions on the report and the state, once', () => {
    const { state, report } = autopilotDay(createSimState(1337, 'cart'));
    expect(report.goalsCompleted.map((g) => g.id)).toContain('cart-served');
    expect(state.lastReport).toEqual(report);
    for (const g of report.goalsCompleted) expect(state.goals.completed).toContain(g.id);
    // Day 2 does not re-pay day 1's goals.
    const day2 = autopilotDay(state).report;
    for (const g of day2.goalsCompleted)
      expect(report.goalsCompleted.map((x) => x.id)).not.toContain(g.id);
    expect(state.goals.bowlsServed).toBe(report.customersServed);
  });

  it('keeps the Report reputation in sync with the saved state every day', () => {
    for (const seed of SEEDS) {
      let s = createSimState(seed, 'cart');
      for (let day = 0; day < 35; day++) {
        const before = s.economy.reputation;
        const result = autopilotDay(s);
        expect(result.report.reputation).toBe(result.state.economy.reputation);
        expect(result.state.lastReport!.reputation).toBe(result.state.economy.reputation);
        expect(result.report.reputationDelta).toBe(
          Math.round((result.report.reputation - before) * 100) / 100,
        );
        s = result.state;
      }
    }
  });

  it('announces a star gate crossed by a goal reward in the same Report', () => {
    const start = withRep(createSimState(7, 'small-shop'), 3.1);
    const plan = planDay(start);
    const visits = plan.visits.slice(0, 3).map((v) => ({ ...v, outcome: 'served' as const }));
    expect(visits).toHaveLength(3);
    const result = settleDay(start, { ...plan, visits }, { chefQualities: [100, 100, 100] });
    const { state, report } = result;
    expect(report.perfectBowls).toBe(3);
    expect(report.goalsCompleted.map((g) => g.id)).toContain('shop-perfect');
    // Service alone ends at 3.48 stars; the 0.05-star goal reward crosses the 3.5 gate.
    expect(state.economy.reputation).toBeGreaterThanOrEqual(3.5);
    expect(report.reputation).toBe(state.economy.reputation);
    expect(report.unlocks).toContain('Ramen Bar expansion');
  });

  it('is deterministic by seed', () => {
    const run = (seed: number) =>
      autopilotRun(createSimState(seed, 'cart'), 30).map((s) => [
        s.goals,
        s.lastReport?.goalsCompleted,
      ]);
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
  });

  it('completes at least one goal in every tier over 35 days, on every seed', () => {
    for (const seed of SEEDS) {
      const history = autopilotRun(createSimState(seed, 'cart'), 35);
      const done = new Set(
        history.flatMap((s) => s.lastReport?.goalsCompleted.map((g) => g.id) ?? []),
      );
      for (const tier of SHOP_TIERS) {
        const hit = goalsForTier(tier.id).some((g) => done.has(g.id));
        expect(hit, `seed ${seed} tier ${tier.id}`).toBe(true);
      }
      expect(history.at(-1)!.goals.opening).toBe('pending');
    }
  });

  it('keeps every tier-up day within +/-1 of the pre-goal curve', () => {
    for (const seed of SEEDS) {
      const history = autopilotRun(createSimState(seed, 'cart'), 35);
      UPGRADE_TIERS.forEach((tier, i) => {
        const day = history.findIndex((s) => s.tierId === tier) + 1;
        const base = BASELINE_TIER_DAYS[seed]![i]!;
        expect(
          Math.abs(day - base),
          `seed ${seed} ${tier}: day ${day} vs ${base}`,
        ).toBeLessThanOrEqual(1);
      });
    }
  });
});

describe('goals in a save', () => {
  it('round-trips through serialize and parse', () => {
    const state = autopilotRun(createSimState(1337, 'cart'), 8).at(-1)!;
    expect(state.goals.completed.length).toBeGreaterThan(0);
    expect(parseSave(serializeSave(createSave(state, 'x'))).state.goals).toEqual(state.goals);
    expect(createGoals()).toEqual({ completed: [], opening: 'locked', bowlsServed: 0 });
  });
});
