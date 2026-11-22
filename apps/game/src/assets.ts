/**
 * Static asset URLs, prefixed with Vite's configured base path.
 *
 * `import.meta.env.BASE_URL` is `/` for local dev and the SWA build, and
 * `/nyan-noodle/` for the GitHub Pages subpath build. Phaser's loader uses
 * these as-is, so the sprite atlas (the only runtime asset) resolves correctly
 * whether the game is served from a domain root or a project subpath.
 */
const base = import.meta.env.BASE_URL;

export const ATLAS_PNG = `${base}assets/nyan-atlas.png`;
export const ATLAS_JSON = `${base}assets/nyan-atlas.json`;
