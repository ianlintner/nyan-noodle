import { getTier } from '@nyan-noodle/sim';
import type { ShopTierId } from '@nyan-noodle/sim';

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
  readonly staff: Cell;
  readonly stoves: readonly Cell[];
  /** blocked[ty][tx] — true if cats cannot walk there. */
  readonly blocked: readonly (readonly boolean[])[];
}

const STREET_ROWS = 2;

/** Presentation layout for a shop tier: geometry only, no game rules. */
export function buildLayout(tierId: ShopTierId): ShopLayout {
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
        floor.push({ frame: 'tile/floor_stone', tx, ty });
      } else if (interior) {
        floor.push({ frame: 'tile/floor_wood', tx, ty });
      } else {
        const isDoor = ty === bottomWall && tx === doorX;
        if (isDoor) {
          floor.push({ frame: 'tile/floor_stone', tx, ty });
          continue;
        }
        const window = ty === 0 && tx % 3 === 2;
        walls.push({
          frame: window ? 'tile/wall_window' : ty === 0 ? 'tile/wall_plaster' : 'tile/wall_wood',
          tx,
          ty,
        });
        block(tx, ty);
      }
    }
  }

  const door: Cell = { tx: doorX, ty: bottomWall };
  furniture.push({ frame: 'furniture/noren', tx: doorX, ty: bottomWall });
  furniture.push({ frame: 'furniture/sign', tx: Math.max(1, doorX - 1), ty: 0 });

  // Cooking row: stoves along the back wall with the staff gap in the counter row.
  const stoves: Cell[] = [];
  for (let k = 0; k < tier.stoves; k++) {
    const tx = 2 + 2 * k;
    stoves.push({ tx, ty: 1 });
    furniture.push({ frame: 'furniture/stove', tx, ty: 1 });
    block(tx, 1);
  }
  furniture.push({ frame: 'furniture/lantern', tx: 1, ty: 1 });
  block(1, 1);
  furniture.push({ frame: 'furniture/plant', tx: gw, ty: 1 });
  block(gw, 1);
  const staffCols = new Set(stoves.map((s) => s.tx));
  for (let tx = 1; tx <= gw; tx++) {
    if (staffCols.has(tx)) continue;
    furniture.push({ frame: 'furniture/counter', tx, ty: 2 });
    block(tx, 2);
  }
  const staff: Cell = { tx: stoves[0]!.tx, ty: 2 };
  for (const s of stoves) block(s.tx, 2); // gaps reserved for cooks

  // Seats: bar stools first (facing the counter), then table-side stools.
  const seats: Seat[] = [];
  const barCols: number[] = [];
  for (let tx = 1; tx <= gw; tx += 2) barCols.push(tx);
  for (const tx of barCols) {
    if (seats.length >= tier.seats) break;
    seats.push({ tx, ty: 3, face: 'up' });
  }
  const tables: Cell[] = [];
  for (let ty = 5; ty < gh && tables.length < 4; ty += 2) {
    for (let tx = 3; tx < gw && tables.length < 4; tx += 4) tables.push({ tx, ty });
  }
  for (const t of tables) {
    if (seats.length >= tier.seats) break;
    seats.push({ tx: t.tx - 1, ty: t.ty, face: 'right' });
    if (seats.length < tier.seats) seats.push({ tx: t.tx + 1, ty: t.ty, face: 'left' });
  }
  for (const seat of seats) {
    furniture.push({ frame: 'furniture/stool', tx: seat.tx, ty: seat.ty });
    block(seat.tx, seat.ty); // a stool is only enterable as a path goal
  }
  for (const t of tables) {
    if (!seats.some((s) => s.ty === t.ty && Math.abs(s.tx - t.tx) === 1)) continue;
    furniture.push({ frame: 'furniture/table', tx: t.tx, ty: t.ty });
    block(t.tx, t.ty);
  }

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
