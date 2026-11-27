import type { ShopTierId } from './shop';

/** Extra patience (in beats) a single greet gives a waiting cat. */
export const GREET_PATIENCE_BEATS = 18;
/** A cat can be soothed at most this many times, so one VIP cannot wait forever. */
export const MAX_GREETS_PER_CAT = 1;
/** Share of a bowl's tip added on top when the owner collects its coin pop. */
export const COLLECT_BONUS = 0.5;
/** Collect-combo steps beyond the first that still add to the multiplier. */
export const COLLECT_COMBO_CAP = 4;
const COLLECT_COMBO_STEP = 0.25;

/** Greets the owner can hand out per service day, rising with the shop tier. */
export const GREET_BUDGET_BY_TIER: Readonly<Record<ShopTierId, number>> = {
  cart: 3,
  stall: 4,
  'small-shop': 5,
  'ramen-bar': 6,
  'grand-hall': 8,
};

export function greetBudget(tier: ShopTierId): number {
  return GREET_BUDGET_BY_TIER[tier];
}

/** Multiplier for the Nth consecutive collected tip (1 = no combo yet). Named apart from the cook-streak combo. */
export function collectMultiplier(collectStreak: number): number {
  return 1 + Math.min(Math.max(collectStreak - 1, 0), COLLECT_COMBO_CAP) * COLLECT_COMBO_STEP;
}

/** Extra Fish Coins for collecting a pop worth `tip` at the given collect streak (at least 1). */
export function collectBonus(tip: number, collectStreak: number): number {
  return Math.max(1, Math.round(tip * COLLECT_BONUS * collectMultiplier(collectStreak)));
}

/** Tracks greets spent today; day-transient (never saved). */
export interface GreetLedger {
  readonly byCat: ReadonlyMap<number, number>;
  readonly spent: number;
}

export const NO_GREETS: GreetLedger = { byCat: new Map(), spent: 0 };

/** Try to greet `customerId`; returns the updated ledger or null if the budget/cat cap is hit. */
export function spendGreet(
  ledger: GreetLedger,
  tier: ShopTierId,
  customerId: number,
): GreetLedger | null {
  const had = ledger.byCat.get(customerId) ?? 0;
  if (ledger.spent >= greetBudget(tier) || had >= MAX_GREETS_PER_CAT) return null;
  const byCat = new Map(ledger.byCat);
  byCat.set(customerId, had + 1);
  return { byCat, spent: ledger.spent + 1 };
}
