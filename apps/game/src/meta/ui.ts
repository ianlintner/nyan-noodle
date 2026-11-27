import type Phaser from 'phaser';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { PALETTE, color } from '../theme/palette';
import { pixelText } from '../theme/hud';
import { ATLAS_KEY } from '../shop/CatActor';
import { ATLAS_JSON, ATLAS_PNG } from '../assets';

export const SCENE_KEYS = {
  title: 'TitleScene',
  prep: 'PrepScene',
  report: 'ReportScene',
  upgrades: 'UpgradeScene',
  regulars: 'RegularsScene',
} as const;

/** Queue the shared sprite atlas (cached after the first scene loads it). */
export function loadAtlas(scene: Phaser.Scene): void {
  scene.load.atlas(ATLAS_KEY, ATLAS_PNG, ATLAS_JSON);
}

/** Dusk ramen-shop backdrop behind the meta screens: warm wood wall, lantern glow,
 * a counter band along the bottom, and a few drifting steam wisps. Fills the navy
 * void so the prep/kitchen/title screens read as a lit room, not floating panels. */
export function backdrop(scene: Phaser.Scene): void {
  scene.cameras.main.setBackgroundColor(PALETTE.nightBlue);
  const g = scene.add.graphics();

  // Wall: vertical wood-clad planks with rung shadows, top-lit warm.
  const w = NATIVE_WIDTH;
  const h = NATIVE_HEIGHT;
  g.fillStyle(color('nightBlue'), 1);
  g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) {
    g.fillStyle(color('norenIndigo'), 1);
    g.fillRect(x, 0, 31, h);
    g.fillStyle(color('nightBlue'), 1);
    g.fillRect(x + 30, 0, 2, h); // plank seam
    g.fillStyle(color('lanternYellow'), 0.1);
    g.fillRect(x, 0, 31, h); // subtle warm wash
  }

  // Lantern glow: a soft bright halo near the top.
  g.fillStyle(color('lanternYellow'), 0.22);
  g.fillCircle(w / 2, 30, 120);
  g.fillStyle(color('brothGold'), 0.12);
  g.fillCircle(w / 2, 30, 220);

  // Counter band along the bottom.
  g.fillStyle(color('outline'), 1);
  g.fillRect(0, h - 20, w, 20);
  g.fillStyle(color('woodDark'), 1);
  g.fillRect(0, h - 19, w, 19);
  g.fillStyle(color('woodMid'), 1);
  g.fillRect(0, h - 16, w, 3);
  g.fillStyle(color('woodLight'), 1);
  g.fillRect(0, h - 19, w, 1);

  // Warm lantern dots along the counter edge.
  g.fillStyle(color('lanternYellow'), 1);
  for (let x = 12; x < w; x += 40) g.fillRect(x, h - 18 + ((x / 4) % 3), 2, 2);
}

export function icon(
  scene: Phaser.Scene,
  x: number,
  y: number,
  name: string,
): Phaser.GameObjects.Image {
  return scene.add.image(Math.round(x), Math.round(y), ATLAS_KEY, `icon/${name}`).setOrigin(0, 0);
}

/** "2.4 stars" style text; singular "1 star". One decimal (dropped on whole stars) keeps it narrow. */
export function starsText(reputation: number): string {
  return `${starsNumber(reputation)} ${starsUnit(reputation)}`;
}

/** Just the rating number ("2.4" or "1") for a compact "2.4/5" badge. */
export function starsNumber(reputation: number): string {
  const n = Math.min(reputation, 5);
  return Number.isInteger(n) ? `${n}` : n.toFixed(1);
}

function starsUnit(reputation: number): string {
  return Math.abs(Math.min(reputation, 5) - 1) < 0.05 ? 'star' : 'stars';
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** One status line (coins, stars, day) used by every meta screen. */
export function statusLine(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Text {
  return pixelText(scene, x, y, '', { token: 'cream' });
}

/** A text line under a panel that doubles as the error/confirmation channel. */
export function messageLine(
  scene: Phaser.Scene,
  y = NATIVE_HEIGHT - 34,
): {
  say(text: string, good?: boolean): void;
  text: Phaser.GameObjects.Text;
} {
  const text = pixelText(scene, NATIVE_WIDTH / 2, y, '', { token: 'brothGold', originX: 0.5 });
  return {
    text,
    say(message, good = true) {
      text.setText(message);
      text.setColor(good ? PALETTE.lanternYellow : PALETTE.sakura);
    },
  };
}
