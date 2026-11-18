export type FurnitureKind = 'stool' | 'table' | 'counter' | 'stove' | 'lantern' | 'plant';

export interface FurnitureDef {
  readonly kind: FurnitureKind;
  readonly name: string;
  /** Fish Coins to buy. */
  readonly cost: number;
  /** Atlas frame used by the renderer. */
  readonly frame: string;
  /** Cats and staff cannot walk through it. Stools are solid but may be a path goal. */
  readonly solid: boolean;
  /** Decor appeal points per piece (diminishing, see APPEAL_COUNT_CAP). */
  readonly appeal: number;
}

/** Catalog order is the order shown in the build panel. */
export const FURNITURE: readonly FurnitureDef[] = [
  { kind: 'stool', name: 'Stool', cost: 20, frame: 'furniture/stool', solid: true, appeal: 0 },
  { kind: 'table', name: 'Table', cost: 35, frame: 'furniture/table', solid: true, appeal: 1 },
  {
    kind: 'counter',
    name: 'Counter',
    cost: 25,
    frame: 'furniture/counter',
    solid: true,
    appeal: 0,
  },
  { kind: 'stove', name: 'Stove', cost: 90, frame: 'furniture/stove', solid: true, appeal: 0 },
  {
    kind: 'lantern',
    name: 'Lantern',
    cost: 30,
    frame: 'furniture/lantern',
    solid: true,
    appeal: 2,
  },
  { kind: 'plant', name: 'Plant', cost: 15, frame: 'furniture/plant', solid: true, appeal: 1 },
];

export function getFurniture(kind: FurnitureKind): FurnitureDef {
  const def = FURNITURE.find((f) => f.kind === kind);
  if (!def) throw new Error(`Unknown furniture: ${kind}`);
  return def;
}

/** Share of the purchase price returned when selling. */
export const SELL_REFUND_RATE = 0.5;

/** Refund for selling one piece. */
export function sellValue(kind: FurnitureKind): number {
  return Math.floor(getFurniture(kind).cost * SELL_REFUND_RATE);
}

/** Only this many pieces of one decor kind add appeal (diminishing returns). */
export const APPEAL_COUNT_CAP = 3;
/** Demand gain per appeal point. */
export const APPEAL_DEMAND_PER_POINT = 0.02;
/** Customer seats one working stove can feed. */
export const SEATS_PER_STOVE = 3;
