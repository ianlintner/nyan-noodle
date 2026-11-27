import { describe, expect, it } from 'vitest';
import { COACH_KEY, CoachStore, EMPTY_HINTS, parseSeenHints, serializeSeenHints } from './coach';

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

  it('uses a key outside the save slot', () => {
    expect(COACH_KEY).toBe('nyan-noodle/coach');
  });
});
