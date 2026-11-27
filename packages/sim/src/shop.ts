import { TIER_PRICE_PREMIUM, TIER_UNLOCK } from './balance';

export type ShopTierId = 'cart' | 'stall' | 'small-shop' | 'ramen-bar' | 'grand-hall';

export interface ShopTier {
  readonly id: ShopTierId;
  readonly name: string;
  /** Width x height of the build grid, in tiles. */
  readonly gridWidth: number;
  readonly gridHeight: number;
  /** Number of customer seats. */
  readonly seats: number;
  /** Number of stove/cooking stations. */
  readonly stoves: number;
  /** Fish Coins required to expand into this tier from the previous one. */
  readonly unlockCost: number;
  /** Reputation Stars required to expand into this tier. */
  readonly unlockReputation: number;
  /** Daily customer demand multiplier relative to the lowest tier. */
  readonly demandMultiplier: number;
  /** Bowl price multiplier: a bigger venue charges more for the same dish. */
  readonly pricePremium: number;
  /** Extra multiplier applied to decor appeal *above* the tier's starter decor. */
  readonly decorMultiplier: number;
}

export const SHOP_TIERS: readonly ShopTier[] = [
  {
    id: 'cart',
    name: 'Cart',
    gridWidth: 5,
    gridHeight: 4,
    seats: 2,
    stoves: 1,
    unlockCost: TIER_UNLOCK.cart.cost,
    unlockReputation: TIER_UNLOCK.cart.reputation,
    demandMultiplier: 1,
    pricePremium: TIER_PRICE_PREMIUM.cart,
    decorMultiplier: 1,
  },
  {
    id: 'stall',
    name: 'Stall',
    gridWidth: 7,
    gridHeight: 5,
    seats: 4,
    stoves: 2,
    unlockCost: TIER_UNLOCK.stall.cost,
    unlockReputation: TIER_UNLOCK.stall.reputation,
    demandMultiplier: 1.5,
    pricePremium: TIER_PRICE_PREMIUM.stall,
    decorMultiplier: 1,
  },
  {
    id: 'small-shop',
    name: 'Small Shop',
    gridWidth: 10,
    gridHeight: 7,
    seats: 8,
    stoves: 3,
    unlockCost: TIER_UNLOCK['small-shop'].cost,
    unlockReputation: TIER_UNLOCK['small-shop'].reputation,
    demandMultiplier: 2.2,
    pricePremium: TIER_PRICE_PREMIUM['small-shop'],
    decorMultiplier: 1,
  },
  {
    id: 'ramen-bar',
    name: 'Ramen Bar',
    gridWidth: 13,
    gridHeight: 8,
    seats: 12,
    stoves: 4,
    unlockCost: TIER_UNLOCK['ramen-bar'].cost,
    unlockReputation: TIER_UNLOCK['ramen-bar'].reputation,
    demandMultiplier: 2.5,
    pricePremium: TIER_PRICE_PREMIUM['ramen-bar'],
    decorMultiplier: 1,
  },
  {
    id: 'grand-hall',
    name: 'Grand Ramen Hall',
    gridWidth: 16,
    gridHeight: 10,
    seats: 18,
    stoves: 6,
    unlockCost: TIER_UNLOCK['grand-hall'].cost,
    unlockReputation: TIER_UNLOCK['grand-hall'].reputation,
    demandMultiplier: 3.2,
    pricePremium: TIER_PRICE_PREMIUM['grand-hall'],
    decorMultiplier: 1.15,
  },
];

export function getTier(id: ShopTierId): ShopTier {
  const tier = SHOP_TIERS.find((t) => t.id === id);
  if (!tier) throw new Error(`Unknown shop tier: ${id}`);
  return tier;
}

/** Narrow an arbitrary string (e.g. a URL param) to a known tier id, or null. */
export function isTierId(value: string | null): value is ShopTierId {
  return value !== null && SHOP_TIERS.some((t) => t.id === value);
}

export function nextTier(id: ShopTierId): ShopTier | null {
  const index = SHOP_TIERS.findIndex((t) => t.id === id);
  return index >= 0 && index < SHOP_TIERS.length - 1 ? (SHOP_TIERS[index + 1] ?? null) : null;
}
