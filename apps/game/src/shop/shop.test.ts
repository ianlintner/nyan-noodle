import { describe, expect, it } from 'vitest';
import { SHOP_TIERS } from '@nyan-noodle/sim';
import { buildLayout } from './layout';
import { findPath } from './pathfinding';

describe('findPath', () => {
  const open = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => false));

  it('finds a shortest 4-connected path', () => {
    const path = findPath(open, { tx: 0, ty: 0 }, { tx: 4, ty: 3 })!;
    expect(path).toHaveLength(8);
    expect(path[0]).toEqual({ tx: 0, ty: 0 });
    expect(path.at(-1)).toEqual({ tx: 4, ty: 3 });
  });

  it('routes around walls and returns null when sealed off', () => {
    const wall = open.map((r) => [...r]);
    for (let y = 0; y < 4; y++) wall[y]![2] = true;
    const around = findPath(wall, { tx: 0, ty: 0 }, { tx: 4, ty: 0 })!;
    expect(around.some((c) => c.ty === 4)).toBe(true);
    wall[4]![2] = true;
    expect(findPath(wall, { tx: 0, ty: 0 }, { tx: 4, ty: 0 })).toBeNull();
  });

  it('allows a blocked goal (stool) and is deterministic', () => {
    const grid = open.map((r) => [...r]);
    grid[2]![2] = true;
    const a = findPath(grid, { tx: 0, ty: 0 }, { tx: 2, ty: 2 });
    expect(a).not.toBeNull();
    expect(findPath(grid, { tx: 0, ty: 0 }, { tx: 2, ty: 2 })).toEqual(a);
  });
});

describe('buildLayout', () => {
  for (const tier of SHOP_TIERS) {
    it(`${tier.id}: seats match the sim and all are reachable from the street`, () => {
      const layout = buildLayout(tier.id);
      expect(layout.seats).toHaveLength(tier.seats);
      expect(layout.stoves).toHaveLength(tier.stoves);
      for (const seat of layout.seats) {
        expect(findPath(layout.blocked, layout.spawns[0], seat)).not.toBeNull();
      }
      for (const q of layout.queue) {
        expect(layout.blocked[q.ty]![q.tx]).toBe(false);
      }
      expect(layout.blocked[layout.door.ty]![layout.door.tx]).toBe(false);
    });
  }
});
