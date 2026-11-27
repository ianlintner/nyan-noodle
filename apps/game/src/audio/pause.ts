import Phaser from 'phaser';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { createButton, drawPanel, pixelText } from '../theme/hud';
import { createSettingsPanel } from './settingsPanel';
import type { AudioSettings } from './settings';

export interface PauseOverlay {
  readonly active: boolean;
  toggle(): void;
  destroy(): void;
}

/**
 * In-game pause: dims the scene, pauses the scene clock and hosts the shared audio settings
 * panel. The caller supplies `onChange` to persist edits; this helper owns presentation and
 * pause/resume only. Phaser input events still fire on a paused scene, so buttons and ESC work.
 *
 * `register` is called for every newly created display object so scenes with a separate UI
 * camera can exclude the overlay from the world camera even when it is created after the
 * scene's initial HUD pass.
 */
export function createPauseOverlay(
  scene: Phaser.Scene,
  onChange: (settings: AudioSettings) => void,
  register?: (object: Phaser.GameObjects.GameObject) => void,
): PauseOverlay {
  let active = false;
  let owned: Phaser.GameObjects.GameObject[] = [];

  // ESC opens as well as closes the overlay; the key is not consumed by scene.pause().
  const key = scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

  function toggle(): void {
    if (active) {
      owned.forEach((o) => o.destroy());
      owned = [];
      active = false;
      scene.scene.resume();
      return;
    }
    active = true;
    const before = new Set(scene.children.list);
    scene.scene.pause();

    scene.add
      .rectangle(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT, 0x1a1426, 0.82)
      .setOrigin(0, 0)
      .setInteractive();
    drawPanel(scene, 96, 48, 288, 164, { title: 'Paused' });
    pixelText(scene, NATIVE_WIDTH / 2, 202, 'ESC to resume', {
      token: 'cream',
      originX: 0.5,
    });
    createButton(scene, 180, 196, 120, 16, 'Resume', () => toggle());
    createSettingsPanel(scene, 124, 72, 232, 116, onChange);
    // Every object created above is new; destroy them as one set on resume. A scene with
    // a UI camera also needs each one excluded from the world camera here: its earlier
    // HUD-exclusion pass ran before this overlay existed.
    for (const o of scene.children.list) {
      if (!before.has(o)) {
        owned.push(o);
        register?.(o);
      }
    }
  }

  const onKey = (): void => {
    toggle();
  };
  key?.on('down', onKey);

  return {
    get active() {
      return active;
    },
    toggle,
    destroy() {
      if (active) toggle();
      key?.off('down', onKey);
    },
  };
}

/** Install the pause overlay for a single-camera scene and tear it down on shutdown. */
export function installPause(
  scene: Phaser.Scene,
  onChange: (settings: AudioSettings) => void,
): PauseOverlay {
  const overlay = createPauseOverlay(scene, onChange);
  scene.events.once('shutdown', () => overlay.destroy());
  return overlay;
}
