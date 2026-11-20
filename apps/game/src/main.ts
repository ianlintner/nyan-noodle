import Phaser from 'phaser';
import { NATIVE_HEIGHT, NATIVE_WIDTH, computeIntegerZoom } from './config';
import { PALETTE } from './theme/palette';
import { BootScene } from './scenes/BootScene';
import { ShopScene } from './shop/ShopScene';
import { ServiceScene } from './service/ServiceScene';
import { TitleScene } from './meta/TitleScene';
import { PrepScene } from './meta/PrepScene';
import { ReportScene } from './meta/ReportScene';
import { UpgradeScene } from './meta/UpgradeScene';
import { session } from './meta/session';

// `?scene=shop|service|boot|title|prep|report|upgrades` boots straight into that scene
// (e2e / shots). With no param the game opens on the title screen.
const requested = new URLSearchParams(window.location.search).get('scene');

const meta = [TitleScene, PrepScene, ReportScene, UpgradeScene];

/** The first scene in the list starts first; the rest stay registered for scene.start(). */
function sceneList(first: string | null): Phaser.Types.Scenes.SceneType[] {
  const all: Record<string, Phaser.Types.Scenes.SceneType> = {
    shop: ShopScene,
    service: ServiceScene,
    boot: BootScene,
    title: TitleScene,
    prep: PrepScene,
    report: ReportScene,
    upgrades: UpgradeScene,
  };
  const start = (first && all[first]) || TitleScene;
  return [start, ...[BootScene, ShopScene, ServiceScene, ...meta].filter((s) => s !== start)];
}

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
  scene: sceneList(requested),
});

window.addEventListener('resize', () => {
  game.scale.setZoom(computeIntegerZoom(window.innerWidth, window.innerHeight));
});

// Test hook for e2e / debugging only.
(window as unknown as { __nyan: Phaser.Game }).__nyan = game;
(window as unknown as { __nyanSession: typeof session }).__nyanSession = session;
