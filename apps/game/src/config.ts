/** Native pixel resolution: 30x16.875 tiles of 16px. Scaled by integer factors only. */
export const NATIVE_WIDTH = 480;
export const NATIVE_HEIGHT = 270;
export const TILE_SIZE = 16;

/** Largest integer zoom (>=1) that fits the native resolution in the given viewport. */
export function computeIntegerZoom(viewportWidth: number, viewportHeight: number): number {
  const fit = Math.min(
    Math.floor(viewportWidth / NATIVE_WIDTH),
    Math.floor(viewportHeight / NATIVE_HEIGHT),
  );
  return Math.max(1, fit);
}
