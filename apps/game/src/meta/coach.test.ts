import { describe, expect, it } from 'vitest';
import {
  COACH_KEY,
  CoachStore,
  EMPTY_HINTS,
  mergeSeenHints,
  overCoachButton,
  parseSeenHints,
  serializeSeenHints,
} from './coach';

function store(): { coach: CoachStore; read: () => string | null } {
  let text: string | null = null;
  const coach = new CoachStore(
    async () => text,
    async (_key, value) => {
      text = value;
    },
    async () => {
      text = null;
    },
  );
  return { coach, read: () => text };
}

describe('coach hints', () => {
  it('parses only true booleans and tolerates junk', () => {
    expect(parseSeenHints(null)).toEqual(EMPTY_HINTS);
    expect(parseSeenHints('{')).toEqual(EMPTY_HINTS);
    expect(parseSeenHints('{"prep":true,"shop":1}')).toEqual({
      ...EMPTY_HINTS,
      prep: true,
    });
  });

  it('serializes in a stable key order', () => {
    expect(serializeSeenHints({ ...EMPTY_HINTS, prep: true })).toBe(
      '{"prep":true,"kitchen":false,"shop":false,"report":false,"upgrades":false,"build":false}',
    );
  });

  it('marks each hint once and round-trips through storage', async () => {
    const a = store();
    await a.coach.ready();
    expect(a.coach.has('prep')).toBe(false);
    a.coach.mark('prep');
    a.coach.mark('prep');
    await a.coach.flush();
    expect(a.coach.seen()).toEqual(['prep']);
    expect(a.read()).toContain(`"prep":true`);

    const reloaded = new CoachStore(
      async () => a.read(),
      async () => undefined,
      async () => undefined,
    );
    await reloaded.ready();
    expect(reloaded.has('prep')).toBe(true);
    expect(reloaded.has('shop')).toBe(false);
  });

  it('reset clears persisted hints', async () => {
    const a = store();
    await a.coach.ready();
    a.coach.mark('kitchen');
    expect(a.read()).toBeTruthy();
    await a.coach.reset();
    expect(a.read()).toBeNull();
    expect(a.coach.seen()).toEqual([]);
  });

  it('merges seen flags so a stale backend cannot repeat a persisted hint', () => {
    const stale = serializeSeenHints({ ...EMPTY_HINTS });
    const fallback = serializeSeenHints({ ...EMPTY_HINTS, kitchen: true, prep: true });
    expect(parseSeenHints(mergeSeenHints([stale, fallback]))).toEqual({
      ...EMPTY_HINTS,
      prep: true,
      kitchen: true,
    });
    expect(parseSeenHints(mergeSeenHints(['{', null]))).toEqual(EMPTY_HINTS);
    expect(mergeSeenHints([null, null])).toBeNull();
  });

  it('covers the full 5px touch margin of the help button', () => {
    // createButton expands touch hit areas by up to 5px; (231.5, 12) must not reach Build.
    expect(overCoachButton('shop', 231.5, 12)).toBe(true);
    expect(overCoachButton('build', 236, 6)).toBe(true);
    expect(overCoachButton('shop', 253, 18)).toBe(true);
    expect(overCoachButton('shop', 231, 12)).toBe(true);
    expect(overCoachButton('shop', 260, 12)).toBe(false);
  });

  it('uses a key outside the save slot', () => {
    expect(COACH_KEY).toBe('nyan-noodle/coach');
  });
});
