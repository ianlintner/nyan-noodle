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

/**
 * Bright golds are for lamps and broth, not body text on cream. These semantic tokens
 * point text at palette values that clear WCAG AA against the cream panel fill.
 */
export const PANEL_TEXT = {
  gold: 'woodDark',
  muted: 'slate',
} as const;

const channel = (hex: string, start: number): number => {
  const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

export function relativeLuminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** WCAG contrast ratio between two `#rrggbb` strings. */
export function contrastRatio(a: string, b: string): number {
  const hi = Math.max(relativeLuminance(a), relativeLuminance(b));
  const lo = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (hi + 0.05) / (lo + 0.05);
}

/** Alpha-blend two hex colours; used to model composited layers exactly. */
export function blendHex(fg: string, bg: string, alpha: number): string {
  const channels = [1, 3, 5].map((i) => {
    const mixed =
      Number.parseInt(fg.slice(i, i + 2), 16) * alpha +
      Number.parseInt(bg.slice(i, i + 2), 16) * (1 - alpha);
    return Math.round(mixed).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}
