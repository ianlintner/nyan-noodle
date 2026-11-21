import { describe, expect, it } from 'vitest';
import { createCustomer } from './customers';
import { generateOrder } from './orders';
import { RECIPES } from './recipes';
import type { RecipeId, ToppingId } from './recipes';
import { createRng } from './rng';

/** An rng that is deterministic but walks through enough seeds to sample all paths. */
function priceFn(_recipeId: RecipeId, extras: readonly ToppingId[], rep: number): number {
  return 0 + extras.length + rep; // decode extras.length from the price for assertions
}

describe('generateOrder -> pickExtras', () => {
  it('never offers a default topping as an extra', () => {
    // Force the customer to like every topping and use a seed sweep so the chance roll
    // can never hide a default topping behind a low roll.
    for (let seed = 0; seed < 60; seed++) {
      const rng = createRng(seed);
      for (const recipeId of Object.keys(RECIPES) as RecipeId[]) {
        const customer = createCustomer(
          1,
          'tabby',
          { recipeOrder: [recipeId], likedToppings: [...RECIPES[recipeId].availableToppings] },
          30,
        );
        const order = generateOrder(1, customer, 1, priceFn, rng);
        for (const extra of order.extraToppings) {
          expect(RECIPES[recipeId].defaultToppings).not.toContain(extra);
        }
      }
    }
  });
});
