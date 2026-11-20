import { getFurniture } from './catalog';
import type { FurnitureKind } from './catalog';
import { placeItem } from './build';
import { activeSeats } from './layoutRules';
import type { Rotation } from './layoutRules';
import { getTier } from './shop';
import type { SimState } from './state';

/**
 * Cheapest purchase that adds a working seat: a stool while stoves can feed one more,
 * otherwise a stove (below the tier cap). Null when the shop is already at its seat cap.
 */
export function nextFurnishing(state: SimState): FurnitureKind | null {
  const tier = getTier(state.tierId);
  const stools = state.items.filter((i) => i.kind === 'stool').length;
  const stoves = state.items.filter((i) => i.kind === 'stove').length;
  if (activeSeats(state.tierId, state.items).length >= tier.seats) return null;
  if (stools > activeSeats(state.tierId, state.items).length || stools >= tier.seats) {
    return stoves < tier.stoves ? 'stove' : null;
  }
  return 'stool';
}

/** First valid (x, y) for `kind`, scanning stoves along the back wall and stools front-to-back. */
function placeFirst(state: SimState, kind: FurnitureKind): SimState | null {
  const tier = getTier(state.tierId);
  // Stoves go on the back wall; stools fill the guest side (row 2 down), leaving the
  // back two rows free for future stoves and their cook spots.
  const rows =
    kind === 'stove' ? [0] : Array.from({ length: tier.gridHeight - 2 }, (_, i) => i + 2);
  for (const y of rows) {
    for (let x = 0; x < tier.gridWidth; x++) {
      const rot: Rotation = 0;
      const placed = placeItem(state, kind, x, y, rot);
      if (placed.ok) return placed.state;
    }
  }
  return null;
}

/**
 * Buy stools/stoves until every tier seat works or `budget` Fish Coins run out. Used by the
 * reference autopilot after a tier upgrade (the old layout is carried over, so the new
 * floor space starts empty). Deterministic: scan order is fixed.
 */
export function furnishToCapacity(start: SimState, budget: number): SimState {
  let state = start;
  let left = budget;
  for (let guard = 0; guard < 32; guard++) {
    const kind = nextFurnishing(state);
    if (!kind) break;
    const cost = getFurniture(kind).cost;
    if (cost > left || state.economy.fishCoins < cost) break;
    const next = placeFirst(state, kind);
    if (!next) break;
    state = next;
    left -= cost;
  }
  return state;
}
