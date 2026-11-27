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

export interface ViewportFit {
  /** Phaser canvas zoom. Integer when a whole native frame fits the viewport. */
  zoom: number;
  /** CSS size of the scaled canvas in page pixels. */
  width: number;
  height: number;
  /** Letterbox offsets: the canvas is centred in the viewport. */
  left: number;
  top: number;
  /** True when an integer zoom was possible (at least one whole native frame fits). */
  integer: boolean;
  /** True when the viewport is taller than it is wide (phone held upright). */
  portrait: boolean;
}

/**
 * Fit the native frame into a viewport, preferring integer scaling. A phone in
 * portrait is narrower than 480 CSS pixels, so no whole frame fits: fall back to
 * the exact fractional scale rather than clipping the HUD, and letterbox the rest.
 */
export function computeViewportFit(viewportWidth: number, viewportHeight: number): ViewportFit {
  const exact = Math.min(viewportWidth / NATIVE_WIDTH, viewportHeight / NATIVE_HEIGHT);
  const whole = Math.floor(exact);
  const zoom = whole >= 1 ? whole : Math.max(0.1, exact);
  const width = NATIVE_WIDTH * zoom;
  const height = NATIVE_HEIGHT * zoom;
  return {
    zoom,
    width,
    height,
    left: Math.max(0, Math.floor((viewportWidth - width) / 2)),
    top: Math.max(0, Math.floor((viewportHeight - height) / 2)),
    integer: whole >= 1,
    portrait: viewportHeight > viewportWidth,
  };
}

/** Current device orientation, read from the viewport at call time. */
export function isPortrait(): boolean {
  return typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
}
