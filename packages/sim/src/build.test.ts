import { describe, expect, it } from 'vitest';
import { createSimState } from './state';
import type { SimState } from './state';
import { SHOP_TIERS } from './shop';
import { FURNITURE, getFurniture, sellValue } from './catalog';
import {
  activeSeats,
  appealScore,
  cookSpot,
  entryCell,
  layoutDemandMultiplier,
  validateLayout,
} from './layoutRules';
import type { BuildItem } from './layoutRules';
import { checkPlacement, moveItem, placeItem, rotateItem, sellItem, upgradeTier } from './build';
import { planService } from './service';

const withCoins = (
  s: SimState,
  fishCoins: number,
  reputation = s.economy.reputation,
): SimState => ({ ...s, economy: { ...s.economy, fishCoins, reputation } });

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  expect(r).toMatchObject({ ok: true });
  return r as Extract<T, { ok: true }>;
};

/** Stall row 4 minus its doorway at x=3: decor can line the front wall without blocking. */
const STALL_FRONT_ROW = [0, 1, 2, 4, 5, 6];

describe('default layouts', () => {
  for (const tier of SHOP_TIERS) {
    it(`${tier.id}: valid, at seat/stove cap, entry tile clear`, () => {
      const s = createSimState(1, tier.id);
      expect(validateLayout(tier.id, s.items)).toEqual([]);
      expect(s.items.filter((i) => i.kind === 'stool')).toHaveLength(tier.seats);
      expect(s.items.filter((i) => i.kind === 'stove')).toHaveLength(tier.stoves);
      expect(activeSeats(tier.id, s.items)).toHaveLength(tier.seats);
      const e = entryCell(tier.id);
      expect(s.items.some((i) => i.x === e.x && i.y === e.y)).toBe(false);
    });
  }
});

describe('placement validity', () => {
  const cart = withCoins(createSimState(1, 'cart'), 500);

  it('rejects out of bounds, occupied and the doorway', () => {
    expect(checkPlacement(cart, 'plant', -1, 0)).toBe('out-of-bounds');
    expect(checkPlacement(cart, 'plant', 5, 0)).toBe('out-of-bounds');
    expect(checkPlacement(cart, 'plant', 0, 0)).toBe('occupied');
    const e = entryCell('cart');
    expect(checkPlacement(cart, 'plant', e.x, e.y)).toBe('reserved');
    expect(checkPlacement(cart, 'plant', 4, 3)).toBeNull();
  });

  it('keeps the cook spot in front of a stove free', () => {
    const stove = cart.items.find((i) => i.kind === 'stove')!;
    const spot = cookSpot(stove);
    expect(cart.items.some((i) => i.x === spot.x && i.y === spot.y)).toBe(false);
    expect(checkPlacement(cart, 'plant', spot.x, spot.y)).toBe('stove-front');
  });

  it('a stove needs room in front of it, and the tier caps stove count', () => {
    let stall = withCoins(createSimState(1, 'stall'), 500);
    const stove = stall.items.filter((i) => i.kind === 'stove').at(-1)!;
    expect(checkPlacement(stall, 'stove', 6, 3)).toBe('stove-cap');
    stall = ok(sellItem(stall, stove.id)).state;
    expect(checkPlacement(stall, 'stove', 6, 4)).toBe('stove-front'); // front tile is off the grid
    expect(checkPlacement(stall, 'stove', 6, 3)).toBeNull();
  });

  it('enforces the tier seat cap', () => {
    expect(checkPlacement(cart, 'stool', 4, 3)).toBe('seat-cap');
    const sold = ok(sellItem(cart, cart.items.find((i) => i.kind === 'stool')!.id)).state;
    expect(checkPlacement(sold, 'stool', 4, 3)).toBeNull();
  });

  it('rejects a placement that walls off a stool (pathing-blocked validation)', () => {
    // Cart stool (0,2): neighbours (0,1) counter, (1,2), (0,3). Close one, then the last is refused.
    const s = ok(placeItem(cart, 'plant', 1, 2)).state;
    expect(checkPlacement(s, 'plant', 0, 3)).toBe('blocks-path');
    expect(checkPlacement(s, 'plant', 4, 3)).toBeNull();
  });

  it('a sealed stool is reported by validateLayout', () => {
    const items: BuildItem[] = [
      { id: 0, kind: 'stool', x: 0, y: 2, rot: 0 },
      { id: 1, kind: 'plant', x: 0, y: 3, rot: 0 },
      { id: 2, kind: 'plant', x: 1, y: 2, rot: 0 },
      { id: 3, kind: 'plant', x: 0, y: 1, rot: 0 },
    ];
    expect(validateLayout('cart', items)).toContainEqual({ itemId: 0, reason: 'blocks-path' });
  });
});

describe('economy: buy, move, sell', () => {
  it('place charges the catalog price and sell refunds half (rounded down)', () => {
    let s = withCoins(createSimState(1, 'cart'), 100);
    s = ok(placeItem(s, 'lantern', 4, 3)).state;
    expect(s.economy.fishCoins).toBe(100 - getFurniture('lantern').cost);
    const placed = s.items.at(-1)!;
    const sold = ok(sellItem(s, placed.id));
    expect(sold.refund).toBe(sellValue('lantern'));
    expect(sold.state.economy.fishCoins).toBe(100 - 30 + 15);
    expect(sold.state.items.some((i) => i.id === placed.id)).toBe(false);
  });

  it('refuses when broke and does not mutate', () => {
    const s = withCoins(createSimState(1, 'cart'), 5);
    expect(placeItem(s, 'plant', 4, 3)).toEqual({ ok: false, reason: 'funds' });
    expect(s.items).toEqual(createSimState(1, 'cart').items);
  });

  it('every catalog price refunds strictly less than it cost', () => {
    for (const f of FURNITURE) expect(sellValue(f.kind)).toBeLessThan(f.cost);
  });

  it('moving is free, revalidated, and keeps the id', () => {
    let s = withCoins(createSimState(1, 'cart'), 100);
    s = ok(placeItem(s, 'plant', 4, 3)).state;
    const id = s.items.at(-1)!.id;
    const moved = ok(moveItem(s, id, 4, 2));
    expect(moved.state.economy.fishCoins).toBe(s.economy.fishCoins);
    expect(moved.state.items.find((i) => i.id === id)).toMatchObject({ x: 4, y: 2 });
    expect(moveItem(s, id, 0, 0)).toEqual({ ok: false, reason: 'occupied' });
    expect(moveItem(s, 999, 0, 0)).toEqual({ ok: false, reason: 'unknown-item' });
  });

  it('rotating a stool changes its facing in place', () => {
    const s = createSimState(1, 'cart');
    const stool = s.items.find((i) => i.kind === 'stool')!;
    const turned = ok(rotateItem(s, stool.id));
    expect(turned.state.items.find((i) => i.id === stool.id)!.rot).toBe((stool.rot + 1) % 4);
  });
});

describe('capacity and appeal effects', () => {
  it('stoves cap how many stools seat customers', () => {
    let s = createSimState(1, 'stall'); // 4 seats, 2 stoves
    expect(activeSeats('stall', s.items)).toHaveLength(4);
    for (const st of s.items.filter((i) => i.kind === 'stove')) s = ok(sellItem(s, st.id)).state;
    expect(activeSeats('stall', s.items)).toHaveLength(0);
    expect(planService(s).seats).toBe(0);
    expect(planService(s).visits.every((v) => v.outcome === 'lost')).toBe(true);
  });

  it('seats in the service plan follow the layout, not just the tier', () => {
    let s = createSimState(1, 'cart');
    s = ok(sellItem(s, s.items.find((i) => i.kind === 'stool')!.id)).state;
    expect(planService(s).seats).toBe(1);
  });

  it('starter decor is free; extra decor adds appeal with diminishing returns', () => {
    const fresh = createSimState(1, 'stall');
    expect(layoutDemandMultiplier('stall', fresh.items)).toBe(1.5);
    let s = withCoins(fresh, 1000);
    const base = appealScore(s.items);
    s = ok(placeItem(s, 'plant', 0, 4)).state;
    expect(appealScore(s.items)).toBe(base + getFurniture('plant').appeal);
    expect(layoutDemandMultiplier('stall', s.items)).toBeGreaterThan(1.5);
    for (const x of [1, 2, 4]) s = ok(placeItem(s, 'plant', x, 4)).state;
    expect(s.items.filter((i) => i.kind === 'plant')).toHaveLength(5);
    // Five plants, but only three count: 1 starter + 2 more worth of appeal.
    expect(appealScore(s.items)).toBe(base + 2 * getFurniture('plant').appeal);
  });

  it('a decorated shop draws at least as many visitors as a bare one on the same seed', () => {
    const bare = withCoins(createSimState(3, 'stall'), 2000);
    let fancy = bare;
    for (const x of STALL_FRONT_ROW) {
      fancy = ok(placeItem(fancy, x % 2 ? 'lantern' : 'plant', x, 4)).state;
    }
    expect(layoutDemandMultiplier('stall', fancy.items)).toBeGreaterThan(
      layoutDemandMultiplier('stall', bare.items),
    );
    expect(planService(fancy).visits.length).toBeGreaterThanOrEqual(
      planService(bare).visits.length,
    );
  });
});

describe('shop tier upgrade', () => {
  it('needs coins and reputation, then expands the grid and keeps the layout valid', () => {
    const cart = createSimState(1, 'cart');
    expect(upgradeTier(withCoins(cart, 5000, 0))).toEqual({ ok: false, reason: 'reputation' });
    expect(upgradeTier(withCoins(cart, 100, 5))).toEqual({ ok: false, reason: 'funds' });

    const r = ok(upgradeTier(withCoins(cart, 5000, 5)));
    expect(r.state.tierId).toBe('stall');
    expect(r.refunded).toEqual([]);
    expect(r.state.economy.fishCoins).toBe(5000 - 400);
    expect(validateLayout('stall', r.state.items)).toEqual([]);
    // Existing furniture survives, centred in the wider grid (one tile right).
    expect(r.state.items).toHaveLength(cart.items.length);
    expect(r.state.items.map((i) => i.x)).toEqual(cart.items.map((i) => i.x + 1));
    // The bigger tier has room for more seats than were bought.
    expect(activeSeats('stall', r.state.items)).toHaveLength(2);
    expect(checkPlacement(r.state, 'stool', 6, 3)).toBeNull();
  });

  it('refunds at full price any piece that no longer fits the migrated layout', () => {
    // A sealed stool is invalid even before the move; the defensive repair must drop it.
    let s = withCoins(createSimState(1, 'cart'), 5000, 5);
    s = {
      ...s,
      items: [
        ...s.items.filter((i) => i.kind !== 'stool'),
        { id: 90, kind: 'stool', x: 3, y: 2, rot: 0 },
        { id: 91, kind: 'plant', x: 2, y: 2, rot: 0 },
        { id: 92, kind: 'plant', x: 4, y: 2, rot: 0 },
        { id: 93, kind: 'plant', x: 3, y: 3, rot: 0 },
      ],
    };
    const up = ok(upgradeTier(s));
    expect(up.refunded.map((i) => i.id)).toEqual([90]);
    expect(up.state.economy.fishCoins).toBe(5000 - 400 + getFurniture('stool').cost);
    expect(validateLayout('stall', up.state.items)).toEqual([]);
  });

  it('walks cart -> stall -> small shop with valid layouts and stops at the top', () => {
    let s = withCoins(createSimState(1, 'cart'), 9000, 5);
    s = ok(upgradeTier(s)).state;
    expect(validateLayout('stall', s.items)).toEqual([]);
    s = ok(upgradeTier(s)).state;
    expect(s.tierId).toBe('small-shop');
    expect(validateLayout('small-shop', s.items)).toEqual([]);
    expect(upgradeTier(s)).toEqual({ ok: false, reason: 'max-tier' });
  });

  it('state stays JSON-safe after building', () => {
    let s = withCoins(createSimState(1, 'cart'), 900, 5);
    s = ok(upgradeTier(s)).state;
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
