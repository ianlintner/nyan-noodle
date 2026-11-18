import {
  APPEAL_COUNT_CAP,
  APPEAL_DEMAND_PER_POINT,
  FURNITURE,
  SEATS_PER_STOVE,
  getFurniture,
} from './catalog';
import type { FurnitureKind } from './catalog';
import { getTier } from './shop';
import type { ShopTierId } from './shop';

/** 0 = faces up (toward the back wall), 1 = right, 2 = down, 3 = left. */
export type Rotation = 0 | 1 | 2 | 3;

/** A piece of furniture on the interior grid (x,y are interior-local, 0-based, top-left). */
export interface BuildItem {
  readonly id: number;
  readonly kind: FurnitureKind;
  readonly x: number;
  readonly y: number;
  readonly rot: Rotation;
}

export interface GridCell {
  readonly x: number;
  readonly y: number;
}

export type LayoutIssue =
  | 'out-of-bounds'
  | 'occupied'
  | 'reserved'
  | 'stove-front'
  | 'blocks-path'
  | 'seat-cap'
  | 'stove-cap';

export interface Violation {
  readonly itemId: number;
  readonly reason: LayoutIssue;
}

/** The interior tile just inside the shop door; always kept clear so cats can come in. */
export function entryCell(tierId: ShopTierId): GridCell {
  const tier = getTier(tierId);
  const doorX = Math.floor((tier.gridWidth + 2) / 2); // world column of the door
  return { x: doorX - 1, y: tier.gridHeight - 1 };
}

/** The cook stands on the tile in front (below) of a stove; no furniture may go there. */
export function cookSpot(stove: GridCell): GridCell {
  return { x: stove.x, y: stove.y + 1 };
}

export function nextRotation(rot: Rotation): Rotation {
  return ((rot + 1) % 4) as Rotation;
}

const NEIGHBORS: readonly GridCell[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** Every layout problem for `items` on tier `tierId` (empty means the layout is valid). */
export function validateLayout(tierId: ShopTierId, items: readonly BuildItem[]): Violation[] {
  const tier = getTier(tierId);
  const gw = tier.gridWidth;
  const gh = tier.gridHeight;
  const out: Violation[] = [];
  const inside = (c: GridCell): boolean => c.x >= 0 && c.y >= 0 && c.x < gw && c.y < gh;
  const key = (c: GridCell): number => c.y * gw + c.x;
  const entry = entryCell(tierId);

  const at = new Map<number, BuildItem>();
  for (const it of items) {
    if (!inside(it)) {
      out.push({ itemId: it.id, reason: 'out-of-bounds' });
      continue;
    }
    if (at.has(key(it))) out.push({ itemId: it.id, reason: 'occupied' });
    else at.set(key(it), it);
    if (it.x === entry.x && it.y === entry.y) out.push({ itemId: it.id, reason: 'reserved' });
  }

  let seats = 0;
  let stoves = 0;
  for (const it of items) {
    if (it.kind === 'stool' && ++seats > tier.seats)
      out.push({ itemId: it.id, reason: 'seat-cap' });
    if (it.kind === 'stove' && ++stoves > tier.stoves) {
      out.push({ itemId: it.id, reason: 'stove-cap' });
    }
  }

  const blockedWalk = new Set<number>(at.keys());
  for (const it of items) {
    if (it.kind !== 'stove' || !inside(it)) continue;
    const spot = cookSpot(it);
    const occupant = inside(spot) ? at.get(key(spot)) : undefined;
    if (!inside(spot) || occupant) out.push({ itemId: it.id, reason: 'stove-front' });
    else blockedWalk.add(key(spot));
  }

  if (!blockedWalk.has(key(entry))) {
    const seen = new Set<number>([key(entry)]);
    const queue: GridCell[] = [entry];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const d of NEIGHBORS) {
        const n = { x: cur.x + d.x, y: cur.y + d.y };
        if (!inside(n) || seen.has(key(n)) || blockedWalk.has(key(n))) continue;
        seen.add(key(n));
        queue.push(n);
      }
    }
    for (const it of items) {
      if (it.kind !== 'stool' || !inside(it)) continue;
      const reachable = NEIGHBORS.some((d) => {
        const n = { x: it.x + d.x, y: it.y + d.y };
        return inside(n) && seen.has(key(n));
      });
      if (!reachable) out.push({ itemId: it.id, reason: 'blocks-path' });
    }
  }
  return out;
}

/** Stools that actually seat customers: limited by tier seat cap and by stove capacity. */
export function activeSeats(tierId: ShopTierId, items: readonly BuildItem[]): BuildItem[] {
  const tier = getTier(tierId);
  const stools = items.filter((i) => i.kind === 'stool');
  const stoves = items.filter((i) => i.kind === 'stove').length;
  return stools.slice(0, Math.min(tier.seats, stoves * SEATS_PER_STOVE));
}

/** Decor appeal: each kind counts at most APPEAL_COUNT_CAP pieces. */
export function appealScore(items: readonly BuildItem[]): number {
  let total = 0;
  for (const def of FURNITURE) {
    const count = items.filter((i) => i.kind === def.kind).length;
    total += Math.min(count, APPEAL_COUNT_CAP) * def.appeal;
  }
  return total;
}

/**
 * Daily demand multiplier: the tier's demand, lifted by decor appeal *beyond* the tier's
 * starter furnishings (those are already priced into the tier's base demand).
 */
export function layoutDemandMultiplier(tierId: ShopTierId, items: readonly BuildItem[]): number {
  const extra = Math.max(0, appealScore(items) - appealScore(defaultItems(tierId)));
  return getTier(tierId).demandMultiplier * (1 + APPEAL_DEMAND_PER_POINT * extra);
}

export function isSolid(kind: FurnitureKind): boolean {
  return getFurniture(kind).solid;
}

/** Starting furnishings of a tier: a full counter-service shop at the tier's seat/stove cap. */
export function defaultItems(tierId: ShopTierId): BuildItem[] {
  const tier = getTier(tierId);
  const gw = tier.gridWidth;
  const gh = tier.gridHeight;
  const raw: { kind: FurnitureKind; x: number; y: number; rot: Rotation }[] = [];

  const stoveXs: number[] = [];
  for (let k = 0; k < tier.stoves; k++) {
    stoveXs.push(1 + 2 * k);
    raw.push({ kind: 'stove', x: 1 + 2 * k, y: 0, rot: 0 });
  }
  raw.push({ kind: 'lantern', x: 0, y: 0, rot: 0 });
  raw.push({ kind: 'plant', x: gw - 1, y: 0, rot: 0 });
  for (let x = 0; x < gw; x++) {
    if (!stoveXs.includes(x)) raw.push({ kind: 'counter', x, y: 1, rot: 0 });
  }

  let seats = 0;
  for (let x = 0; x < gw && seats < tier.seats; x += 2, seats++) {
    raw.push({ kind: 'stool', x, y: 2, rot: 0 });
  }
  const tables: GridCell[] = [];
  for (let y = 4; y < gh - 1 && tables.length < 4; y += 2) {
    for (let x = 2; x < gw - 1 && tables.length < 4; x += 4) tables.push({ x, y });
  }
  for (const t of tables) {
    if (seats >= tier.seats) break;
    raw.push({ kind: 'stool', x: t.x - 1, y: t.y, rot: 1 });
    seats++;
    if (seats < tier.seats) {
      raw.push({ kind: 'stool', x: t.x + 1, y: t.y, rot: 3 });
      seats++;
    }
    raw.push({ kind: 'table', x: t.x, y: t.y, rot: 0 });
  }
  return raw.map((r, id) => ({ id, ...r }));
}
