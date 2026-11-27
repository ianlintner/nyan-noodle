import { describe, expect, it } from 'vitest';
import { serviceLayout, stageBar } from './layout';

describe('stageBar', () => {
  it('keeps the landscape bar where the original fixed geometry was', () => {
    const { cooking } = serviceLayout(false);
    expect(stageBar(cooking)).toEqual({ x: 10, y: 78, w: 140, h: 14 });
  });

  it('moves the portrait bar below the two-line instructions', () => {
    const { cooking } = serviceLayout(true);
    const bar = stageBar(cooking);
    expect(bar.y).toBeGreaterThan(cooking.y + 4 + 14 + 16);
    expect(bar.y + bar.h).toBeLessThan(cooking.y + cooking.h);
    expect(bar.w).toBeGreaterThan(120);
  });
});
