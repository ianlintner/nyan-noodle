import { settleDay } from './day';
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
import { STOCK_BOWL_COST } from './prep';
import type { RecipeId } from './recipes';
import type { SimState } from './state';

function apply(state: SimState, result: { ok: boolean; state?: SimState }): SimState {
  return result.ok && result.state ? result.state : state;
}

/**
 * Simple reference player used by the headless curve and the balance tests: opens every
 * dish it owns, keeps stock topped up, and spends coins on the cheapest useful upgrade.
 */
export function autopilotPrep(start: SimState): SimState {
  let s = start;
  // Spend before buying stock so the shop never goes broke from upgrades.
  const reserve = 40;
  // Once the next tier's star gate is open, hoard coins for it.
  const gate = upgradeInfo(s);
  const saving = gate !== null && s.economy.reputation >= gate.reputation;
  const afford = (cost: number): boolean => !saving && s.economy.fishCoins - cost >= reserve;

  const up = upgradeInfo(s);
  if (up && s.economy.fishCoins >= up.cost + reserve && s.economy.reputation >= up.reputation) {
    s = apply(s, upgradeTier(s));
  }
  for (const id of Object.keys(RECIPE_UNLOCKS) as RecipeId[]) {
    if (!s.unlockedRecipes.includes(id) && afford(RECIPE_UNLOCKS[id].cost)) {
      s = apply(s, unlockRecipe(s, id));
    }
  }
  for (const id of s.unlockedRecipes) {
    if (!s.menu.includes(id)) s = apply(s, toggleMenu(s, id));
  }
  if (afford(60)) s = apply(s, hireStaff(s));
  for (const def of EQUIPMENT) {
    if (afford(def.costs[s.equipment[def.id]] ?? 9999)) s = apply(s, buyEquipment(s, def.id));
  }
  for (const id of s.unlockedRecipes) {
    if (s.mastery[id] < MASTERY_MAX && afford(30 * (s.mastery[id] + 1))) {
      s = apply(s, trainMastery(s, id));
    }
  }
  for (const member of s.staff.roster) {
    if (afford(40 * member.level)) s = apply(s, levelStaff(s, member.id));
  }
  const wanted = Math.max(0, 14 + s.staff.roster.length * 6 - s.stock);
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
