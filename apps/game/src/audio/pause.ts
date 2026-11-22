import Phaser from 'phaser';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { createButton, drawPanel, pixelText } from '../theme/hud';
import { audio } from './manager';
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
 */
export function createPauseOverlay(
  scene: Phaser.Scene,
  onChange: (settings: AudioSettings) => void,
): PauseOverlay {
  let active = false;
  let owned: Phaser.GameObjects.GameObject[] = [];

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

    scene.add.rectangle(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT, 0x1a1426, 0.82).setOrigin(0, 0);
    drawPanel(scene, 96, 48, 288, 164, { title: 'Paused' });
    pixelText(scene, NATIVE_WIDTH / 2, 202, 'ESC to resume', {
      token: 'cream',
      originX: 0.5,
    });
    createButton(scene, 180, 196, 120, 16, 'Resume', () => toggle());
    createSettingsPanel(scene, 124, 72, 232, 116, onChange);
    // Every object created above is new; destroy them as one set on resume.
    for (const o of scene.children.list) if (!before.has(o)) owned.push(o);
    audio.play('click');
  }

  const onKey = (): void => {
    if (active) toggle();
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
