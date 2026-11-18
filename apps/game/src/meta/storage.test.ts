import { describe, expect, it } from 'vitest';
import { createSave, createSimState } from '@nyan-noodle/sim';
import { SAVE_KEY, SaveStore, localStorageBackend, memoryBackend } from './storage';
import type { KeyValueBackend } from './storage';
import { Session } from './session';

const broken = (): KeyValueBackend => ({
  name: 'indexeddb',
  get: () => Promise.reject(new Error('blocked')),
  set: () => Promise.reject(new Error('blocked')),
  remove: () => Promise.reject(new Error('blocked')),
});

const sample = () => createSave(createSimState(77, 'stall'), '2026-11-18T00:00:00.000Z');

describe('SaveStore', () => {
  it('round-trips through a backend', async () => {
    const store = new SaveStore([memoryBackend()]);
    expect(await store.read()).toBeNull();
    await store.write(sample());
    expect(await store.read()).toEqual(sample());
    await store.clear();
    expect(await store.read()).toBeNull();
  });

  it('falls back to localStorage when IndexedDB is unavailable', async () => {
    localStorage.clear();
    const store = new SaveStore([broken(), localStorageBackend(localStorage)]);
    await store.write(sample());
    expect(store.lastBackend).toBe('localstorage');
    expect(localStorage.getItem(SAVE_KEY)).toContain('nyan-noodle-save');
    expect(await new SaveStore([broken(), localStorageBackend(localStorage)]).read()).toEqual(
      sample(),
    );
  });

  it('reports failure when no backend can write', async () => {
    await expect(new SaveStore([broken()]).write(sample())).rejects.toThrow('blocked');
  });

  it('surfaces a damaged save instead of discarding it', async () => {
    const backend = memoryBackend();
    await backend.set(SAVE_KEY, '{"format":"nope"}');
    await expect(new SaveStore([backend]).read()).rejects.toThrow(/Not a Nyan Noodle save/);
    expect(await backend.get(SAVE_KEY)).toBe('{"format":"nope"}');
  });
});

describe('Session', () => {
  it('saves, then continues with identical state in a fresh session', async () => {
    const store = new SaveStore([memoryBackend()]);
    const a = new Session(store);
    expect(await a.peek()).toBeNull();
    a.newGame(123);
    a.update({ ...a.state, economy: { ...a.state.economy, fishCoins: 321 } });
    await a.save();
    const b = new Session(store);
    expect(await b.peek()).toMatchObject({ day: 1, fishCoins: 321, tierId: 'cart' });
    expect(await b.continueGame()).toBe(true);
    expect(b.state).toEqual(a.state);
  });

  it('exports and imports a game through the string format', () => {
    const a = new Session(new SaveStore([memoryBackend()]));
    a.newGame(5);
    const b = new Session(new SaveStore([memoryBackend()]));
    expect(b.importString(a.exportString())).toEqual(a.state);
    expect(() => b.importString('garbage')).toThrow();
    expect(b.state).toEqual(a.state);
  });

  it('peek reports a damaged slot without throwing', async () => {
    const backend = memoryBackend();
    await backend.set(SAVE_KEY, 'not json');
    const session = new Session(new SaveStore([backend]));
    expect(await session.peek()).toBeNull();
    expect(session.lastError).toMatch(/valid JSON/);
  });
});
