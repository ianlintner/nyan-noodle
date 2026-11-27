import { describe, expect, it } from 'vitest';
import {
  createSimState,
  getTier,
  goalsForTier,
  MAX_REPUTATION,
  nextTier,
  type SimState,
} from '@nyan-noodle/sim';
import { nextStepText } from './goalsPanel';

function finishedTier(tierId: SimState['tierId'], coins: number, reputation: number): SimState {
  const base = createSimState(7, tierId);
  return {
    ...base,
    tierId,
    goals: { ...base.goals, completed: goalsForTier(tierId).map((g) => g.id) },
    economy: { ...base.economy, fishCoins: coins, reputation },
  };
}

describe('nextStepText', () => {
  it('stays quiet while the current tier still has unfinished goals', () => {
    const state = createSimState(7, 'cart');
    expect(nextStepText(state)).toBeNull();
  });

  it('points from a finished Cart at the named, priced Stall upgrade', () => {
    const state = finishedTier('cart', 10, 0);
    const stall = nextTier('cart');
    expect(stall).not.toBeNull();
    const text = nextStepText(state);
    expect(text).toContain(stall!.name);
    expect(text).toContain(`${stall!.unlockCost}c`);
    expect(text).toContain('in Build');
    expect(text).not.toContain('ready!');
  });

  it('reads the name/cost from the sim table, not hard-coded values', () => {
    const state = finishedTier('stall', 10, 0);
    const shop = nextTier('stall');
    expect(shop).not.toBeNull();
    expect(nextStepText(state)).toContain(`${getTier(shop!.id).name}`);
    expect(nextStepText(state)).toContain(`${shop!.unlockCost}c`);
  });

  it('says ready when coins and stars both cover the next tier', () => {
    const state = finishedTier('cart', 5000, 5);
    expect(nextStepText(state)).toContain('ready!');
  });

  it('points at the stars needed for the Grand Opening at the top tier', () => {
    const state = finishedTier('grand-hall', 5000, 2);
    expect(nextTier('grand-hall')).toBeNull();
    expect(nextStepText(state)).toBe(
      `Next: ${MAX_REPUTATION - 2} more stars for the Grand Opening`,
    );
  });
});
