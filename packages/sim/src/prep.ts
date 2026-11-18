import { RECIPES } from './recipes';
import type { RecipeId } from './recipes';
import { MASTERY_PRICE_PER_LEVEL } from './progression';
import type { ActionResult } from './progression';
import type { SimState } from './state';

export const STOCK_BOWL_COST = 3;
export const STOCK_CAP = 40;
export const PRICE_STEP = 0.1;
export const PRICE_ADJUST_MIN = -3;
export const PRICE_ADJUST_MAX = 3;

/** Menu actually served: owned and switched on (never empty). */
export function effectiveMenu(state: SimState): readonly RecipeId[] {
  const on = state.menu.filter((id) => state.unlockedRecipes.includes(id));
  return on.length > 0 ? on : state.unlockedRecipes.slice(0, 1);
}

/** Sale price of one plain bowl: list price x reputation x mastery x price step. */
export function salePrice(state: SimState, id: RecipeId): number {
  const rep = 1 + Math.min(state.economy.reputation, 5) * 0.02;
  const mastery = 1 + state.mastery[id] * MASTERY_PRICE_PER_LEVEL;
  const step = 1 + state.priceAdjust[id] * PRICE_STEP;
  return Math.max(1, Math.round(RECIPES[id].basePrice * rep * mastery * step));
}

export function toggleMenu(state: SimState, id: RecipeId): ActionResult {
  if (!state.unlockedRecipes.includes(id)) return { ok: false, reason: 'not-owned' };
  if (state.menu.includes(id)) {
    if (state.menu.length <= 1) return { ok: false, reason: 'last-recipe' };
    return { ok: true, state: { ...state, menu: state.menu.filter((m) => m !== id) } };
  }
  return { ok: true, state: { ...state, menu: [...state.menu, id] } };
}

export function adjustPrice(state: SimState, id: RecipeId, delta: number): ActionResult {
  if (!state.unlockedRecipes.includes(id)) return { ok: false, reason: 'not-owned' };
  const next = Math.min(
    PRICE_ADJUST_MAX,
    Math.max(PRICE_ADJUST_MIN, state.priceAdjust[id] + delta),
  );
  return { ok: true, state: { ...state, priceAdjust: { ...state.priceAdjust, [id]: next } } };
}

/** Buy up to `bowls` of stock (clamped by the cap and what the player can afford). */
export function buyStock(state: SimState, bowls: number): ActionResult {
  const room = STOCK_CAP - state.stock;
  const affordable = Math.floor(state.economy.fishCoins / STOCK_BOWL_COST);
  const n = Math.min(bowls, room, affordable);
  if (room <= 0) return { ok: false, reason: 'maxed' };
  if (n <= 0) return { ok: false, reason: 'need-coins' };
  const cost = n * STOCK_BOWL_COST;
  return {
    ok: true,
    state: {
      ...state,
      stock: state.stock + n,
      stockSpent: state.stockSpent + cost,
      economy: { ...state.economy, fishCoins: state.economy.fishCoins - cost },
    },
  };
}
