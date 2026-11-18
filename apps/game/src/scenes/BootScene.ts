import Phaser from 'phaser';
import { createRng } from '@nyan-noodle/sim';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { PALETTE, PALETTE_TOKENS, color } from '../theme/palette';
import { SHOP_SCENE_KEY } from '../shop/ShopScene';
import { createButton, drawPanel, pixelText } from '../theme/hud';

export const BOOT_SCENE_KEY = 'BootScene';

const SWATCH = 16;
const SWATCH_GAP = 2;
const SWATCH_COLUMNS = 8;

/** Empty boot scene: palette swatches + a sample HUD panel/button. No gameplay. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(BOOT_SCENE_KEY);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.nightBlue);
    this.drawSwatches(8, 8);
    this.drawSamplePanel(200, 8, 272, 120);
    pixelText(this, NATIVE_WIDTH / 2, NATIVE_HEIGHT - 12, 'NYAN NOODLE  -  boot scene', {
      token: 'lanternYellow',
      originX: 0.5,
      originY: 0.5,
    });
    // Expose a readiness flag so e2e can wait for the first rendered scene.
    (this.game.registry as Phaser.Data.DataManager).set('bootReady', true);
  }

  private drawSwatches(originX: number, originY: number): void {
    const g = this.add.graphics();
    PALETTE_TOKENS.forEach((token, i) => {
      const col = i % SWATCH_COLUMNS;
      const row = Math.floor(i / SWATCH_COLUMNS);
      const x = originX + col * (SWATCH + SWATCH_GAP + 6);
      const y = originY + row * (SWATCH + SWATCH_GAP + 12);
      g.fillStyle(color('outline'), 1);
      g.fillRect(x - 1, y - 1, SWATCH + 2, SWATCH + 2);
      g.fillStyle(color(token), 1);
      g.fillRect(x, y, SWATCH, SWATCH);
    });
    // Labels are abbreviated to the first 4 chars so they fit under each swatch.
    PALETTE_TOKENS.forEach((token, i) => {
      const col = i % SWATCH_COLUMNS;
      const row = Math.floor(i / SWATCH_COLUMNS);
      const x = originX + col * (SWATCH + SWATCH_GAP + 6);
      const y = originY + row * (SWATCH + SWATCH_GAP + 12);
      pixelText(this, x, y + SWATCH + 2, token.slice(0, 4), { token: 'cream' });
    });
  }

  private drawSamplePanel(x: number, y: number, width: number, height: number): void {
    const { content } = drawPanel(this, x, y, width, height, { title: 'Sample HUD panel' });
    const rng = createRng(2026);
    pixelText(this, content.x + 4, content.y + 4, 'Ink on cream, 8px pixel font.');
    pixelText(this, content.x + 4, content.y + 16, `Seeded sim RNG ok: ${rng.int(1, 99)}`);
    createButton(this, content.x + 4, content.y + 36, 72, 18, 'Open shop', () => {
      this.scene.start(SHOP_SCENE_KEY);
    });
    createButton(this, content.x + 84, content.y + 36, 72, 18, 'Menu', () => undefined);
  }
}
