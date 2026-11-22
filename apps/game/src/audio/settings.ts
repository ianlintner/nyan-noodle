/** Player audio preferences, shared by the settings panel and the audio manager. */
export interface AudioSettings {
  readonly master: number;
  readonly music: number;
  readonly sfx: number;
  readonly muted: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  master: 0.8,
  music: 0.55,
  sfx: 0.9,
  muted: false,
};

export const AUDIO_SETTINGS_KEY = 'nyan-noodle/settings';

/** Clamp a settings volume to the 0..1 range; bad numbers fall back to `fallback`. */
export function clampVolume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

/** Reject malformed/stale settings fields instead of trusting parsed JSON. */
export function parseAudioSettings(text: string | null): AudioSettings {
  if (!text) return DEFAULT_AUDIO_SETTINGS;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
  if (typeof raw !== 'object' || raw === null) return DEFAULT_AUDIO_SETTINGS;
  const value = raw as Record<string, unknown>;
  return {
    master: clampVolume(value.master, DEFAULT_AUDIO_SETTINGS.master),
    music: clampVolume(value.music, DEFAULT_AUDIO_SETTINGS.music),
    sfx: clampVolume(value.sfx, DEFAULT_AUDIO_SETTINGS.sfx),
    muted: typeof value.muted === 'boolean' ? value.muted : DEFAULT_AUDIO_SETTINGS.muted,
  };
}

/** Stable JSON so a settings write never depends on key insertion order. */
export function serializeAudioSettings(settings: AudioSettings): string {
  return JSON.stringify({
    master: settings.master,
    music: settings.music,
    sfx: settings.sfx,
    muted: settings.muted,
  });
}

/**
 * Audio preferences live beside the save slot but independent of the game save: erasing or
 * importing a save must not reset how loud the player's machine is. Backend failures are
 * reported by `write()`; settings keep working in memory either way.
 */
export class AudioSettingsStore {
  lastError: string | null = null;

  constructor(
    private readonly get: (key: string) => Promise<string | null>,
    private readonly set: (key: string, value: string) => Promise<void>,
  ) {}

  async read(): Promise<AudioSettings> {
    try {
      const text = await this.get(AUDIO_SETTINGS_KEY);
      this.lastError = null;
      return parseAudioSettings(text);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return DEFAULT_AUDIO_SETTINGS;
    }
  }

  async write(settings: AudioSettings): Promise<void> {
    await this.set(AUDIO_SETTINGS_KEY, serializeAudioSettings(settings));
    this.lastError = null;
  }
}
