import { RECIPES } from './recipes';
import type { RecipeId, ToppingId } from './recipes';
import type { CatCustomer } from './customers';
import type { Rng } from './rng';

export interface Order {
  readonly id: number;
  readonly customerId: number;
  readonly recipeId: RecipeId;
  /** Extra toppings the customer requested (beyond defaults). */
  readonly extraToppings: readonly ToppingId[];
  /** Full price charged for the order. */
  readonly price: number;
  /** Ticks remaining before the customer leaves unhappy. */
  readonly patienceRemaining: number;
}

/** Demand: expected number of customers for a day given tier and reputation. */
export function dailyDemand(tierDemandMultiplier: number, reputation: number, rng: Rng): number {
  const base = 6 + reputation * 1.5;
  // ±1 jitter keeps the curve organic but stays seed-deterministic.
  const jitter = rng.int(-1, 1);
  return Math.max(1, Math.round(base * tierDemandMultiplier) + jitter);
}

function pickRecipe(customer: CatCustomer, rng: Rng): RecipeId {
  for (const id of customer.preferences.recipeOrder) {
    // 80% of the time the customer orders their top available preference.
    if (rng.next() < 0.8) return id;
  }
  return rng.pick(customer.preferences.recipeOrder);
}

function pickExtras(customer: CatCustomer, recipeId: RecipeId, rng: Rng): ToppingId[] {
  const recipe = RECIPES[recipeId];
  const extras: ToppingId[] = [];
  for (const topping of recipe.availableToppings) {
    // Default toppings are already on the bowl; only offer the rest as extras so the
    // assembly sequence stays within the supported control positions.
    if (recipe.defaultToppings.includes(topping)) continue;
    const liked = customer.preferences.likedToppings.includes(topping);
    const chance = liked ? 0.5 : 0.15;
    if (rng.next() < chance) extras.push(topping);
  }
  return extras;
}

/**
 * Generate an order for a customer at the current price/reputation level.
 * Deterministic given the same `rng` stream and inputs.
 */
export function generateOrder(
  id: number,
  customer: CatCustomer,
  reputation: number,
  priceFn: (recipeId: RecipeId, extras: readonly ToppingId[], reputation: number) => number,
  rng: Rng,
): Order {
  const recipeId = pickRecipe(customer, rng);
  const extraToppings = pickExtras(customer, recipeId, rng);
  const price = priceFn(recipeId, extraToppings, reputation);
  return {
    id,
    customerId: customer.id,
    recipeId,
    extraToppings,
    price,
    patienceRemaining: customer.patience,
  };
}
