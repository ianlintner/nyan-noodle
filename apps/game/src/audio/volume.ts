import type { AudioSettings } from './settings';

/** Effective gain for a channel: muted means silence everywhere, master scales each bus. */
export function channelGain(
  settings: AudioSettings,
  channel: 'music' | 'sfx',
): number {
  if (settings.muted) return 0;
  const level = channel === 'music' ? settings.music : settings.sfx;
  return clamp01(settings.master * level);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Linear-to-perceptual mapping for slider UI; square law keeps quiet detail usable. */
export function sliderToVolume(slider: number): number {
  return clamp01(slider) ** 2;
}

export function volumeToSlider(volume: number): number {
  return Math.sqrt(clamp01(volume));
}
