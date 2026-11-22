import Phaser from 'phaser';
import { TILE_SIZE } from '../config';
import { ATLAS_KEY, cellFeetY } from './CatActor';
import type { ShopLayout } from './layout';

/**
 * Animated steam puffs rising from each stove: a loop of small steam sprites wandering
 * up and fading out. Purely cosmetic; per-stove offset so puffs don't sync.
 *
 * The returned cleanup destroys every pending tween and delayed call as well as the
 * puff sprites, so a layout rebuild (build mode edits, tier upgrade) never leaves an
 * orphaned self-perpetuating tween loop behind — orphaned loops crashed the headless
 * (software-GL) renderer under repeated relayouts.
 */
export function startSteam(
  scene: Phaser.Scene,
  layout: ShopLayout,
  uiCam: Phaser.Cameras.Scene2D.Camera,
): () => void {
  const puffs: Phaser.GameObjects.Image[] = [];
  const tweens: Phaser.Tweens.Tween[] = [];
  const timers: Phaser.Time.TimerEvent[] = [];
  let alive = true;

  layout.stoves.forEach((stove, i) => {
    const px = stove.tx * TILE_SIZE + TILE_SIZE / 2;
    const py = stove.ty * TILE_SIZE + 2;
    const puff = scene.add.image(px, py, ATLAS_KEY, 'fx/steam');
    puff
      .setOrigin(0.5, 1)
      .setAlpha(0)
      .setDepth(cellFeetY(stove.ty) + 3);
    uiCam.ignore(puff);

    // Each stove owns a looping tween that re-triggers a steam puff forever.
    const cycle = (): void => {
      if (!alive) return;
      puff.setPosition(px + Phaser.Math.Between(-2, 2), py).setAlpha(0.7);
      const tween = scene.tweens.add({
        targets: puff,
        y: py - 10 - Phaser.Math.Between(0, 4),
        alpha: 0,
        x: px + Phaser.Math.Between(-4, 4),
        duration: 900 + Phaser.Math.Between(0, 300),
        ease: 'Sine.easeOut',
        onComplete: cycle,
      });
      tweens.push(tween);
    };
    const timer = scene.time.delayedCall(120 * i, cycle);
    timers.push(timer);
    puffs.push(puff);
  });

  return () => {
    alive = false;
    for (const t of timers) t.remove();
    for (const tw of tweens) tw.remove();
    for (const p of puffs) p.destroy();
  };
}
