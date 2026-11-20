import { describe, expect, it } from 'vitest';
import { computeIntegerZoom } from './config';

describe('computeIntegerZoom', () => {
  it('floors to an integer and never goes below 1', () => {
    expect(computeIntegerZoom(480, 270)).toBe(1);
    expect(computeIntegerZoom(100, 100)).toBe(1);
    expect(computeIntegerZoom(1920, 1080)).toBe(4);
    expect(computeIntegerZoom(1919, 1079)).toBe(3);
  });

  it('is limited by the tighter axis', () => {
    expect(computeIntegerZoom(4000, 600)).toBe(2);
  });
});
