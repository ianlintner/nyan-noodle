import { describe, expect, it } from 'vitest';
import { CatActor } from './CatActor';
import type { Cell } from './layout';

/** Minimal stand-in for a Phaser sprite: records render position and depth. */
class SpriteMock {
  x = 0;
  y = 0;
  depth = 0;
  anims = { timeScale: 1 };
  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }
  setDepth(d: number): this {
    this.depth = d;
    return this;
  }
  setOrigin(): this {
    return this;
  }
  play(): this {
    return this;
  }
  destroy(): void {}
}

const scene = { add: { sprite: () => new SpriteMock() } } as never;
const noRegister = (): void => {};

function actorAt(cell: Cell): CatActor {
  return new CatActor(scene, 'tabby', null, cell, noRegister);
}

describe('CatActor.cell', () => {
  it('reports the stool row, not the row below, while seated (SIT_DROP is render-only)', () => {
    const actor = actorAt({ tx: 1, ty: 2 });
    actor.sit({ tx: 1, ty: 2 }, 'down');
    expect(actor.isSeated).toBe(true);
    // The sprite is drawn SIT_DROP px lower, but the logical cell is unchanged.
    expect(actor.cell).toEqual({ tx: 1, ty: 2 });
  });

  it('reports the feet cell while walking', () => {
    const actor = actorAt({ tx: 0, ty: 0 });
    expect(actor.cell).toEqual({ tx: 0, ty: 0 });
  });
});

describe('CatActor fractional movement', () => {
  it('accumulates sub-pixel movement across frames instead of rounding it away', () => {
    const actor = actorAt({ tx: 0, ty: 0 });
    const startX = actor.x; // cellCenterX(0) = 8
    // Walk two tiles right. At a high refresh rate the per-frame budget is < 1px.
    actor.walkTo([
      { tx: 0, ty: 0 },
      { tx: 2, ty: 0 },
    ]);
    actor.update(1); // ~0.048px budget
    const afterOne = actor.x;
    expect(afterOne).toBeGreaterThan(startX);
    actor.update(1); // another ~0.048px must accumulate, not reset
    expect(actor.x).toBeGreaterThan(afterOne);
    // The render position is rounded, but the true position keeps sub-pixel precision.
    expect(actor.sprite.x).toBe(Math.round(actor.x));
  });
});
