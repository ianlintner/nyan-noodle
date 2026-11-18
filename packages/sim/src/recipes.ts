export type IngredientId =
  | 'noodles'
  | 'broth-shoyu'
  | 'broth-miso'
  | 'broth-tonkotsu'
  | 'chashu'
  | 'egg'
  | 'nori'
  | 'scallion'
  | 'menma'
  | 'corn';

export type ToppingId = 'chashu' | 'egg' | 'nori' | 'scallion' | 'menma' | 'corn';

export type RecipeId = 'shoyu' | 'miso' | 'tonkotsu';

export interface Ingredient {
  /** Display name. */
  readonly name: string;
  /** Base cost in Fish Coins per unit when restocking. */
  readonly cost: number;
}

export interface Topping {
  readonly name: string;
  /** Base cost per serving. */
  readonly cost: number;
  /** Bonus patience granted to a customer who receives this topping. */
  readonly patienceBonus: number;
}

export interface Recipe {
  readonly id: RecipeId;
  readonly name: string;
  /** Base price before reputation/demand modifiers. */
  readonly basePrice: number;
  /** Base prep cost in Fish Coins per bowl. */
  readonly baseCost: number;
  /** Broth ingredient required. */
  readonly broth: IngredientId;
  /** Toppings included by default (free with the bowl). */
  readonly defaultToppings: readonly ToppingId[];
  /** Toppings a customer can request as extras. */
  readonly availableToppings: readonly ToppingId[];
  /** Base difficulty of cooking (affects staff time later). */
  readonly cookingTime: number;
}

export const INGREDIENTS: Readonly<Record<IngredientId, Ingredient>> = {
  noodles: { name: 'Noodles', cost: 1 },
  'broth-shoyu': { name: 'Shoyu Broth', cost: 2 },
  'broth-miso': { name: 'Miso Broth', cost: 3 },
  'broth-tonkotsu': { name: 'Tonkotsu Broth', cost: 4 },
  chashu: { name: 'Chashu', cost: 3 },
  egg: { name: 'Soft Egg', cost: 2 },
  nori: { name: 'Nori', cost: 1 },
  scallion: { name: 'Scallion', cost: 1 },
  menma: { name: 'Menma', cost: 2 },
  corn: { name: 'Corn', cost: 1 },
};

export const TOPPINGS: Readonly<Record<ToppingId, Topping>> = {
  chashu: { name: 'Chashu', cost: 3, patienceBonus: 2 },
  egg: { name: 'Soft Egg', cost: 2, patienceBonus: 1 },
  nori: { name: 'Nori', cost: 1, patienceBonus: 0 },
  scallion: { name: 'Scallion', cost: 1, patienceBonus: 0 },
  menma: { name: 'Menma', cost: 2, patienceBonus: 1 },
  corn: { name: 'Corn', cost: 1, patienceBonus: 0 },
};

export const RECIPES: Readonly<Record<RecipeId, Recipe>> = {
  shoyu: {
    id: 'shoyu',
    name: 'Shoyu Ramen',
    basePrice: 8,
    baseCost: 4,
    broth: 'broth-shoyu',
    defaultToppings: ['nori', 'scallion'],
    availableToppings: ['chashu', 'egg', 'nori', 'scallion', 'menma', 'corn'],
    cookingTime: 3,
  },
  miso: {
    id: 'miso',
    name: 'Miso Ramen',
    basePrice: 9,
    baseCost: 5,
    broth: 'broth-miso',
    defaultToppings: ['corn', 'scallion'],
    availableToppings: ['chashu', 'egg', 'nori', 'scallion', 'menma', 'corn'],
    cookingTime: 3,
  },
  tonkotsu: {
    id: 'tonkotsu',
    name: 'Tonkotsu Ramen',
    basePrice: 11,
    baseCost: 6,
    broth: 'broth-tonkotsu',
    defaultToppings: ['chashu', 'scallion'],
    availableToppings: ['chashu', 'egg', 'nori', 'scallion', 'menma', 'corn'],
    cookingTime: 4,
  },
};

/** Recipes available from day one. */
export const STARTING_RECIPES: readonly RecipeId[] = ['shoyu', 'miso', 'tonkotsu'];
