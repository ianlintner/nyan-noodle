import { createEconomy } from './economy';
import type { Economy } from './economy';
import { createClock } from './clock';
import type { DayClock } from './clock';
import { createStaffModel } from './staff';
import type { StaffModel } from './staff';
import type { ShopTierId } from './shop';
import type { RecipeId } from './recipes';
import { STARTING_RECIPES } from './recipes';
import type { CatCustomer } from './customers';
import type { Order } from './orders';

export interface DayReport {
  readonly day: number;
  readonly customersServed: number;
  readonly customersLost: number;
  readonly revenue: number;
  readonly costs: number;
  /** Net Fish Coins change for the day. */
  readonly profit: number;
  readonly reputation: number;
}

/** The full serializable sim state. Every value is JSON-safe. */
export interface SimState {
  readonly version: number;
  readonly seed: number;
  readonly clock: DayClock;
  readonly economy: Economy;
  readonly tierId: ShopTierId;
  readonly unlockedRecipes: readonly RecipeId[];
  readonly staff: StaffModel;
  readonly regulars: readonly CatCustomer[];
  /** In-flight orders during the current service phase. */
  readonly activeOrders: readonly Order[];
  readonly lastReport: DayReport | null;
  /** Cumulative per-day revenue for the headless curve. */
  readonly revenueHistory: readonly number[];
}

export const SIM_VERSION = 1;

export function createSimState(seed: number, tierId: ShopTierId): SimState {
  return {
    version: SIM_VERSION,
    seed,
    clock: createClock(),
    economy: createEconomy(),
    tierId,
    unlockedRecipes: STARTING_RECIPES,
    staff: createStaffModel(),
    regulars: [],
    activeOrders: [],
    lastReport: null,
    revenueHistory: [],
  };
}
