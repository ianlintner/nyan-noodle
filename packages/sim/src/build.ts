import { getFurniture, sellValue } from './catalog';
import type { FurnitureKind } from './catalog';
import { activeSeats, nextRotation, validateLayout } from './layoutRules';
import type { BuildItem, LayoutIssue, Rotation } from './layoutRules';
import { getTier, nextTier } from './shop';
import type { ShopTierId } from './shop';
import { armGrandOpening } from './goals';
import type { SimState } from './state';

export type BuildError = LayoutIssue | 'funds' | 'unknown-item' | 'max-tier' | 'reputation';

export type BuildResult<T = object> =
  ({ ok: true; state: SimState } & T) | { ok: false; reason: BuildError };

const fail = (reason: BuildError): { ok: false; reason: BuildError } => ({ ok: false, reason });

/** Human-readable explanation for the UI. */
export function describeBuildError(reason: BuildError): string {
  switch (reason) {
    case 'out-of-bounds':
      return 'Outside the shop floor';
    case 'occupied':
      return 'Something is already there';
    case 'reserved':
      return 'Keep the doorway clear';
    case 'stove-front':
      return 'Cooks need the tile in front of a stove';
    case 'blocks-path':
      return 'Blocks the way to a stool';
    case 'seat-cap':
      return 'Seat limit reached; upgrade the shop';
    case 'stove-cap':
      return 'Stove limit reached; upgrade the shop';
    case 'funds':
      return 'Not enough Fish Coins';
    case 'unknown-item':
      return 'No such furniture';
    case 'max-tier':
      return 'Already the biggest shop';
    case 'reputation':
      return 'Needs more Reputation Stars';
  }
}

/** Why `item` cannot sit in `items` (first violation naming it, or any new one), else null. */
function firstProblem(
  tierId: ShopTierId,
  items: readonly BuildItem[],
  subjectId: number,
): BuildError | null {
  const problems = validateLayout(tierId, items);
  const mine = problems.find((p) => p.itemId === subjectId);
  if (mine) return mine.reason;
  // A placement can also strand a *different* stool; report that as a path block.
  return problems[0]?.reason ?? null;
}

/** Can `kind` be placed at (x,y)? Does not charge coins. */
export function checkPlacement(
  state: SimState,
  kind: FurnitureKind,
  x: number,
  y: number,
  rot: Rotation = 0,
  ignoreId?: number,
): BuildError | null {
  const base = state.items.filter((i) => i.id !== ignoreId);
  const candidate: BuildItem = { id: ignoreId ?? state.nextItemId, kind, x, y, rot };
  return firstProblem(state.tierId, [...base, candidate], candidate.id);
}

/** Buy and place a piece. Costs the catalog price. */
export function placeItem(
  state: SimState,
  kind: FurnitureKind,
  x: number,
  y: number,
  rot: Rotation = 0,
): BuildResult<{ item: BuildItem }> {
  const cost = getFurniture(kind).cost;
  const problem = checkPlacement(state, kind, x, y, rot);
  if (problem) return fail(problem);
  if (state.economy.fishCoins < cost) return fail('funds');
  const item: BuildItem = { id: state.nextItemId, kind, x, y, rot };
  return {
    ok: true,
    item,
    state: {
      ...state,
      items: [...state.items, item],
      nextItemId: state.nextItemId + 1,
      economy: { ...state.economy, fishCoins: state.economy.fishCoins - cost },
    },
  };
}

/** Move (and optionally re-orient) a piece for free. */
export function moveItem(
  state: SimState,
  id: number,
  x: number,
  y: number,
  rot?: Rotation,
): BuildResult {
  const found = state.items.find((i) => i.id === id);
  if (!found) return fail('unknown-item');
  const next: BuildItem = { ...found, x, y, rot: rot ?? found.rot };
  const problem = checkPlacement(state, next.kind, x, y, next.rot, id);
  if (problem) return fail(problem);
  return { ok: true, state: { ...state, items: state.items.map((i) => (i.id === id ? next : i)) } };
}

/** Rotate a piece in place (matters for which way a stool seat faces). */
export function rotateItem(state: SimState, id: number): BuildResult {
  const found = state.items.find((i) => i.id === id);
  if (!found) return fail('unknown-item');
  return moveItem(state, id, found.x, found.y, nextRotation(found.rot));
}

/** Sell a piece for a partial refund. */
export function sellItem(state: SimState, id: number): BuildResult<{ refund: number }> {
  const found = state.items.find((i) => i.id === id);
  if (!found) return fail('unknown-item');
  const refund = sellValue(found.kind);
  return {
    ok: true,
    refund,
    state: {
      ...state,
      items: state.items.filter((i) => i.id !== id),
      economy: { ...state.economy, fishCoins: state.economy.fishCoins + refund },
    },
  };
}

export function itemAt(state: SimState, x: number, y: number): BuildItem | undefined {
  return state.items.find((i) => i.x === x && i.y === y);
}

export interface UpgradeInfo {
  readonly tierId: ShopTierId;
  readonly cost: number;
  readonly reputation: number;
}

/** The next shop tier and its price, or null at the top. */
export function upgradeInfo(state: SimState): UpgradeInfo | null {
  const next = nextTier(state.tierId);
  return next
    ? { tierId: next.id, cost: next.unlockCost, reputation: next.unlockReputation }
    : null;
}

/**
 * Buy the next shop tier. The grid grows, the layout is centred in the new width, and any
 * piece that no longer fits (doorway moved, path or cook spot blocked) is returned at full
 * price so nothing is silently lost.
 */
export function upgradeTier(state: SimState): BuildResult<{ refunded: readonly BuildItem[] }> {
  const next = nextTier(state.tierId);
  if (!next) return fail('max-tier');
  if (state.economy.reputation < next.unlockReputation) return fail('reputation');
  if (state.economy.fishCoins < next.unlockCost) return fail('funds');

  const dx = Math.floor((next.gridWidth - getTier(state.tierId).gridWidth) / 2);
  let items: BuildItem[] = state.items.map((i) => ({ ...i, x: i.x + dx }));
  const refunded: BuildItem[] = [];
  for (let guard = 0; guard < 256; guard++) {
    const problem = validateLayout(next.id, items)[0];
    if (!problem) break;
    const victim = items.find((i) => i.id === problem.itemId);
    if (!victim) break;
    refunded.push(victim);
    items = items.filter((i) => i.id !== victim.id);
  }
  const refund = refunded.reduce((sum, i) => sum + getFurniture(i.kind).cost, 0);
  return {
    ok: true,
    refunded,
    state: armGrandOpening({
      ...state,
      tierId: next.id,
      items,
      economy: { ...state.economy, fishCoins: state.economy.fishCoins - next.unlockCost + refund },
    }),
  };
}

/** Seats customers can use right now (see `activeSeats`). */
export function seatCount(state: SimState): number {
  return activeSeats(state.tierId, state.items).length;
}
