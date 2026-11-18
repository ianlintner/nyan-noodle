import { describe, expect, it } from 'vitest';
import {
  isFailedOrder,
  MIN_ACCEPT_QUALITY,
  comboMultiplier,
  reputationDeltaForQuality,
  rushBonus,
  scoreBowl,
  scoreBroth,
  scoreNoodles,
  scoreToppings,
  settleBowl,
  tipForQuality,
} from './cooking';
import type { CookMeasurements } from './cooking';

const perfect = (over: Partial<CookMeasurements> = {}): CookMeasurements => ({
  broth: { inBandFraction: 1.0, overheated: false },
  noodles: { requested: 'default', stoppedAt: 0.62 },
  toppings: { applied: ['nori', 'scallion'] },
  ...over,
});

describe('scoreBroth', () => {
  it('rewards time in band and penalises raw/scorched', () => {
    expect(scoreBroth({ inBandFraction: 1.0, overheated: false }).fraction).toBe(1);
    expect(scoreBroth({ inBandFraction: 0.1, overheated: false }).fraction).toBe(0);
    expect(scoreBroth({ inBandFraction: 0.1, overheated: false }).detail).toBe('raw');
    expect(scoreBroth({ inBandFraction: 0.85, overheated: false }).detail).toBe('perfect');
    expect(scoreBroth({ inBandFraction: 0.7, overheated: false }).fraction).toBe(0.7);
  });

  it('caps a steady but overheated hold as scorched', () => {
    const s = scoreBroth({ inBandFraction: 1.0, overheated: true });
    expect(s.detail).toBe('scorched');
    expect(s.fraction).toBe(0.6);
  });

  it('is monotonic non-decreasing in in-band fraction when not overheated', () => {
    let prev = -1;
    for (let f = 0; f <= 1; f += 0.05) {
      const s = scoreBroth({ inBandFraction: f, overheated: false }).fraction;
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
});

describe('scoreNoodles', () => {
  it('is perfect at the requested doneness target', () => {
    expect(scoreNoodles({ requested: 'firm', stoppedAt: 0.7 }).fraction).toBeCloseTo(1, 5);
    expect(scoreNoodles({ requested: 'soft', stoppedAt: 0.55 }).fraction).toBeCloseTo(1, 5);
  });

  it('degrades monotonically with distance from the target', () => {
    const base = scoreNoodles({ requested: 'firm', stoppedAt: 0.7 }).fraction;
    expect(scoreNoodles({ requested: 'firm', stoppedAt: 0.6 }).fraction).toBeLessThan(base);
    expect(scoreNoodles({ requested: 'firm', stoppedAt: 0.8 }).fraction).toBeLessThan(base);
  });

  it('classifies raw under / over cooked', () => {
    expect(scoreNoodles({ requested: 'firm', stoppedAt: 0.1 }).detail).toBe('raw');
    expect(scoreNoodles({ requested: 'firm', stoppedAt: 0.98 }).detail).toBe('overcooked');
  });
});

describe('scoreToppings', () => {
  it('is complete when required toppings arrive in order', () => {
    const s = scoreToppings('shoyu', [], { applied: ['nori', 'scallion'] });
    expect(s.detail).toBe('complete');
    expect(s.fraction).toBe(1);
  });

  it('penalises missing toppings', () => {
    const s = scoreToppings('shoyu', [], { applied: ['nori'] });
    expect(s.detail).toBe('missing');
    expect(s.fraction).toBeLessThan(1);
  });

  it('penalises extra (unrequested) toppings', () => {
    const s = scoreToppings('shoyu', [], { applied: ['nori', 'scallion', 'egg'] });
    expect(s.fraction).toBeLessThan(1);
  });

  it('includes the customer requested extras in the required set', () => {
    const s = scoreToppings('shoyu', ['egg'], { applied: ['nori', 'scallion', 'egg'] });
    expect(s.detail).toBe('complete');
    expect(s.fraction).toBe(1);
  });
});

describe('scoreBowl', () => {
  it('scores a perfect bowl at 100', () => {
    expect(scoreBowl('shoyu', [], perfect()).quality).toBe(100);
  });

  it('scores a fully-burned bowl at 0', () => {
    const bad: CookMeasurements = {
      broth: { inBandFraction: 0, overheated: false },
      noodles: { requested: 'firm', stoppedAt: 0 },
      toppings: { applied: [] },
    };
    expect(scoreBowl('shoyu', [], bad).quality).toBe(0);
  });

  it('clamps quality to [0, 100]', () => {
    expect(scoreBowl('shoyu', [], perfect()).quality).toBeLessThanOrEqual(100);
    expect(scoreBowl('shoyu', [], perfect()).quality).toBeGreaterThanOrEqual(0);
  });
});

describe('tip / rush / combo / reputation', () => {
  it('tips scale with quality and are zero for failed bowls', () => {
    expect(tipForQuality(100, 10)).toBeGreaterThan(tipForQuality(60, 10));
    expect(tipForQuality(MIN_ACCEPT_QUALITY - 1, 10)).toBe(0);
  });

  it('rush bonus shrinks as completion time grows and disappears past threshold', () => {
    const fast = rushBonus(100, 2, 10);
    const slow = rushBonus(100, 8, 10);
    expect(fast).toBeGreaterThan(slow);
    expect(rushBonus(100, 11, 10)).toBe(0);
    expect(rushBonus(30, 2, 10)).toBe(0);
  });

  it('combo multiplier ramps and caps at 1.5x', () => {
    expect(comboMultiplier(1)).toBe(1);
    expect(comboMultiplier(3)).toBeCloseTo(1.1);
    expect(comboMultiplier(11)).toBeCloseTo(1.5);
    expect(comboMultiplier(100)).toBe(1.5);
  });

  it('reputation delta is 0 for mediocre bowls', () => {
    expect(reputationDeltaForQuality(50)).toBe(0);
    expect(reputationDeltaForQuality(95)).toBeGreaterThan(0);
  });
});

describe('settleBowl', () => {
  it('perfect fast bowl pays tip + rush scaled by combo', () => {
    const p = settleBowl('shoyu', [], 10, perfect(), 3, 2, 10);
    expect(p.failed).toBe(false);
    expect(p.tip).toBeGreaterThan(0);
    expect(p.rush).toBeGreaterThan(0);
    expect(p.comboMultiplier).toBeCloseTo(1.1);
    expect(p.bonusCoins).toBe(Math.round((p.tip + p.rush) * p.comboMultiplier));
  });

  it('failed bowl pays nothing and returns failed=true', () => {
    const bad: CookMeasurements = {
      broth: { inBandFraction: 0, overheated: false },
      noodles: { requested: 'firm', stoppedAt: 0 },
      toppings: { applied: [] },
    };
    const p = settleBowl('shoyu', [], 10, bad, 5, 2, 10);
    expect(p.failed).toBe(true);
    expect(isFailedOrder(p.quality)).toBe(true);
    expect(p.tip).toBe(0);
    expect(p.rush).toBe(0);
    expect(p.bonusCoins).toBe(0);
    expect(p.reputationDelta).toBe(0);
  });

  it('is deterministic', () => {
    const a = settleBowl('miso', ['egg'], 12, perfect(), 2, 4, 12);
    const b = settleBowl('miso', ['egg'], 12, perfect(), 2, 4, 12);
    expect(a).toEqual(b);
  });
});
