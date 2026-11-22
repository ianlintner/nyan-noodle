import { describe, expect, it, vi } from 'vitest';
import { AudioManager } from './manager';
import type {
  AudioBufferLike,
  AudioContextLike,
  AudioNodeLike,
  BufferSourceLike,
  GainLike,
  OscillatorLike,
} from './synth';
import { DEFAULT_AUDIO_SETTINGS } from './settings';

interface Fake {
  ctx: AudioContextLike;
  gains: FakeGain[];
  oscillators: FakeOscillator[];
  sources: FakeBufferSource[];
}

class FakeGain implements GainLike {
  gain = { value: 1, setValueAtTime: vi.fn((value: number) => (this.gain.value = value)) };
  connections: AudioNodeLike[] = [];
  connect(node: AudioNodeLike): void {
    this.connections.push(node);
  }
  disconnect(): void {
    this.connections = [];
  }
}

class FakeOscillator implements OscillatorLike {
  type: OscillatorType = 'sine';
  frequency = {
    value: 0,
    setValueAtTime: vi.fn((value: number) => (this.frequency.value = value)),
  };
  started: number[] = [];
  stopped: number[] = [];
  connections: AudioNodeLike[] = [];
  connect(node: AudioNodeLike): void {
    this.connections.push(node);
  }
  disconnect(): void {
    this.connections = [];
  }
  start(when = 0): void {
    this.started.push(when);
  }
  stop(when = 0): void {
    this.stopped.push(when);
  }
}

class FakeBufferSource implements BufferSourceLike {
  buffer: AudioBufferLike | null = null;
  loop = false;
  started = 0;
  stopped = 0;
  connect(): void {}
  disconnect(): void {}
  start(when = 0): void {
    this.started = when;
  }
  stop(when = 0): void {
    this.stopped = when;
  }
}

function fakeContext(): Fake {
  const gains: FakeGain[] = [];
  const oscillators: FakeOscillator[] = [];
  const sources: FakeBufferSource[] = [];
  const ctx: AudioContextLike = {
    currentTime: 10,
    sampleRate: 44100,
    destination: { connect(): void {}, disconnect(): void {} },
    createGain: () => {
      const g = new FakeGain();
      gains.push(g);
      return g;
    },
    createOscillator: () => {
      const o = new FakeOscillator();
      oscillators.push(o);
      return o;
    },
    createBufferSource: () => {
      const s = new FakeBufferSource();
      sources.push(s);
      return s;
    },
    createBuffer: (_channels, length, sampleRate) => ({
      duration: length / sampleRate,
      getChannelData: () => new Float32Array(length),
    }),
    resume: vi.fn(async () => undefined),
  };
  return { ctx, gains, oscillators, sources };
}

describe('AudioManager', () => {
  it('does not create a context before a user gesture', async () => {
    const factory = vi.fn(() => fakeContext().ctx);
    const manager = new AudioManager(factory);
    expect(manager.unlocked).toBe(false);
    expect(manager.snapshot().settings).toEqual(DEFAULT_AUDIO_SETTINGS);
    manager.play('click'); // no-op before unlock
    expect(factory).not.toHaveBeenCalled();
    await manager.unlock();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(manager.unlocked).toBe(true);
    await manager.unlock(); // idempotent
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('applies master/music/sfx and mute to the bus gains', async () => {
    const fake = fakeContext();
    const manager = new AudioManager(() => fake.ctx);
    await manager.unlock();
    const [master, music, sfx] = fake.gains;
    manager.configure({ master: 0.5, music: 0.4, sfx: 0.8, muted: false });
    expect(manager.effectiveGain('music')).toBeCloseTo(0.2);
    expect(manager.effectiveGain('sfx')).toBeCloseTo(0.4);
    expect(master!.gain.value).toBe(1);
    expect(music!.gain.value).toBeCloseTo(0.2);
    expect(sfx!.gain.value).toBeCloseTo(0.4);
    manager.setMuted(true);
    expect(manager.effectiveGain('music')).toBe(0);
    expect(master!.gain.value).toBe(0);
    expect(manager.toggleMute()).toBe(false);
    expect(master!.gain.value).toBe(1);
    manager.setVolume('sfx', 2);
    expect(manager.state.sfx).toBe(1);
    expect(manager.effectiveGain('sfx')).toBeCloseTo(0.5);
  });

  it('schedules music loops and SFX only after unlock', async () => {
    const fake = fakeContext();
    const manager = new AudioManager(() => fake.ctx);
    manager.startMusic();
    expect(fake.oscillators).toHaveLength(0);
    await manager.unlock();
    manager.setMusicMode('service');
    manager.startMusic();
    expect(manager.snapshot()).toMatchObject({ mode: 'service', musicWanted: true });
    expect(fake.oscillators.length).toBeGreaterThan(0);
    expect(fake.sources.length).toBeGreaterThan(0);
    const before = fake.oscillators.length;
    manager.stopMusic();
    manager.play('coins');
    expect(fake.oscillators.length).toBeGreaterThan(before);
    manager.setMuted(true);
    const mutedCount = fake.oscillators.length;
    manager.play('click');
    expect(fake.oscillators).toHaveLength(mutedCount);
    manager.stopMusic();
  });

  it('stopping music silences sources already scheduled ahead', async () => {
    const fake = fakeContext();
    const manager = new AudioManager(() => fake.ctx);
    await manager.unlock();
    manager.setMusicMode('service');
    manager.startMusic();
    expect(fake.sources.length).toBeGreaterThan(0);
    const scheduled = [...fake.oscillators, ...fake.sources];
    const stoppedAt = (s: (typeof scheduled)[number]): boolean =>
      Array.isArray(s.stopped) ? s.stopped.includes(10) : s.stopped === 10;
    expect(scheduled.every((s) => !stoppedAt(s))).toBe(true);
    manager.stopMusic();
    // Every scheduled source received a stop() at the current time; none keep playing.
    expect(scheduled.every(stoppedAt)).toBe(true);
  });

  it('keeps working when WebAudio is unavailable', async () => {
    const manager = new AudioManager(() => {
      throw new Error('no device');
    });
    await expect(manager.unlock()).resolves.toBeUndefined();
    expect(manager.unlocked).toBe(false);
    manager.play('meow');
  });
});
