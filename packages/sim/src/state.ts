import { createEconomy } from './economy';
import type { Economy } from './economy';
import { createClock } from './clock';
import type { DayClock } from './clock';
import { createStaffModel } from './staff';
import type { StaffModel } from './staff';
import type { ShopTierId } from './shop';
import { defaultItems } from './layoutRules';
import type { BuildItem } from './layoutRules';
import type { RecipeId } from './recipes';
import { STARTING_RECIPES } from './recipes';
import type { Order } from './orders';
import type { Regular } from './regulars';

export type ComplaintKind = 'queue' | 'sold-out' | 'too-slow' | 'pricey';

export interface DayReport {
  readonly day: number;
  readonly customersServed: number;
  readonly customersLost: number;
  /** Bowl sales only (tips are reported separately). */
  readonly revenue: number;
  /** Tips, rush and combo bonuses. */
  readonly tips: number;
  /** Wages plus the stock bought since the previous report. */
  readonly costs: number;
  /** Net Fish Coins change for the day (revenue + tips - costs). */
  readonly profit: number;
  readonly complaints: number;
  readonly complaintKinds: Readonly<Record<ComplaintKind, number>>;
  /** Reputation after the day, and the change it made. */
  readonly reputation: number;
  readonly reputationDelta: number;
  /** Human-readable things that became available today (stars crossed). */
  readonly unlocks: readonly string[];
  readonly stockLeft: number;
}

export type EquipmentId = 'knives' | 'burner' | 'signboard';

/** The full serializable sim state. Every value is JSON-safe. */
export interface SimState {
  readonly version: number;
  readonly seed: number;
  readonly clock: DayClock;
  readonly economy: Economy;
  readonly tierId: ShopTierId;
  /** Furniture on the interior grid (see build.ts for the rules that change it). */
  readonly items: readonly BuildItem[];
  readonly nextItemId: number;
  /** Recipes the player owns (gated by Reputation Stars in progression.ts). */
  readonly unlockedRecipes: readonly RecipeId[];
  /** Recipes switched on for today's menu (a subset of unlockedRecipes). */
  readonly menu: readonly RecipeId[];
  /** Price step per recipe: each step is +/-10% of the list price. */
  readonly priceAdjust: Readonly<Record<RecipeId, number>>;
  /** Bowls of ingredients on hand; one is used per bowl sold. */
  readonly stock: number;
  /** Coins spent on stock since the last day report. */
  readonly stockSpent: number;
  /** Recipe mastery levels (0 = untrained). */
  readonly mastery: Readonly<Record<RecipeId, number>>;
  readonly equipment: Readonly<Record<EquipmentId, number>>;
  readonly staff: StaffModel;
  readonly regulars: readonly Regular[];
  /** In-flight orders during the current service phase. */
  readonly activeOrders: readonly Order[];
  readonly lastReport: DayReport | null;
  /** Cumulative per-day revenue for the headless curve. */
  readonly revenueHistory: readonly number[];
}

export const SIM_VERSION = 4;
export const STARTING_STOCK = 8;

export function zeroByRecipe(): Record<RecipeId, number> {
  return { shoyu: 0, miso: 0, tonkotsu: 0 };
}

export function zeroEquipment(): Record<EquipmentId, number> {
  return { knives: 0, burner: 0, signboard: 0 };
}

export function createSimState(seed: number, tierId: ShopTierId): SimState {
  const items = defaultItems(tierId);
  return {
    items,
    nextItemId: items.length,
    version: SIM_VERSION,
    seed,
    clock: createClock(),
    economy: createEconomy(),
    tierId,
    unlockedRecipes: STARTING_RECIPES,
    menu: STARTING_RECIPES,
    priceAdjust: zeroByRecipe(),
    stock: STARTING_STOCK,
    stockSpent: 0,
    mastery: zeroByRecipe(),
    equipment: zeroEquipment(),
    staff: createStaffModel(),
    regulars: [],
    activeOrders: [],
    lastReport: null,
    revenueHistory: [],
  };
}
