// @vitest-environment node
// Regression tests for the Azure Static Web Apps config and deploy workflow.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;
const config = JSON.parse(readFileSync(`${ROOT}apps/game/public/staticwebapp.config.json`, 'utf8'));
const workflow = readFileSync(`${ROOT}.github/workflows/azure-static-web-apps.yml`, 'utf8');

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

describe('azure-static-web-apps workflow', () => {
  it('lets the deploy job comment on PRs', () => {
    const job = workflow.slice(
      workflow.indexOf('  build_and_deploy:'),
      workflow.indexOf('  close_preview:'),
    );
    expect(job).toMatch(/permissions:\s*\n\s+contents: read\s*\n\s+pull-requests: write/);
  });
});
