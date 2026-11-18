import { defaultItems } from './layoutRules';
import { STARTING_RECIPES } from './recipes';
import { SIM_VERSION, STARTING_STOCK, zeroByRecipe, zeroEquipment } from './state';
import type { ShopTierId } from './shop';
import type { SimState } from './state';

/** A loosely-typed state at some older version. */
type Raw = Record<string, unknown>;
export type Migration = (raw: Raw) => Raw;

/**
 * Migration hook: `MIGRATIONS[n]` upgrades a state at version `n` to `n + 1`.
 * When SIM_VERSION is bumped, add the next step here and a fixture test in save.test.ts.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // v1 -> v2: build mode added furniture items.
  1: (raw) => {
    const tier = (raw.tierId as ShopTierId | undefined) ?? 'cart';
    const items = defaultItems(tier);
    return { ...raw, version: 2, items, nextItemId: items.length };
  },
  // v2 -> v3: day-loop meta (menu, prices, stock, mastery, equipment, richer report).
  2: (raw) => {
    const unlocked = (raw.unlockedRecipes as string[] | undefined) ?? [...STARTING_RECIPES];
    const report = raw.lastReport as Raw | null | undefined;
    return {
      ...raw,
      version: 3,
      menu: unlocked,
      priceAdjust: zeroByRecipe(),
      stock: STARTING_STOCK,
      stockSpent: 0,
      mastery: zeroByRecipe(),
      equipment: zeroEquipment(),
      lastReport: report
        ? {
            tips: 0,
            complaints: report.customersLost ?? 0,
            complaintKinds: {
              queue: report.customersLost ?? 0,
              'sold-out': 0,
              'too-slow': 0,
              pricey: 0,
            },
            reputationDelta: 0,
            unlocks: [],
            stockLeft: STARTING_STOCK,
            ...report,
          }
        : null,
    };
  },
};

export class MigrationError extends Error {}

/** Run every step from the state's own version up to SIM_VERSION. */
export function migrateState(raw: unknown): SimState {
  if (typeof raw !== 'object' || raw === null) throw new MigrationError('state is not an object');
  let current = raw as Raw;
  const declared = current.version;
  if (typeof declared !== 'number' || !Number.isInteger(declared) || declared < 1) {
    throw new MigrationError(`bad state version: ${String(declared)}`);
  }
  let version: number = declared;
  if (version > SIM_VERSION) {
    throw new MigrationError(`save is from a newer game (v${version} > v${SIM_VERSION})`);
  }
  while (version < SIM_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new MigrationError(`no migration from v${version}`);
    current = step(current);
    version = current.version as number;
  }
  return validateState(current);
}

function isRecord(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Shape check for the fields the game dereferences on load. */
export function validateState(raw: Raw): SimState {
  const need = (ok: boolean, what: string): void => {
    if (!ok) throw new MigrationError(`invalid save: ${what}`);
  };
  need(typeof raw.seed === 'number', 'seed');
  need(isRecord(raw.clock) && typeof raw.clock.day === 'number', 'clock');
  need(
    isRecord(raw.economy) &&
      typeof raw.economy.fishCoins === 'number' &&
      typeof raw.economy.reputation === 'number',
    'economy',
  );
  need(raw.tierId === 'cart' || raw.tierId === 'stall' || raw.tierId === 'small-shop', 'tierId');
  need(Array.isArray(raw.items), 'items');
  need(Array.isArray(raw.unlockedRecipes) && raw.unlockedRecipes.length > 0, 'unlockedRecipes');
  need(Array.isArray(raw.menu), 'menu');
  need(isRecord(raw.mastery) && isRecord(raw.priceAdjust) && isRecord(raw.equipment), 'meta');
  need(typeof raw.stock === 'number', 'stock');
  need(isRecord(raw.staff) && Array.isArray(raw.staff.roster), 'staff');
  need(Array.isArray(raw.revenueHistory), 'revenueHistory');
  return raw as unknown as SimState;
}
