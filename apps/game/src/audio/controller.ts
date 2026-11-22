import { audio } from './manager';
import type { AudioSettings } from './settings';
import { session } from '../meta/session';

/** Debounced preference writes: sliders fire fast, storage does not need every intermediate value. */
let timer: ReturnType<typeof setTimeout> | null = null;
let loaded = false;

/** Read persisted preferences once at boot, then apply them to the manager. */
export async function loadAudioSettings(): Promise<void> {
  if (loaded) return;
  loaded = true;
  audio.configure(await session.audioSettings.read());
}

/** Persist the manager's current settings; coalesce rapid slider edits. */
export function persistAudioSettings(settings: AudioSettings): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void session.audioSettings.write(settings).catch(() => undefined);
  }, 250);
}
