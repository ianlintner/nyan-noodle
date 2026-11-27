import { playerCapacity, settleDay, staffCapacity } from './day';
import type { DayResult } from './day';
import { buyStock, toggleMenu } from './prep';
import {
  EQUIPMENT,
  MASTERY_MAX,
  RECIPE_UNLOCKS,
  buyEquipment,
  hireStaff,
  levelStaff,
  trainMastery,
  unlockRecipe,
} from './progression';
import { planService } from './service';
import { upgradeInfo, upgradeTier } from './build';
import { STOCK_BOWL_COST, stockCap } from './prep';
import type { RecipeId } from './recipes';
import type { EquipmentId, SimState } from './state';

import { AUTOPILOT_RESERVE, SAVE_AHEAD_STARS } from './balance';
import { furnishToCapacity } from './furnish';

export { AUTOPILOT_RESERVE, SAVE_AHEAD_STARS };

function equipmentCost(id: EquipmentId, s: SimState): number {
  const def = EQUIPMENT.find((e) => e.id === id);
  return def?.costs[s.equipment[id]] ?? Number.POSITIVE_INFINITY;
}

function apply(state: SimState, result: { ok: boolean; state?: SimState }): SimState {
  return result.ok && result.state ? result.state : state;
}

/**
 * Coins the autopilot holds back for stock in `s`: enough to fill the kitchen's cooking
 * capacity (capped by the pantry) on top of what is already in stock.
 */
export function stockReserve(s: SimState): number {
  const target = Math.min(playerCapacity(s) + staffCapacity(s), stockCap(s.tierId));
  return Math.max(AUTOPILOT_RESERVE, Math.max(0, target - s.stock) * STOCK_BOWL_COST);
}

/**
 * Apply a purchase only if the state it leaves behind can still afford its own stock.
 * Hires and burner upgrades raise capacity, so the reserve is checked after the change.
 */
function applyGuarded(state: SimState, result: { ok: boolean; state?: SimState }): SimState {
  const next = apply(state, result);
  return next !== state && next.economy.fishCoins >= stockReserve(next) ? next : state;
}

/**
 * Simple reference player used by the headless curve and the balance tests: opens every
 * dish it owns, keeps stock topped up, and spends coins on the cheapest useful upgrade.
 */
export function autopilotPrep(start: SimState): SimState {
  let s = start;
  // Spend before buying stock, but always keep enough back to stock a full kitchen: a
  // big venue that spends its stock money on upgrades sells out before lunch. Every
  // purchase is checked against the reserve of the state it produces (`applyGuarded`).
  const up = upgradeInfo(s);
  if (up && s.economy.fishCoins >= up.cost && s.economy.reputation >= up.reputation) {
    s = applyGuarded(s, upgradeTier(s));
  }
  // A new tier carries the old layout over; fill the new floor before anything else.
  // Furnishing does not change cooking capacity, so the current reserve stays valid.
  s = furnishToCapacity(s, Math.max(0, s.economy.fishCoins - stockReserve(s)));

  // The kitchen turned cats away yesterday: more cooking capacity pays for itself, so it
  // comes before saving for the next tier.
  const tooSlow = (s.lastReport?.complaintKinds['too-slow'] ?? 0) > 0;
  if (tooSlow) {
    if (Number.isFinite(equipmentCost('burner', s))) s = applyGuarded(s, buyEquipment(s, 'burner'));
    s = applyGuarded(s, hireStaff(s));
  }

  // Once the next tier's star gate is (nearly) open, hoard coins for it.
  const gate = upgradeInfo(s);
  const saving = gate !== null && s.economy.reputation >= gate.reputation - SAVE_AHEAD_STARS;
  const buy = (result: { ok: boolean; state?: SimState }): void => {
    if (!saving) s = applyGuarded(s, result);
  };

  for (const id of Object.keys(RECIPE_UNLOCKS) as RecipeId[]) {
    if (!s.unlockedRecipes.includes(id)) buy(unlockRecipe(s, id));
  }
  for (const id of s.unlockedRecipes) {
    if (!s.menu.includes(id)) s = apply(s, toggleMenu(s, id));
  }
  buy(hireStaff(s));
  for (const def of EQUIPMENT) buy(buyEquipment(s, def.id));
  for (const id of s.unlockedRecipes) {
    if (s.mastery[id] < MASTERY_MAX) buy(trainMastery(s, id));
  }
  for (const member of s.staff.roster) buy(levelStaff(s, member.id));
  // Stock what the kitchen can actually cook today (plus a small buffer).
  const wanted = Math.max(0, playerCapacity(s) + staffCapacity(s) + 2 - s.stock);
  const bowls = Math.min(wanted, Math.floor(s.economy.fishCoins / STOCK_BOWL_COST));
  return bowls > 0 ? apply(s, buyStock(s, bowls)) : s;
}

/** Prep, play one auto-day and settle it. */
export function autopilotDay(state: SimState): DayResult {
  const prepared = autopilotPrep(state);
  return settleDay(prepared, planService(prepared));
}

export function autopilotRun(initial: SimState, days: number): SimState[] {
  const history: SimState[] = [];
  let state = initial;
  for (let d = 0; d < days; d++) {
    state = autopilotDay(state).state;
    history.push(state);
  }
  return history;
}
