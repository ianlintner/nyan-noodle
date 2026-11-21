import { activeSeats, cookSpot, defaultItems, getFurniture, getTier } from '@nyan-noodle/sim';
import type { BuildItem, Rotation, ShopTierId } from '@nyan-noodle/sim';
import { TILE_SIZE } from '../config';

export type Dir = 'down' | 'up' | 'left' | 'right';

export interface Cell {
  readonly tx: number;
  readonly ty: number;
}

export interface Seat extends Cell {
  /** Direction a seated cat faces (toward the counter/table). */
  readonly face: Dir;
}

export interface Placed extends Cell {
  /** Atlas frame name. */
  readonly frame: string;
  /** Sim item this sprite shows (null for fixed set dressing such as the noren). */
  readonly itemId: number | null;
  /** Optional explicit draw depth; set dressing that must float in front of the walk
   * (e.g. the noren over the doorway) declares an absolute depth instead of sorting by row. */
  readonly depth?: number;
}

export interface ShopLayout {
  readonly cols: number;
  readonly rows: number;
  /** Interior size in tiles (excludes walls and street). */
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly floor: readonly Placed[];
  /** Wall tiles (top row, side columns, bottom wall segments). */
  readonly walls: readonly Placed[];
  /** Furniture that y-sorts with cats. */
  readonly furniture: readonly Placed[];
  readonly seats: readonly Seat[];
  readonly door: Cell;
  readonly queue: readonly Cell[];
  readonly spawns: readonly [Cell, Cell];
  /** Where the cook stands (in front of the first stove); null when there is no stove. */
  readonly staff: Cell | null;
  readonly stoves: readonly Cell[];
  /** blocked[ty][tx] — true if cats cannot walk there. */
  readonly blocked: readonly (readonly boolean[])[];
}

const STREET_ROWS = 2;
const ROT_DIR: readonly Dir[] = ['up', 'right', 'down', 'left'];

export function rotationDir(rot: Rotation): Dir {
  return ROT_DIR[rot]!;
}

/** Interior-local grid cell -> world tile (the shop wall takes one tile on the top and left). */
export function toWorld(x: number, y: number): Cell {
  return { tx: x + 1, ty: y + 1 };
}

/** World tile -> interior-local grid cell, or null outside the shop floor. */
export function toGrid(
  tierId: ShopTierId,
  tx: number,
  ty: number,
): { x: number; y: number } | null {
  const tier = getTier(tierId);
  const x = tx - 1;
  const y = ty - 1;
  return x >= 0 && y >= 0 && x < tier.gridWidth && y < tier.gridHeight ? { x, y } : null;
}

function cookCell(stove: BuildItem): Cell {
  const c = cookSpot(stove);
  return toWorld(c.x, c.y);
}

/** Presentation layout for a shop tier and its furniture: geometry only, no game rules. */
export function buildLayout(
  tierId: ShopTierId,
  items: readonly BuildItem[] = defaultItems(tierId),
): ShopLayout {
  const tier = getTier(tierId);
  const gw = tier.gridWidth;
  const gh = tier.gridHeight;
  const cols = gw + 2;
  const bottomWall = gh + 1;
  const rows = gh + 2 + STREET_ROWS;
  const doorX = Math.floor(cols / 2);

  const floor: Placed[] = [];
  const walls: Placed[] = [];
  const furniture: Placed[] = [];
  const blocked: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false),
  );
  const block = (tx: number, ty: number): void => {
    if (blocked[ty]?.[tx] !== undefined) blocked[ty]![tx] = true;
  };

  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const street = ty > bottomWall;
      const interior = tx >= 1 && tx <= gw && ty >= 1 && ty <= gh;
      if (street) {
        floor.push({ frame: 'tile/floor_stone', tx, ty, itemId: null });
      } else if (interior) {
        floor.push({ frame: 'tile/floor_wood', tx, ty, itemId: null });
      } else {
        const isDoor = ty === bottomWall && tx === doorX;
        if (isDoor) {
          floor.push({ frame: 'tile/floor_stone', tx, ty, itemId: null });
          continue;
        }
        const window = ty === 0 && tx % 3 === 2;
        walls.push({
          frame: window ? 'tile/wall_window' : ty === 0 ? 'tile/wall_plaster' : 'tile/wall_wood',
          tx,
          ty,
          itemId: null,
        });
        block(tx, ty);
      }
    }
  }

  const door: Cell = { tx: doorX, ty: bottomWall };
  // The noren hangs over the doorway and must draw in front of the whole queue that
  // forms on the street below it, so a cat "ducks under" the curtain as it walks in.
  furniture.push({
    frame: 'furniture/noren',
    tx: doorX,
    ty: bottomWall,
    itemId: null,
    depth: rows * TILE_SIZE + 1,
  });
  furniture.push({ frame: 'furniture/sign', tx: Math.max(1, doorX - 1), ty: 0, itemId: null });

  // Wall menu hangs high on the back wall above the counter, centred between the
  // lantern (left) and plant (right). It must draw in front of the wall but behind
  // the counter, so give it a wall-row depth (same line walls use).
  furniture.push({
    frame: 'furniture/wall_menu',
    tx: Math.max(1, Math.min(cols - 2, doorX - 1)),
    ty: 0,
    itemId: null,
    depth: (0 + 1) * TILE_SIZE + 0.2,
  });

  const stoves: Cell[] = [];
  for (const item of items) {
    const { tx, ty } = toWorld(item.x, item.y);
    furniture.push({ frame: getFurniture(item.kind).frame, tx, ty, itemId: item.id });
    block(tx, ty); // every piece is solid; a stool is still a valid path *goal*
    if (item.kind === 'stove') {
      stoves.push({ tx, ty });
      const spot = cookCell(item);
      block(spot.tx, spot.ty); // the cook's tile
    }
  }

  const seats: Seat[] = activeSeats(tierId, items).map((s) => ({
    ...toWorld(s.x, s.y),
    face: rotationDir(s.rot),
  }));

  const firstStove = items.find((i) => i.kind === 'stove');
  const staff = firstStove ? cookCell(firstStove) : null;

  // Queue forms outside the door and snakes along the street.
  const q1 = bottomWall + 1;
  const q2 = bottomWall + 2;
  const queue: Cell[] = [
    { tx: doorX, ty: q1 },
    { tx: doorX, ty: q2 },
    { tx: doorX - 1, ty: q1 },
    { tx: doorX + 1, ty: q1 },
    { tx: doorX - 1, ty: q2 },
    { tx: doorX + 1, ty: q2 },
    { tx: doorX - 2, ty: q1 },
    { tx: doorX + 2, ty: q1 },
  ].filter((c) => c.tx >= 0 && c.tx < cols);

  return {
    cols,
    rows,
    gridWidth: gw,
    gridHeight: gh,
    floor,
    walls,
    furniture,
    seats,
    door,
    queue,
    spawns: [
      { tx: 0, ty: q2 },
      { tx: cols - 1, ty: q2 },
    ],
    staff,
    stoves,
    blocked,
  };
}
