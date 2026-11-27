import type Phaser from 'phaser';
import { NATIVE_WIDTH, TILE_SIZE } from '../config';

/** Map a shop grid cell to page coordinates for pointer/e2e targeting. */
export function cellScreenPoint(
  scene: Phaser.Scene,
  x: number,
  y: number,
): { x: number; y: number } {
  const cam = scene.cameras.main;
  const rect = scene.game.canvas.getBoundingClientRect();
  const k = rect.width / NATIVE_WIDTH;
  const wx = (x + 1) * TILE_SIZE + TILE_SIZE / 2;
  const wy = (y + 1) * TILE_SIZE + TILE_SIZE / 2;
  return {
    x: rect.left + (wx - cam.worldView.x) * cam.zoom * k,
    y: rect.top + (wy - cam.worldView.y) * cam.zoom * k,
  };
}
