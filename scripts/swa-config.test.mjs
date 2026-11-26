// @vitest-environment node
// Regression tests for the Azure Static Web Apps config shipped in dist/ (used
// by the Cat Herding Games hub's shared SWA).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;
const config = JSON.parse(readFileSync(`${ROOT}apps/game/public/staticwebapp.config.json`, 'utf8'));

describe('staticwebapp.config.json', () => {
  it('has no SPA fallback or blanket 404 rewrite (relative base breaks nested paths)', () => {
    expect(config.navigationFallback).toBeUndefined();
    expect(config.responseOverrides?.['404']).toBeUndefined();
  });

  it('keeps unhashed atlas files out of the immutable cache', () => {
    const routes = config.routes.map((r) => r.route);
    const atlas = routes.indexOf('/assets/nyan-atlas.*');
    const immutable = routes.indexOf('/assets/*');
    expect(atlas).toBeGreaterThanOrEqual(0);
    expect(atlas).toBeLessThan(immutable);
    expect(config.routes[atlas].headers['cache-control']).toBe('no-cache');
    expect(config.routes[immutable].headers['cache-control']).toContain('immutable');
  });
});
