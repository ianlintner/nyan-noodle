import type Phaser from 'phaser';
import { createButton, drawPanel, pixelText } from '../theme/hud';
import { audio } from './manager';
import { sliderToVolume, volumeToSlider } from './volume';
import type { AudioSettings } from './settings';

/** Rows are 1..10 steppers on a perceptual (square-law) fader, plus a mute toggle. */
const STEP = 0.1;

function bump(value: number, direction: number): number {
  const slider = volumeToSlider(value);
  const next = Math.min(1, Math.max(0, Math.round((slider + direction * STEP) * 10) / 10));
  return sliderToVolume(next);
}

function faderLabel(value: number): string {
  return `${Math.round(volumeToSlider(value) * 10)}`;
}

export interface SettingsPanel {
  /** Repaint all rows from the manager's current settings. */
  refresh(): void;
  destroy(): void;
}

/**
 * Shared master/music/sfx/mute panel for the title screen and the in-game pause overlay.
 * `onChange` receives the new settings after every edit so callers can persist them.
 */
export function createSettingsPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  onChange: (settings: AudioSettings) => void,
): SettingsPanel {
  // drawPanel creates a graphics object and a header text; capture both so destroy() leaves
  // no panel behind and repeated open/close cycles do not accumulate objects.
  const before = new Set(scene.children.list);
  const { content } = drawPanel(scene, x, y, width, height, { title: 'Audio' });
  const panelObjects = scene.children.list.filter((o) => !before.has(o));
  const px = content.x + 6;
  const pw = content.width - 12;
  const rowY = content.y + 4;

  const labels: Record<'master' | 'music' | 'sfx', Phaser.GameObjects.Text> = {
    master: pixelText(scene, px, rowY, 'Master'),
    music: pixelText(scene, px, rowY + 22, 'Music'),
    sfx: pixelText(scene, px, rowY + 44, 'SFX'),
  };
  const buttons = {
    master: createButton(scene, px + 62, rowY - 2, 24, 14, '-', () => edit('master', -1)),
    music: createButton(scene, px + 62, rowY + 20, 24, 14, '-', () => edit('music', -1)),
    sfx: createButton(scene, px + 62, rowY + 42, 24, 14, '-', () => edit('sfx', -1)),
  };
  const plus = {
    master: createButton(scene, px + 92, rowY - 2, 24, 14, '+', () => edit('master', 1)),
    music: createButton(scene, px + 92, rowY + 20, 24, 14, '+', () => edit('music', 1)),
    sfx: createButton(scene, px + 92, rowY + 42, 24, 14, '+', () => edit('sfx', 1)),
  };
  const mute = createButton(scene, px, rowY + 64, pw, 14, 'Mute: off', () => {
    audio.setMuted(!audio.state.muted);
    refresh();
    onChange(audio.state);
  });

  type Channel = 'master' | 'music' | 'sfx';
  function edit(channel: Channel, direction: number): void {
    audio.setVolume(channel, bump(audio.state[channel], direction));
    refresh();
    onChange(audio.state);
  }

  function refresh(): void {
    for (const channel of ['master', 'music', 'sfx'] as const) {
      labels[channel].setText(
        `${channel[0]!.toUpperCase()}${channel.slice(1)} ${faderLabel(audio.state[channel])}`,
      );
    }
    mute.setLabel(audio.state.muted ? 'Mute: ON' : 'Mute: off');
  }
  refresh();

  return {
    refresh,
    destroy() {
      Object.values(labels).forEach((t) => t.destroy());
      Object.values(buttons).forEach((b) => b.container.destroy());
      Object.values(plus).forEach((b) => b.container.destroy());
      mute.container.destroy();
      panelObjects.forEach((o) => o.destroy());
    },
  };
}
