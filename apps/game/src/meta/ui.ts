import type Phaser from 'phaser';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { PALETTE, color } from '../theme/palette';
import { pixelText } from '../theme/hud';
import { ATLAS_KEY } from '../shop/CatActor';

export const SCENE_KEYS = {
  title: 'TitleScene',
  prep: 'PrepScene',
  report: 'ReportScene',
  upgrades: 'UpgradeScene',
} as const;

/** Queue the shared sprite atlas (cached after the first scene loads it). */
export function loadAtlas(scene: Phaser.Scene): void {
  scene.load.atlas(ATLAS_KEY, 'assets/nyan-atlas.png', 'assets/nyan-atlas.json');
}

/** Dusk backdrop: night-blue wall with a lantern-lit floor strip and a few warm dots. */
export function backdrop(scene: Phaser.Scene): void {
  scene.cameras.main.setBackgroundColor(PALETTE.nightBlue);
  const g = scene.add.graphics();
  g.fillStyle(color('outline'), 1);
  g.fillRect(0, NATIVE_HEIGHT - 20, NATIVE_WIDTH, 20);
  g.fillStyle(color('woodDark'), 1);
  g.fillRect(0, NATIVE_HEIGHT - 19, NATIVE_WIDTH, 19);
  g.fillStyle(color('lanternYellow'), 1);
  for (let x = 12; x < NATIVE_WIDTH; x += 40) g.fillRect(x, 6 + ((x / 4) % 5), 2, 2);
}

export function icon(
  scene: Phaser.Scene,
  x: number,
  y: number,
  name: string,
): Phaser.GameObjects.Image {
  return scene.add.image(Math.round(x), Math.round(y), ATLAS_KEY, `icon/${name}`).setOrigin(0, 0);
}

/** "2.4" style star text; one decimal keeps the HUD narrow. */
export function starsText(reputation: number): string {
  return reputation.toFixed(1);
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
