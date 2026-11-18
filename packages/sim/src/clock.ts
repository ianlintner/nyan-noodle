export type PhaseId = 'prep' | 'service' | 'close' | 'build';

export interface DayClock {
  /** Monotonic day counter, 1-indexed. */
  readonly day: number;
  /** Current phase of the day cycle. */
  readonly phase: PhaseId;
  /** Current tick within the active phase's tick budget. */
  readonly tick: number;
}

export interface PhaseSpec {
  readonly id: PhaseId;
  /** Number of ticks the phase lasts before advancing. */
  readonly ticks: number;
}

/**
 * Phase ordering with a fixed tick budget each. Service is the longest window;
 * the reducer runs the customer interactions inside it and the clock wraps
 * build back to prep of the next day.
 */
export const PHASES: readonly PhaseSpec[] = [
  { id: 'prep', ticks: 1 },
  { id: 'service', ticks: 12 },
  { id: 'close', ticks: 1 },
  { id: 'build', ticks: 1 },
];

export function createClock(day = 1, phase: PhaseId = 'prep', tick = 0): DayClock {
  return { day, phase, tick };
}

/** Move one tick forward, wrapping to the next phase and incrementing the day after build. */
export function tickClock(clock: DayClock): DayClock {
  const current = PHASES.find((p) => p.id === clock.phase) ?? PHASES[0]!;
  if (clock.tick + 1 < current.ticks) {
    return { ...clock, tick: clock.tick + 1 };
  }
  const index = PHASES.findIndex((p) => p.id === clock.phase);
  const next = PHASES[(index + 1) % PHASES.length]!;
  if (next.id === 'prep') {
    return { day: clock.day + 1, phase: 'prep', tick: 0 };
  }
  return { ...clock, phase: next.id, tick: 0 };
}
