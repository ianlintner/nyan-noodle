import type Phaser from 'phaser';
import type { Doneness } from '@nyan-noodle/sim';
import { color } from '../theme/palette';
import { drawPanel, pixelText } from '../theme/hud';

/** Broth band the needle has to stay inside, as a 0..1 fraction of the bar. */
export const BROTH_LO = 0.4;
export const BROTH_HI = 0.8;
/** Samples per broth hold before the stage auto-advances. */
export const BROTH_SAMPLES = 60;
/** Noodle sweet spot centre per requested doneness. */
export const NOODLE_TARGETS: Record<Doneness, number> = { soft: 0.55, firm: 0.7, default: 0.62 };

/** Cooking-panel geometry, shared by all three minigame renderers. */
export const STAGE_BAR = { x: 10, y: 78, w: 140, h: 14 };

/** Broth heat-hold bar: green band, red needle, cream progress strip. */
export function drawBroth(g: Phaser.GameObjects.Graphics, heat: number, samples: number): void {
  const { x, y, w, h } = STAGE_BAR;
  g.clear();
  g.fillStyle(color('noriGreen'), 1);
  g.fillRect(x + w * BROTH_LO, y, w * (BROTH_HI - BROTH_LO), h);
  g.fillStyle(color('chiliRed'), 1);
  g.fillRect(x + w * heat - 1, y - 3, 2, h + 6);
  g.lineStyle(1, color('steamWhite'), 0.4);
  g.strokeRect(x, y - 1, w, h + 2);
  g.fillStyle(color('cream'), 1);
  g.fillRect(x, y + h + 3, w * (samples / BROTH_SAMPLES), 3);
}

/** Noodle boil timer: green sweet-spot band around the doneness target, gold sweep. */
export function drawNoodles(
  g: Phaser.GameObjects.Graphics,
  doneness: Doneness,
  sweep: number,
): void {
  const { x, y, w, h } = STAGE_BAR;
  const target = NOODLE_TARGETS[doneness];
  g.clear();
  g.fillStyle(color('noriGreen'), 1);
  g.fillRect(x + w * (target - 0.08), y, w * 0.16, h);
  g.fillStyle(color('brothGold'), 1);
  g.fillRect(x + w * sweep - 1, y - 3, 2, h + 6);
  g.lineStyle(1, color('steamWhite'), 0.4);
  g.strokeRect(x, y - 1, w, h + 2);
}

/** Session-mode side panel: what today's service looks like before the doors open. */
export function drawTodayPanel(scene: Phaser.Scene, lines: readonly string[]): void {
  const { content } = drawPanel(scene, 166, 34, 310, 120, { title: 'Today' });
  lines.forEach((line, i) => pixelText(scene, content.x + 2, content.y + 4 + i * 12, line));
}

/** Topping assembly: one square per required topping, green once applied. */
export function drawToppings(g: Phaser.GameObjects.Graphics, required: number, done: number): void {
  const { x, w } = STAGE_BAR;
  g.clear();
  for (let i = 0; i < required; i++) {
    const cx = x + 6 + i * ((w - 12) / Math.max(1, required - 1));
    g.fillStyle(color(done > i ? 'noriGreen' : 'slate'), 1);
    g.fillRect(cx, STAGE_BAR.y + 4, 8, 8);
  }
}
