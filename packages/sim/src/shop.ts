export type ShopTierId = 'cart' | 'stall' | 'small-shop';

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
}

export const SHOP_TIERS: readonly ShopTier[] = [
  {
    id: 'cart',
    name: 'Cart',
    gridWidth: 5,
    gridHeight: 4,
    seats: 2,
    stoves: 1,
    unlockCost: 0,
    unlockReputation: 0,
    demandMultiplier: 1,
  },
  {
    id: 'stall',
    name: 'Stall',
    gridWidth: 7,
    gridHeight: 5,
    seats: 4,
    stoves: 2,
    unlockCost: 400,
    unlockReputation: 2,
    demandMultiplier: 1.5,
  },
  {
    id: 'small-shop',
    name: 'Small Shop',
    gridWidth: 10,
    gridHeight: 7,
    seats: 8,
    stoves: 3,
    unlockCost: 1200,
    unlockReputation: 4,
    demandMultiplier: 2.2,
  },
];

export function getTier(id: ShopTierId): ShopTier {
  const tier = SHOP_TIERS.find((t) => t.id === id);
  if (!tier) throw new Error(`Unknown shop tier: ${id}`);
  return tier;
}

export function nextTier(id: ShopTierId): ShopTier | null {
  const index = SHOP_TIERS.findIndex((t) => t.id === id);
  return index >= 0 && index < SHOP_TIERS.length - 1 ? (SHOP_TIERS[index + 1] ?? null) : null;
}
