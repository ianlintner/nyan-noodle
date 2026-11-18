import type { RecipeId, ToppingId } from './recipes';

export type CoatId = 'tabby' | 'grey' | 'black' | 'white' | 'sakura';

export interface CustomerPreferences {
  /** Recipe ids ordered most-to-least preferred. */
  readonly recipeOrder: readonly RecipeId[];
  /** Toppings the customer particularly likes (bonus tip). */
  readonly likedToppings: readonly ToppingId[];
}

/** Serialized customer state; every field is plain JSON-safe data. */
export interface CatCustomer {
  readonly id: number;
  readonly coat: CoatId;
  /** Total patience budget in ticks; decreases while waiting to be served. */
  readonly patience: number;
  readonly preferences: CustomerPreferences;
  /** True once the customer has been served at least once (becomes a regular). */
  readonly isRegular: boolean;
  /** Number of visits, mirrors regular progression. */
  readonly visits: number;
}

export interface Coat {
  readonly name: string;
  /** Base patience modifier (calmer coats wait longer). */
  readonly patienceModifier: number;
}

export const COATS: Readonly<Record<CoatId, Coat>> = {
  tabby: { name: 'Tabby', patienceModifier: 1.0 },
  grey: { name: 'Grey', patienceModifier: 1.15 },
  black: { name: 'Black', patienceModifier: 0.9 },
  white: { name: 'White', patienceModifier: 1.05 },
  sakura: { name: 'Sakura', patienceModifier: 1.25 },
};

export const COAT_IDS: readonly CoatId[] = ['tabby', 'grey', 'black', 'white', 'sakura'];

export function createCustomer(
  id: number,
  coat: CoatId,
  preferences: CustomerPreferences,
  basePatience: number,
  visits = 0,
): CatCustomer {
  const patience = Math.max(1, Math.round(basePatience * (COATS[coat]?.patienceModifier ?? 1)));
  return {
    id,
    coat,
    patience,
    preferences,
    isRegular: visits > 0,
    visits,
  };
}

/** Regulars are more patient (they know the shop); modeled as a flat bonus. */
export function regularPatienceBonus(customer: CatCustomer): number {
  return customer.isRegular ? 2 : 0;
}
