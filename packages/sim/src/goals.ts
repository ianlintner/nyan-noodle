import type { DayReport, SimState } from './state';
import type { ShopTierId } from './shop';
import { SHOP_TIERS } from './shop';
import { MAX_REPUTATION } from './economy';

/**
 * Goal ladder: three small objectives per shop tier, so the player always has a next thing to
 * chase. Pure and deterministic: a goal is a threshold on state the sim already tracks (tier,
 * stars, regulars, equipment) or on one day's stats (served / Perfect bowls). Completing one pays
 * a small reward once. Rewards are kept far below the tier gates in `balance.ts` so the
 * reference autopilot's tier-up days do not move (`balance.test.ts`).
 */

/** Bowl quality that counts as "Perfect" for goals (same bar as the top reputation band). */
export const PERFECT_QUALITY = 90;

export type GoalKind = 'served-day' | 'perfect-day' | 'stars' | 'regulars' | 'equipment';

export interface GoalDef {
  readonly id: string;
  readonly tier: ShopTierId;
  readonly kind: GoalKind;
  readonly target: number;
  readonly title: string;
  /** Fish Coins paid on completion. */
  readonly rewardCoins: number;
  /** Reputation Stars paid on completion (0 for most goals). */
  readonly rewardStars: number;
}

/** Where the Grand Opening celebration is: not reached, waiting to be shown, or already shown. */
export type OpeningStatus = 'locked' | 'pending' | 'seen';

export interface GoalsState {
  /** Ids of goals already paid out (each pays once, ever). */
  readonly completed: readonly string[];
  readonly opening: OpeningStatus;
  /** Bowls served over the whole save, for the Grand Opening stats. */
  readonly bowlsServed: number;
}

/** One goal finished by a day settle, as recorded on the DayReport. */
export interface GoalCompletion {
  readonly id: string;
  readonly title: string;
  readonly coins: number;
  readonly stars: number;
}

/** What one day's service did, for the per-day goal kinds. */
export interface DayStats {
  readonly served: number;
  readonly perfectBowls: number;
}

const goal = (
  id: string,
  tier: ShopTierId,
  kind: GoalKind,
  target: number,
  title: string,
  rewardCoins: number,
  rewardStars = 0,
): GoalDef => ({ id, tier, kind, target, title, rewardCoins, rewardStars });

/** Three objectives per tier, easiest first. */
export const GOALS: readonly GoalDef[] = [
  goal('cart-served', 'cart', 'served-day', 6, 'Serve 6 cats in one day', 5),
  goal('cart-regulars', 'cart', 'regulars', 3, 'Win 3 regulars', 5),
  goal('cart-stars', 'cart', 'stars', 0.5, 'Reach 0.5 stars', 10),

  goal('stall-served', 'stall', 'served-day', 12, 'Serve 12 cats in one day', 10),
  goal('stall-regulars', 'stall', 'regulars', 10, 'Seat 10 regulars', 10),
  goal('stall-gear', 'stall', 'equipment', 1, 'Buy your first equipment', 15),

  goal('shop-perfect', 'small-shop', 'perfect-day', 3, 'Serve 3 Perfect bowls in a day', 15, 0.05),
  goal('shop-stars', 'small-shop', 'stars', 3, 'Reach 3 stars', 15),
  goal('shop-regulars', 'small-shop', 'regulars', 25, 'Seat 25 regulars', 20),

  goal('bar-perfect', 'ramen-bar', 'perfect-day', 8, 'Serve 8 Perfect bowls in a day', 30, 0.05),
  goal('bar-gear', 'ramen-bar', 'equipment', 6, 'Own 6 equipment levels', 30),
  goal('bar-regulars', 'ramen-bar', 'regulars', 40, 'Seat 40 regulars', 40),

  goal('hall-perfect', 'grand-hall', 'perfect-day', 15, 'Serve 15 Perfect bowls in a day', 75),
  goal('hall-regulars', 'grand-hall', 'regulars', 60, 'Seat 60 regulars', 75),
  goal('hall-stars', 'grand-hall', 'stars', MAX_REPUTATION, 'Earn a full 5 stars', 100),
];

export function createGoals(): GoalsState {
  return { completed: [], opening: 'locked', bowlsServed: 0 };
}

/** The goals for a tier, in display order. */
export function goalsForTier(tier: ShopTierId): readonly GoalDef[] {
  return GOALS.filter((g) => g.tier === tier);
}

/** Sum of every equipment level the shop owns. */
export function equipmentLevels(state: SimState): number {
  return Object.values(state.equipment).reduce((sum, n) => sum + n, 0);
}

/** Current value of a goal's measure. Per-day kinds read the given day's stats. */
export function goalValue(def: GoalDef, state: SimState, stats: DayStats | null): number {
  switch (def.kind) {
    case 'served-day':
      return stats?.served ?? 0;
    case 'perfect-day':
      return stats?.perfectBowls ?? 0;
    case 'stars':
      return Math.min(state.economy.reputation, MAX_REPUTATION);
    case 'regulars':
      return state.regulars.length;
    case 'equipment':
      return equipmentLevels(state);
  }
}

/** Stats of the last settled day, as shown on Prep ("best so far" for per-day goals). */
export function lastDayStats(report: DayReport | null): DayStats | null {
  return report ? { served: report.customersServed, perfectBowls: report.perfectBowls } : null;
}

export interface GoalStatus {
  readonly def: GoalDef;
  readonly done: boolean;
  /** Progress toward the target, clamped to the target. */
  readonly value: number;
}

/** The current tier's goals with their progress; the Prep panel renders this. */
export function currentGoals(state: SimState): readonly GoalStatus[] {
  const stats = lastDayStats(state.lastReport);
  return goalsForTier(state.tierId).map((def) => {
    const done = state.goals.completed.includes(def.id);
    const value = done ? def.target : Math.min(goalValue(def, state, stats), def.target);
    return { def, done, value };
  });
}

/** The top tier at full stars: the shop has earned its Grand Opening. */
export function atGrandOpening(state: SimState): boolean {
  const top = SHOP_TIERS[SHOP_TIERS.length - 1];
  return state.tierId === top?.id && state.economy.reputation >= MAX_REPUTATION;
}

/**
 * Arm the opening once the top tier is at full stars. Called both when the purchase first
 * satisfies the condition and on settle: a later bad day must not erase a celebration already
 * earned, and a goal's star reward can be what crosses the threshold.
 */
export function armGrandOpening(state: SimState): SimState {
  if (state.goals.opening !== 'locked' || !atGrandOpening(state)) return state;
  return { ...state, goals: { ...state.goals, opening: 'pending' } };
}

export interface GoalResult {
  readonly state: SimState;
  readonly completions: readonly GoalCompletion[];
}

/**
 * Pay out every not-yet-completed goal of the current tier whose target is met, and arm the
 * Grand Opening the first time the top tier reaches full stars. Called by `settleDay` on the
 * post-day state with that day's stats; calling it again changes nothing (each goal pays once).
 */
export function evaluateGoals(state: SimState, stats: DayStats): GoalResult {
  const completions: GoalCompletion[] = [];
  for (const def of goalsForTier(state.tierId)) {
    if (state.goals.completed.includes(def.id)) continue;
    if (goalValue(def, state, stats) < def.target) continue;
    completions.push({
      id: def.id,
      title: def.title,
      coins: def.rewardCoins,
      stars: def.rewardStars,
    });
  }
  const coins = completions.reduce((sum, c) => sum + c.coins, 0);
  const stars = completions.reduce((sum, c) => sum + c.stars, 0);
  let next: SimState = {
    ...state,
    economy: {
      ...state.economy,
      fishCoins: state.economy.fishCoins + coins,
      lifetimeEarned: state.economy.lifetimeEarned + coins,
      reputation: Math.min(
        MAX_REPUTATION,
        Math.round((state.economy.reputation + stars) * 100) / 100,
      ),
    },
    goals: {
      ...state.goals,
      completed: [...state.goals.completed, ...completions.map((c) => c.id)],
      bowlsServed: state.goals.bowlsServed + stats.served,
    },
  };
  next = armGrandOpening(next);
  return { state: next, completions };
}

/** The player has seen the Grand Opening screen; it never shows again for this save. */
export function acknowledgeOpening(state: SimState): SimState {
  if (state.goals.opening !== 'pending') return state;
  return { ...state, goals: { ...state.goals, opening: 'seen' } };
}

/** Whether the Grand Opening screen is waiting to be shown. */
export function openingPending(state: SimState): boolean {
  return state.goals.opening === 'pending';
}

/** Stats for the Grand Opening screen. */
export interface OpeningStats {
  readonly days: number;
  readonly bowlsServed: number;
  readonly bestRegular: { readonly name: string; readonly affection: number } | null;
}

/** Days played, bowls served over the save, and the most-loved regular (ties: more visits). */
export function openingStats(state: SimState): OpeningStats {
  const best = state.regulars.reduce<SimState['regulars'][number] | null>(
    (top, r) =>
      top === null ||
      r.affection > top.affection ||
      (r.affection === top.affection && r.visits > top.visits)
        ? r
        : top,
    null,
  );
  return {
    days: state.clock.day - 1,
    bowlsServed: state.goals.bowlsServed,
    bestRegular: best ? { name: best.name, affection: best.affection } : null,
  };
}
