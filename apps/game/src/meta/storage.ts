import { SaveError, parseSave, serializeSave } from '@nyan-noodle/sim';
import type { SaveFile } from '@nyan-noodle/sim';

export const SAVE_KEY = 'nyan-noodle/save';

/** A tiny async key/value store; IndexedDB and localStorage both fit behind it. */
export interface KeyValueBackend {
  readonly name: 'indexeddb' | 'localstorage' | 'memory';
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const DB_NAME = 'nyan-noodle';
const STORE = 'kv';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/** Opens lazily; every call rejects if IndexedDB is unavailable (private mode, blocked, ...). */
export function indexedDbBackend(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): KeyValueBackend {
  let opened: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    if (!factory) return Promise.reject(new Error('IndexedDB is not available'));
    opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB open blocked'));
    });
    opened.catch(() => (opened = null));
    return opened;
  };
  const store = async (mode: IDBTransactionMode): Promise<IDBObjectStore> =>
    (await open()).transaction(STORE, mode).objectStore(STORE);
  return {
    name: 'indexeddb',
    async get(key) {
      const value = await request((await store('readonly')).get(key));
      return typeof value === 'string' ? value : null;
    },
    async set(key, value) {
      await request((await store('readwrite')).put(value, key));
    },
    async remove(key) {
      await request((await store('readwrite')).delete(key));
    },
  };
}

export function localStorageBackend(
  storage: Storage | undefined = safeLocalStorage(),
): KeyValueBackend {
  const need = (): Storage => {
    if (!storage) throw new Error('localStorage is not available');
    return storage;
  };
  return {
    name: 'localstorage',
    get: async (key) => need().getItem(key),
    set: async (key, value) => need().setItem(key, value),
    remove: async (key) => need().removeItem(key),
  };
}

function safeLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function memoryBackend(): KeyValueBackend {
  const map = new Map<string, string>();
  return {
    name: 'memory',
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => void map.set(key, value),
    remove: async (key) => void map.delete(key),
  };
}

/**
 * Versioned save slot. Writes go to the first backend that accepts them (IndexedDB, then
 * localStorage); reads take the first backend holding a save. A corrupt save is reported,
 * never silently deleted.
 */
export class SaveStore {
  /** Which backend served the last successful read or write. */
  lastBackend: KeyValueBackend['name'] | null = null;

  constructor(private readonly backends: readonly KeyValueBackend[]) {}

  async read(): Promise<SaveFile | null> {
    for (const backend of this.backends) {
      try {
        const text = await backend.get(SAVE_KEY);
        if (text === null) continue;
        const save = parseSave(text);
        this.lastBackend = backend.name;
        return save;
      } catch (error) {
        // A damaged save must surface; an unavailable backend just means "try the next".
        if (error instanceof SaveError) throw error;
      }
    }
    return null;
  }

  async write(save: SaveFile): Promise<void> {
    const text = serializeSave(save);
    let lastError: unknown = new Error('no storage backend');
    for (const backend of this.backends) {
      try {
        await backend.set(SAVE_KEY, text);
        this.lastBackend = backend.name;
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  async clear(): Promise<void> {
    for (const backend of this.backends) {
      try {
        await backend.remove(SAVE_KEY);
      } catch {
        // best effort: an unavailable backend holds nothing to clear
      }
    }
  }
}

export function createDefaultStore(): SaveStore {
  return new SaveStore([indexedDbBackend(), localStorageBackend()]);
}
