import { describe, expect, it } from 'vitest';
import { NATIVE_HEIGHT, NATIVE_WIDTH, computeIntegerZoom, computeViewportFit } from './config';

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

describe('viewport fitting', () => {
  it('uses the largest whole integer zoom and letterboxes the remainder', () => {
    const fit = computeViewportFit(1440, 810);
    expect(fit.zoom).toBe(3);
    expect(fit.integer).toBe(true);
    expect(fit.portrait).toBe(false);
    expect([fit.width, fit.height]).toEqual([NATIVE_WIDTH * 3, NATIVE_HEIGHT * 3]);
    expect([fit.left, fit.top]).toEqual([0, 0]);
  });

  it('keeps whole-pixel scaling when only one axis limits the fit', () => {
    const fit = computeViewportFit(1000, 600);
    expect(fit.zoom).toBe(2);
    expect([fit.left, fit.top]).toEqual([20, 30]);
  });

  it('falls back to an exact fractional scale on a narrow portrait phone', () => {
    const fit = computeViewportFit(390, 844);
    expect(fit.integer).toBe(false);
    expect(fit.portrait).toBe(true);
    expect(fit.zoom).toBeCloseTo(390 / NATIVE_WIDTH, 6);
    expect(fit.width).toBeCloseTo(390, 6);
    expect(fit.height).toBeCloseTo(219.375, 6);
    expect([fit.left, fit.top]).toEqual([0, 312]);
  });

  it('never produces a negative or oversized frame', () => {
    const sizes: [number, number][] = [
      [320, 480],
      [768, 1024],
      [1280, 720],
      [360, 640],
    ];
    for (const [w, h] of sizes) {
      const fit = computeViewportFit(w, h);
      expect(fit.width).toBeLessThanOrEqual(w + 0.001);
      expect(fit.height).toBeLessThanOrEqual(h + 0.001);
      expect(fit.left).toBeGreaterThanOrEqual(0);
      expect(fit.top).toBeGreaterThanOrEqual(0);
    }
  });
});
