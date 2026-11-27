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
import { RegularsScene } from './meta/RegularsScene';
import { session } from './meta/session';
import { audio } from './audio/manager';
import { loadAudioSettings } from './audio/controller';

// Saved preferences must be applied before any settings UI or audible output exists: a first
// gesture during the read must not start audio with default (unmuted) settings. The
// AudioContext itself is still created lazily inside the gesture handler below.
void loadAudioSettings().then(boot);

function boot(): void {
  /** Browser autoplay policy: an AudioContext may only start inside a real user gesture. */
  function unlockAudio(): void {
    void audio.unlock();
    audio.startMusic();
  }
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });
  // UI click for every Phaser pointer-up; panel controls rely on this single click source.
  window.addEventListener('pointerdown', () => audio.play('click'));

  // `?scene=shop|service|boot|title|prep|report|upgrades|regulars` boots straight into that scene
  // (e2e / shots). With no param the game opens on the title screen.
  const requested = new URLSearchParams(window.location.search).get('scene');

  const meta = [TitleScene, PrepScene, ReportScene, UpgradeScene, RegularsScene];

  /**
   * Direct URLs into prep/report/upgrades/regulars need a live session; booting straight into one
   * with no session makes `session.state` throw "No game in progress". Redirect those to the title
   * screen, which loads or creates the session before the day-loop scenes can run.
   */
  const DIRECT_META = new Set(['prep', 'report', 'upgrades', 'regulars']);
  const first = requested && DIRECT_META.has(requested) ? 'title' : requested;

  /** The first scene in the list starts first; the rest stay registered for scene.start(). */
  function sceneList(firstScene: string | null): Phaser.Types.Scenes.SceneType[] {
    const all: Record<string, Phaser.Types.Scenes.SceneType> = {
      shop: ShopScene,
      service: ServiceScene,
      boot: BootScene,
      title: TitleScene,
      prep: PrepScene,
      report: ReportScene,
      upgrades: UpgradeScene,
      regulars: RegularsScene,
    };
    const start = (firstScene && all[firstScene]) || TitleScene;
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
    scene: sceneList(first),
  });

  window.addEventListener('resize', () => {
    game.scale.setZoom(computeIntegerZoom(window.innerWidth, window.innerHeight));
  });

  // Test hook for e2e / debugging only.
  (window as unknown as { __nyan: Phaser.Game }).__nyan = game;
  (window as unknown as { __nyanSession: typeof session }).__nyanSession = session;
  (window as unknown as { __nyanAudio: typeof audio }).__nyanAudio = audio;
}
