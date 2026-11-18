import { describe, expect, it } from 'vitest';
import {
  emptyBrothHold,
  emptyNoodleBoil,
  emptyToppingAssembly,
  requiredToppings,
  sampleBroth,
  toMeasurements,
} from './measure';

describe('sampleBroth', () => {
  it('accumulates in-band samples and flags overheat', () => {
    let s = emptyBrothHold;
    s = sampleBroth(s, 0.5, 0.4, 0.8); // in band
    s = sampleBroth(s, 0.6, 0.4, 0.8); // in band
    s = sampleBroth(s, 0.9, 0.4, 0.8); // over
    expect(s.samples).toBe(3);
    expect(s.inBand).toBe(2);
    expect(s.overheated).toBe(true);
  });

  it('counts band edges as in-band', () => {
    let s = emptyBrothHold;
    s = sampleBroth(s, 0.4, 0.4, 0.8);
    s = sampleBroth(s, 0.8, 0.4, 0.8);
    expect(s.inBand).toBe(2);
    expect(s.overheated).toBe(false);
  });
});

describe('toMeasurements', () => {
  it('computes inBandFraction from counts', () => {
    let broth = emptyBrothHold;
    broth = sampleBroth(broth, 0.5, 0.4, 0.8);
    broth = sampleBroth(broth, 0.7, 0.4, 0.8);
    broth = sampleBroth(broth, 0.1, 0.4, 0.8); // out of band (low)
    const m = toMeasurements(broth, { stoppedAt: 0.62 }, { applied: ['nori', 'scallion'] }, 'firm');
    expect(m.broth.inBandFraction).toBeCloseTo(2 / 3);
    expect(m.broth.overheated).toBe(false);
    expect(m.noodles.requested).toBe('firm');
    expect(m.noodles.stoppedAt).toBe(0.62);
    expect(m.toppings.applied).toEqual(['nori', 'scallion']);
  });

  it('defaults stoppedAt to 0 when noodles never stopped', () => {
    const m = toMeasurements(emptyBrothHold, emptyNoodleBoil, emptyToppingAssembly, 'default');
    expect(m.noodles.stoppedAt).toBe(0);
  });
});

describe('requiredToppings', () => {
  it('combines recipe defaults with requested extras', () => {
    expect(requiredToppings('shoyu', [])).toEqual(['nori', 'scallion']);
    expect(requiredToppings('shoyu', ['egg', 'chashu'])).toEqual([
      'nori',
      'scallion',
      'egg',
      'chashu',
    ]);
    expect(requiredToppings('tonkotsu', [])).toEqual(['chashu', 'scallion']);
  });
});
