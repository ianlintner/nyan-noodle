import type { TraitId } from '@nyan-noodle/sim';
import { color } from '../theme/palette';

/**
 * Tiny 5x5 pixel-art glyph for each personality trait. Drawn with full-pixel fills
 * (no anti-aliasing) so the icons stay palette-true and font-glyph independent.
 * A 1 means a filled pixel; rows are top-to-bottom.
 */
const TRAIT_GLYPHS: Readonly<Record<TraitId, readonly string[]>> = {
  neutral: ['01110', '10001', '10001', '10001', '01110'],
  picky: ['11111', '10001', '10101', '10001', '11111'],
  impatient: ['01110', '11011', '10101', '11011', '01110'],
  generous: ['01010', '11111', '11111', '01110', '00100'],
  'night-owl': ['01110', '11111', '10101', '01110', '00000'],
  'spice-lover': ['00100', '01110', '11111', '00100', '01110'],
};

/** Draw a 5x5 trait glyph at (x, y) as its top-left corner. */
export function drawTraitGlyph(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  trait: TraitId,
  token: 'ink' | 'cream' | 'steamWhite' = 'ink',
): void {
  const rows = TRAIT_GLYPHS[trait] ?? TRAIT_GLYPHS.neutral;
  g.fillStyle(color(token), 1);
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      if (row[rx] === '1') g.fillRect(x + rx, y + ry, 1, 1);
    }
  });
}
