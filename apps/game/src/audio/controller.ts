import { audio } from './manager';
import type { AudioSettings } from './settings';
import { session } from '../meta/session';

/** Debounced preference writes: sliders fire fast, storage does not need every intermediate value. */
let timer: ReturnType<typeof setTimeout> | null = null;
let load: Promise<void> | null = null;

/** Read persisted preferences once at boot; every caller shares the same in-flight promise. */
export function loadAudioSettings(): Promise<void> {
  load ??= session.audioSettings
    .read()
    .then((settings) => audio.configure(settings))
    .catch(() => undefined);
  return load;
}

/** Persist the manager's current settings; coalesce rapid slider edits. */
export function persistAudioSettings(settings: AudioSettings): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void session.audioSettings.write(settings).catch(() => undefined);
  }, 250);
}
