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

  it('rejects a write when there are no backends at all', async () => {
    // An empty backend list must not silently report success: Session.save() would claim the
    // save persisted even though a subsequent read returns null.
    await expect(new SaveStore([]).write(sample())).rejects.toThrow('no storage backend');
  });

  it('surfaces a damaged save instead of discarding it', async () => {
    const backend = memoryBackend();
    await backend.set(SAVE_KEY, '{"format":"nope"}');
    await expect(new SaveStore([backend]).read()).rejects.toThrow(/Not a Nyan Noodle save/);
    expect(await backend.get(SAVE_KEY)).toBe('{"format":"nope"}');
  });

  it('returns the newest save when an older copy survives in an earlier backend', async () => {
    // Simulate a fallback write: IndexedDB holds an older save, localStorage a newer one.
    const older = createSave(createSimState(1, 'cart'), '2026-11-18T00:00:00.000Z');
    const newer = createSave(createSimState(2, 'cart'), '2026-11-20T12:00:00.000Z');
    const idb = memoryBackend();
    const ls = memoryBackend();
    await idb.set(SAVE_KEY, JSON.stringify(older));
    await ls.set(SAVE_KEY, JSON.stringify(newer));
    const store = new SaveStore([idb, ls]);
    expect(await store.read()).toEqual(newer);
    expect(store.lastBackend).toBe('memory'); // both backends are memoryBackend() here
  });

  it('returns a valid IndexedDB save even when a damaged localStorage copy exists', async () => {
    // IndexedDB holds a valid save; localStorage holds a damaged copy. Reading every backend
    // must not let the damaged fallback reject the readable save.
    const valid = sample();
    const idb = memoryBackend();
    const ls = memoryBackend();
    await idb.set(SAVE_KEY, JSON.stringify(valid));
    await ls.set(SAVE_KEY, '{"format":"nope"}');
    const store = new SaveStore([idb, ls]);
    const result = await store.read();
    expect(result).toEqual(valid);
    expect(store.lastWarning).toMatch(/Not a Nyan Noodle save/);
    expect(store.lastBackend).toBe('memory');
  });

  it('a confirmed write repairs the damaged fallback copy', async () => {
    const valid = sample();
    const idb = memoryBackend();
    const ls = memoryBackend();
    await idb.set(SAVE_KEY, JSON.stringify(valid));
    await ls.set(SAVE_KEY, '{"format":"nope"}');
    const store = new SaveStore([idb, ls]);
    await store.read(); // returns valid, records warning
    expect(store.lastWarning).toMatch(/Not a Nyan Noodle save/);
    // Confirmed replacement writes every backend, clearing the damaged copy so a fresh load
    // no longer rejects or warns.
    const replacement = createSave(createSimState(9, 'stall'), '2026-11-21T00:00:00.000Z');
    await store.write(replacement);
    const fresh = new SaveStore([idb, ls]);
    expect(await fresh.read()).toEqual(replacement);
    expect(fresh.lastWarning).toBeNull();
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

  it('exportString reflects the live state rather than re-reading a stale stored save', async () => {
    const store = new SaveStore([memoryBackend()]);
    const a = new Session(store);
    a.newGame(1);
    await a.save(); // persist day 0 to storage
    const before = a.state.economy.fishCoins;
    // Move the live state forward without re-saving (autosave failure scenario).
    a.update({ ...a.state, economy: { ...a.state.economy, fishCoins: before + 999 } });
    // A fresh session reading only storage still sees the stale coins.
    const b = new Session(store);
    expect(await b.continueGame()).toBe(true);
    expect(b.state.economy.fishCoins).toBe(before);
    // The live session's export reflects the newer state, not the stored one.
    const imported = new Session(new SaveStore([memoryBackend()]));
    expect(imported.importString(a.exportString()).economy.fishCoins).toBe(before + 999);
  });
});
