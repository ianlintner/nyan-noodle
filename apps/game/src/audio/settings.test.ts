import { describe, expect, it } from 'vitest';
import { memoryBackend } from '../meta/storage';
import {
  AUDIO_SETTINGS_KEY,
  AudioSettingsStore,
  DEFAULT_AUDIO_SETTINGS,
  clampVolume,
  parseAudioSettings,
  serializeAudioSettings,
} from './settings';
import { channelGain, sliderToVolume, volumeToSlider } from './volume';

describe('audio settings', () => {
  it('parses a complete saved object and rejects bad fields', () => {
    const saved = { master: 0.3, music: 0, sfx: 1, muted: true };
    expect(parseAudioSettings(JSON.stringify(saved))).toEqual(saved);
    expect(
      parseAudioSettings(JSON.stringify({ master: 5, music: -2, sfx: 'loud', muted: 'yes' })),
    ).toEqual({ master: 1, music: 0, sfx: DEFAULT_AUDIO_SETTINGS.sfx, muted: false });
    expect(parseAudioSettings('not json')).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(parseAudioSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(clampVolume(Number.NaN, 0.4)).toBe(0.4);
  });

  it('round-trips through the settings backend independently of the game save', async () => {
    const backend = memoryBackend();
    const store = new AudioSettingsStore(backend.get, backend.set);
    expect(await store.read()).toEqual(DEFAULT_AUDIO_SETTINGS);
    const next = { master: 0.42, music: 0.7, sfx: 0.25, muted: true };
    await store.write(next);
    expect(await backend.get(AUDIO_SETTINGS_KEY)).toBe(serializeAudioSettings(next));
    expect(await store.read()).toEqual(next);
    // The game save key is untouched: volume survives save erasure and import.
    expect(await backend.get('nyan-noodle/save')).toBeNull();
  });

  it('returns defaults and reports a read failure instead of throwing', async () => {
    const store = new AudioSettingsStore(
      () => Promise.reject(new Error('blocked')),
      () => Promise.resolve(),
    );
    expect(await store.read()).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(store.lastError).toMatch(/blocked/);
    await store.write(DEFAULT_AUDIO_SETTINGS);
    expect(store.lastError).toBeNull();
  });
});

describe('volume math', () => {
  const base = { master: 0.8, music: 0.5, sfx: 0.6, muted: false };

  it('scales channels by master and silences everything when muted', () => {
    expect(channelGain(base, 'music')).toBeCloseTo(0.4);
    expect(channelGain(base, 'sfx')).toBeCloseTo(0.48);
    expect(channelGain({ ...base, muted: true }, 'music')).toBe(0);
    expect(channelGain({ ...base, muted: true }, 'sfx')).toBe(0);
    expect(channelGain({ ...base, master: 0 }, 'music')).toBe(0);
    expect(channelGain({ ...base, music: 2 }, 'music')).toBe(1);
  });

  it('maps sliders perceptually and round-trips', () => {
    expect(sliderToVolume(0.5)).toBeCloseTo(0.25);
    expect(volumeToSlider(0.25)).toBeCloseTo(0.5);
    expect(sliderToVolume(-1)).toBe(0);
    expect(volumeToSlider(4)).toBe(1);
  });
});
