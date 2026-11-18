import Phaser from 'phaser';
import { NATIVE_HEIGHT, NATIVE_WIDTH, computeIntegerZoom } from './config';
import { PALETTE } from './theme/palette';
import { BootScene } from './scenes/BootScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: NATIVE_WIDTH,
  height: NATIVE_HEIGHT,
  backgroundColor: PALETTE.nightBlue,
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.NONE,
    zoom: computeIntegerZoom(window.innerWidth, window.innerHeight),
  },
  scene: [BootScene],
});

window.addEventListener('resize', () => {
  game.scale.setZoom(computeIntegerZoom(window.innerWidth, window.innerHeight));
});

// Test hook for e2e / debugging only.
(window as unknown as { __nyan: Phaser.Game }).__nyan = game;
