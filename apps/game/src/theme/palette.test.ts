import { describe, expect, it } from 'vitest';
import { PALETTE, PALETTE_TOKENS, color, hexToNumber } from './palette';

describe('palette', () => {
  it('has the 24 art-direction colours', () => {
    expect(PALETTE_TOKENS).toHaveLength(24);
  });

  it('has unique, well-formed hex values', () => {
    const values = Object.values(PALETTE);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) expect(v).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('never uses pure black or white', () => {
    const values: string[] = Object.values(PALETTE);
    expect(values).not.toContain('#000000');
    expect(values).not.toContain('#ffffff');
  });

  it('converts to Phaser numeric colours', () => {
    expect(hexToNumber('#fff3d6')).toBe(0xfff3d6);
    expect(color('ink')).toBe(0x2b1d2e);
  });
});
