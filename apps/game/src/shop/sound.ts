import type Phaser from 'phaser';
import { audio } from '../audio/manager';
import { createPauseOverlay } from '../audio/pause';
import { persistAudioSettings } from '../audio/controller';
import type { ShopEvent } from './director';

export interface ShopSoundSource {
  events(): readonly ShopEvent[];
  beat(): number;
}

export const shopSoundSource = (
  events: () => readonly ShopEvent[],
  beat: () => number,
): ShopSoundSource => ({ events, beat });

/** Shop-side audio: service music, in-game pause (ESC) and event-driven SFX. */
export class ShopSound {
  private lastBeat = 0;
  private lastSeen = 0;
  private pause: ReturnType<typeof createPauseOverlay> | null = null;
  private source: ShopSoundSource | null = null;

  install(scene: Phaser.Scene, source: ShopSoundSource): void {
    this.source = source;
    audio.setMusicMode('service');
    this.pause = createPauseOverlay(scene, persistAudioSettings);
    scene.events.on('update', this.tick, this);
    scene.events.once('shutdown', this.destroy, this);
  }

  private tick(): void {
    if (!this.source) return;
    const events = this.source.events();
    const beat = this.source.beat();
    if (beat < this.lastBeat) this.lastSeen = 0;
    this.lastBeat = beat;
    for (let i = this.lastSeen; i < events.length; i++) {
      const type = events[i]!.type;
      if (type === 'queue') audio.play('ticket');
      else if (type === 'enter') audio.play('sizzle');
      else if (type === 'sit') audio.play('meow');
      else if (type === 'leave') audio.play('coins');
    }
    this.lastSeen = events.length;
  }

  destroy(): void {
    this.pause?.destroy();
    this.pause = null;
    this.source = null;
  }
}
