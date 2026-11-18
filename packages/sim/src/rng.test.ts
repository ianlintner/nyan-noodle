import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 10 }, () => a.next())).toEqual(
      Array.from({ length: 10 }, () => b.next()),
    );
  });

  it('differs across seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('int stays within inclusive bounds', () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) {
      const v = rng.int(3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it('pick throws on empty list', () => {
    expect(() => createRng(1).pick([])).toThrow();
  });
});
