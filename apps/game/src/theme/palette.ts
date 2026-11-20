/**
 * Art Direction palette (24 colours). See PLAN.md "Art Direction & UI Design System".
 * Never use pure black/white; always go through these tokens.
 */
export const PALETTE = {
  ink: '#2b1d2e',
  outline: '#3d2b3f',
  cream: '#fff3d6',
  brothGold: '#f2b84b',
  misoOrange: '#e8833a',
  chiliRed: '#d6453d',
  noriGreen: '#3f7a52',
  scallion: '#8fc66b',
  steamWhite: '#f4f7f8',
  woodLight: '#c98f5a',
  woodMid: '#9a6340',
  woodDark: '#6b3f2e',
  norenIndigo: '#3b4a8c',
  nightBlue: '#232a4d',
  paperPink: '#f4b6c2',
  sakura: '#ec8fa7',
  slate: '#5b6475',
  stone: '#8b93a1',
  tatami: '#d9c98a',
  lanternYellow: '#ffd86b',
  tabbyOrange: '#e39a4f',
  catGrey: '#9aa3b2',
  catBlack: '#2d2a33',
  catWhite: '#f2efe9',
} as const;

export type PaletteToken = keyof typeof PALETTE;

export const PALETTE_TOKENS = Object.keys(PALETTE) as PaletteToken[];

/** Convert '#rrggbb' to the 0xrrggbb number Phaser fill APIs expect. */
export function hexToNumber(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/** Numeric colour (0xrrggbb) for a palette token. */
export function color(token: PaletteToken): number {
  return hexToNumber(PALETTE[token]);
}
