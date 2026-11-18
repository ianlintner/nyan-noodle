import Phaser from 'phaser';
import { NATIVE_HEIGHT, NATIVE_WIDTH, computeIntegerZoom } from './config';
import { PALETTE } from './theme/palette';
import { BootScene } from './scenes/BootScene';
import { ShopScene } from './shop/ShopScene';
import { ServiceScene } from './service/ServiceScene';

// `?scene=shop` or `?scene=service` boots straight into that scene (e2e / shots).
const requested = new URLSearchParams(window.location.search).get('scene');

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
  scene:
    requested === 'shop'
      ? [ShopScene, BootScene]
      : requested === 'service'
        ? [ServiceScene, BootScene]
        : [BootScene, ShopScene, ServiceScene],
});

window.addEventListener('resize', () => {
  game.scale.setZoom(computeIntegerZoom(window.innerWidth, window.innerHeight));
});

// Test hook for e2e / debugging only.
(window as unknown as { __nyan: Phaser.Game }).__nyan = game;
