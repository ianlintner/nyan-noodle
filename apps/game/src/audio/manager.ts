import { channelGain } from './volume';
import { DEFAULT_AUDIO_SETTINGS, type AudioSettings } from './settings';
import { MusicSynth, playSfx } from './synth';
import type { AudioContextLike, GainLike, MusicMode, SfxName } from './synth';

type ContextFactory = () => AudioContextLike;

/** Default browser factory; injected in tests so no real output device is touched. */
export function browserAudioContext(): AudioContextLike {
  const Ctor = (
    globalThis as unknown as { AudioContext?: new () => AudioContextLike; webkitAudioContext?: new () => AudioContextLike }
  ).AudioContext ?? (
    globalThis as unknown as { webkitAudioContext?: new () => AudioContextLike }
  ).webkitAudioContext;
  if (!Ctor) throw new Error('WebAudio is not available in this browser');
  return new Ctor();
}

/**
 * Owns the AudioContext, two gain buses, the music loop and one-shot SFX. Nothing is created
 * until `unlock()` is called from a real user gesture, which satisfies browser autoplay rules.
 * Volume/mute math is pure (`channelGain`) and works before the context exists.
 */
export class AudioManager {
  private settings: AudioSettings = DEFAULT_AUDIO_SETTINGS;
  private ctx: AudioContextLike | null = null;
  private masterGain: GainLike | null = null;
  private musicGain: GainLike | null = null;
  private sfxGain: GainLike | null = null;
  private music: MusicSynth | null = null;
  private mode: MusicMode = 'prep';
  private musicWanted = false;

  constructor(private readonly createContext: ContextFactory = browserAudioContext) {}

  get state(): AudioSettings {
    return this.settings;
  }

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  /** Call once from the first click/key; safe to call repeatedly. */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      try {
        this.ctx = this.createContext();
      } catch {
        return; // Audio is optional: the game stays playable with sound unavailable.
      }
      this.masterGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyGains();
      this.music = new MusicSynth(this.ctx, this.musicGain);
      this.music.setMode(this.mode);
    }
    try {
      await this.ctx.resume();
    } catch {
      // A suspended context is not fatal; the next gesture can retry.
    }
    if (this.musicWanted) this.music?.start();
  }

  /** Replace all settings (e.g. after a settings-store read). */
  configure(settings: AudioSettings): void {
    this.settings = settings;
    this.applyGains();
  }

  setVolume(channel: 'master' | 'music' | 'sfx', value: number): void {
    this.settings = { ...this.settings, [channel]: Math.min(1, Math.max(0, value)) };
    this.applyGains();
  }

  setMuted(muted: boolean): void {
    this.settings = { ...this.settings, muted };
    this.applyGains();
  }

  toggleMute(): boolean {
    this.setMuted(!this.settings.muted);
    return this.settings.muted;
  }

  /** Master gain is 0 while muted even though individual bus faders retain their positions. */
  effectiveGain(channel: 'music' | 'sfx'): number {
    return channelGain(this.settings, channel);
  }

  private applyGains(): void {
    if (!this.ctx || !this.masterGain || !this.musicGain || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.setValueAtTime(this.settings.muted ? 0 : 1, t);
    this.musicGain.gain.setValueAtTime(channelGain(this.settings, 'music'), t);
    this.sfxGain.gain.setValueAtTime(channelGain(this.settings, 'sfx'), t);
  }

  setMusicMode(mode: MusicMode): void {
    this.mode = mode;
    this.music?.setMode(mode);
  }

  startMusic(): void {
    this.musicWanted = true;
    if (this.ctx) this.music?.start();
  }

  stopMusic(): void {
    this.musicWanted = false;
    this.music?.stop();
  }

  play(name: SfxName): void {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    try {
      playSfx(this.ctx, this.sfxGain, name);
    } catch {
      // A failed effect must never break gameplay.
    }
  }

  /** Debug/e2e surface; does not create a context or emit sound. */
  snapshot(): { unlocked: boolean; mode: MusicMode; musicWanted: boolean; settings: AudioSettings } {
    return {
      unlocked: this.unlocked,
      mode: this.mode,
      musicWanted: this.musicWanted,
      settings: this.settings,
    };
  }
}

export const audio = new AudioManager();
