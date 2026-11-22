/**
 * Minimal WebAudio surface used by the synth. Keeping it structural lets unit tests supply a
 * fake AudioContext without loading a browser or producing sound.
 */
export interface AudioNodeLike {
  connect(destination: AudioNodeLike): void;
  disconnect(): void;
}

export interface GainLike extends AudioNodeLike {
  gain: { value: number; setValueAtTime(value: number, when: number): void };
}

export interface OscillatorLike extends AudioNodeLike {
  frequency: { value: number; setValueAtTime(value: number, when: number): void };
  type: OscillatorType;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface BufferSourceLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioBufferLike {
  duration: number;
  getChannelData(channel: number): Float32Array;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: AudioNodeLike;
  readonly sampleRate: number;
  createGain(): GainLike;
  createOscillator(): OscillatorLike;
  createBufferSource(): BufferSourceLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  resume(): Promise<void>;
  close?(): Promise<void>;
}

export type SfxName =
  | 'ticket'
  | 'sizzle'
  | 'boil'
  | 'topping'
  | 'servePerfect'
  | 'serveOk'
  | 'serveFail'
  | 'coins'
  | 'meow'
  | 'click';

export type MusicMode = 'prep' | 'service';

// A minor-pentatonic-ish loop: warm e-piano chords over a soft bass, with vinyl noise on top.
const PREP_CHORDS = [
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [196, 246.94, 293.66],
  [164.81, 196, 246.94],
];
const SERVICE_CHORDS = [
  [261.63, 329.63, 392],
  [220, 261.63, 329.63],
  [246.94, 293.66, 392],
  [196, 246.94, 293.66],
];
const STEP_SECONDS = 0.75;
const LOOP_STEPS = 8;
const LOOP_SECONDS = STEP_SECONDS * LOOP_STEPS;

function midiBass(frequency: number): number {
  return frequency / 2;
}

/**
 * Procedural lo-fi bed. Schedules short e-piano notes, bass and a vinyl-crackle buffer one
 * loop at a time; `setMode` switches between the calmer prep and brighter service variations.
 * All tone is generated at runtime: no downloaded or paid assets.
 */
export class MusicSynth {
  private mode: MusicMode = 'prep';
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextLoopAt = 0;
  private loopIndex = 0;
  private crackle: AudioBufferLike | null = null;

  constructor(
    private readonly ctx: AudioContextLike,
    private readonly bus: GainLike,
  ) {}

  setMode(mode: MusicMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.loopIndex = 0;
    this.stop();
    this.start();
  }

  start(): void {
    if (this.timer !== null) return;
    this.nextLoopAt = this.ctx.currentTime + 0.08;
    this.pump();
    this.timer = setInterval(() => this.pump(), 500);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private pump(): void {
    // Keep one loop scheduled ahead so timing survives a slow JS tick.
    while (this.nextLoopAt < this.ctx.currentTime + 1.5) {
      this.scheduleLoop(this.nextLoopAt);
      this.nextLoopAt += LOOP_SECONDS;
      this.loopIndex += 1;
    }
  }

  private scheduleLoop(at: number): void {
    const chords = this.mode === 'prep' ? PREP_CHORDS : SERVICE_CHORDS;
    for (let step = 0; step < LOOP_STEPS; step++) {
      const t = at + step * STEP_SECONDS;
      const chord = chords[step % chords.length]!;
      // E-piano: sine + a quiet octave shimmer, plucked with a fast decay.
      for (const [i, frequency] of chord.entries()) {
        this.pluck(frequency, t, i === 0 ? 0.13 : 0.08);
        if (step % 2 === 0 && i === 1) this.pluck(frequency * 2, t + 0.02, 0.025);
      }
      // Bass on the downbeat and the fifth step.
      if (step % 4 === 0) this.pluck(midiBass(chord[0]!), t, 0.18, 'triangle');
      if (step === 5) this.pluck(midiBass(chord[2]!), t, 0.1, 'triangle');
    }
    this.scheduleCrackle(at);
  }

  private pluck(frequency: number, at: number, level: number, type: OscillatorType = 'sine'): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(level, at);
    gain.gain.setValueAtTime(0.0001, at + 0.55);
    osc.connect(gain);
    gain.connect(this.bus);
    osc.start(at);
    osc.stop(at + 0.6);
  }

  private scheduleCrackle(at: number): void {
    if (!this.crackle) {
      const length = Math.floor(this.ctx.sampleRate * LOOP_SECONDS);
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      // Deterministic pseudo-noise: dense low hiss plus occasional louder specks.
      let seed = 0x9e3779b9;
      for (let i = 0; i < data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const r = seed / 0xffffffff;
        data[i] = (r - 0.5) * 0.08 + (r > 0.9995 ? (r - 0.5) * 1.4 : 0);
      }
      this.crackle = buffer;
    }
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = this.crackle;
    source.loop = true;
    gain.gain.setValueAtTime(0.35, at);
    source.connect(gain);
    gain.connect(this.bus);
    source.start(at);
    source.stop(at + LOOP_SECONDS);
  }
}

interface NoteSpec {
  readonly frequency: number;
  readonly endFrequency?: number;
  readonly duration: number;
  readonly type?: OscillatorType;
  readonly level?: number;
  readonly delay?: number;
}

const SFX: Record<SfxName, readonly NoteSpec[]> = {
  ticket: [
    { frequency: 880, duration: 0.07, level: 0.16 },
    { frequency: 1174, duration: 0.09, level: 0.14, delay: 0.08 },
  ],
  sizzle: [{ frequency: 2600, endFrequency: 900, duration: 0.35, type: 'sawtooth', level: 0.05 }],
  boil: [
    { frequency: 420, endFrequency: 720, duration: 0.22, type: 'triangle', level: 0.09 },
    { frequency: 540, endFrequency: 360, duration: 0.25, type: 'triangle', level: 0.07, delay: 0.16 },
  ],
  topping: [{ frequency: 1300, endFrequency: 700, duration: 0.06, level: 0.12 }],
  servePerfect: [
    { frequency: 659, duration: 0.1, level: 0.16 },
    { frequency: 880, duration: 0.12, level: 0.16, delay: 0.09 },
    { frequency: 1174, duration: 0.2, level: 0.15, delay: 0.18 },
  ],
  serveOk: [
    { frequency: 523, duration: 0.1, level: 0.14 },
    { frequency: 659, duration: 0.16, level: 0.13, delay: 0.09 },
  ],
  serveFail: [
    { frequency: 330, endFrequency: 220, duration: 0.3, type: 'triangle', level: 0.15 },
  ],
  coins: [
    { frequency: 1046, duration: 0.07, level: 0.14 },
    { frequency: 1568, duration: 0.13, level: 0.12, delay: 0.06 },
  ],
  meow: [{ frequency: 620, endFrequency: 940, duration: 0.16, type: 'triangle', level: 0.11 }],
  click: [{ frequency: 980, duration: 0.035, level: 0.08 }],
};

/** One-shot synthesized sound effects. No samples, no network, no paid assets. */
export function playSfx(ctx: AudioContextLike, bus: GainLike, name: SfxName): void {
  const now = ctx.currentTime;
  for (const note of SFX[name]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const at = now + (note.delay ?? 0);
    osc.type = note.type ?? 'sine';
    osc.frequency.setValueAtTime(note.frequency, at);
    if (note.endFrequency !== undefined) {
      osc.frequency.setValueAtTime(note.endFrequency, at + note.duration);
    }
    gain.gain.setValueAtTime(note.level ?? 0.1, at);
    gain.gain.setValueAtTime(0.0001, at + note.duration);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(at);
    osc.stop(at + note.duration + 0.01);
  }
}
