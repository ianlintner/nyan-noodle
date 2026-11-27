import { describe, expect, it } from 'vitest';
import { PALETTE, PALETTE_TOKENS, PANEL_TEXT, color, contrastRatio, hexToNumber } from './palette';
import { buttonFaceHex } from './hud';

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

  it('keeps cream-panel body text at WCAG AA contrast', () => {
    for (const token of Object.values(PANEL_TEXT)) {
      expect(contrastRatio(PALETTE[token], PALETTE.cream)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(PALETTE.brothGold, PALETTE.cream)).toBeLessThan(4.5);
  });

  it('keeps real button labels WCAG AA in normal, pressed and dimmed states', () => {
    // The label is ink painted over the button face in every state, not alpha-blended
    // with the panel. Assert the exact colours createButton composites underneath it.
    for (const pressed of [false, true]) {
      for (const dimmed of [false, true]) {
        const face = buttonFaceHex(pressed, dimmed);
        expect(
          contrastRatio(PALETTE.ink, face),
          `ink label over ${face} (pressed=${pressed}, dimmed=${dimmed})`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
