import { RECIPES, TOPPINGS } from './recipes';
import type { RecipeId, ToppingId } from './recipes';

export interface Economy {
  /** Fish Coins balance (soft currency). */
  readonly fishCoins: number;
  /** Lifetime Fish Coins earned (for reporting). */
  readonly lifetimeEarned: number;
  /** Reputation Stars, the gate for shop tiers. */
  readonly reputation: number;
}

export const FISH_COINS = 'Fish Coins';
export const REPUTATION_STARS = 'Reputation Stars';

/** Maximum reputation in MVP (caps Star display). */
export const MAX_REPUTATION = 5;

export function createEconomy(fishCoins = 40, reputation = 0): Economy {
  return { fishCoins, lifetimeEarned: fishCoins, reputation };
}

/**
 * Price of a bowl: base price scaled slightly by reputation (busier shops charge
 * a little more) plus each extra topping's cost.
 */
export function bowlPrice(
  recipeId: RecipeId,
  extraToppings: readonly ToppingId[],
  reputation: number,
): number {
  const recipe = RECIPES[recipeId];
  const reputationScale = 1 + Math.min(reputation, MAX_REPUTATION) * 0.02;
  const toppingSum = extraToppings.reduce((sum, t) => sum + (TOPPINGS[t]?.cost ?? 0), 0);
  return Math.round((recipe.basePrice + toppingSum) * reputationScale);
}

/** Cost to the shop of serving a bowl (broth + noodles + extra toppings). */
export function bowlCost(recipeId: RecipeId, extraToppings: readonly ToppingId[]): number {
  const recipe = RECIPES[recipeId];
  const toppingSum = extraToppings.reduce((sum, t) => sum + (TOPPINGS[t]?.cost ?? 0), 0);
  return recipe.baseCost + toppingSum;
}

/** Reputation gained from a satisfied customer, scaled down as reputation rises. */
export function reputationGain(current: number): number {
  const remaining = MAX_REPUTATION - current;
  const base = remaining > 2 ? 0.25 : remaining > 0 ? 0.1 : 0;
  return Math.max(0, base);
}
