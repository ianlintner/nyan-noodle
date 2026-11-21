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
  const section = (name, next) =>
    workflow.slice(
      workflow.indexOf(`  ${name}:`),
      next ? workflow.indexOf(`  ${next}:`) : undefined,
    );
  const build = section('build', 'deploy');
  const deploy = section('deploy', 'close_preview');

  it('lets the deploy job comment on PRs', () => {
    expect(deploy).toMatch(/permissions:\s*\n\s+contents: read\s*\n\s+pull-requests: write/);
  });

  it('keeps the Azure token out of the build job and its repo code', () => {
    expect(build).not.toMatch(/secrets\./);
    expect(build).not.toMatch(/SWA_TOKEN/);
    expect(build).not.toContain('pull-requests: write');
    // Anything that executes repo code must live only in the secret-free build job.
    expect(build).toContain('npm ci');
    expect(build).toContain('npm run build');
    expect(deploy).not.toMatch(/npm (ci|run|install)/);
    // The workflow-level env must not leak the secret either.
    const header = workflow.slice(0, workflow.indexOf('jobs:'));
    expect(header).not.toMatch(/secrets\./);
  });

  it('hands the built artifact from build to deploy', () => {
    expect(build).toContain('actions/upload-artifact');
    expect(deploy).toMatch(/needs:\s*build/);
    expect(deploy).toContain('actions/download-artifact');
  });
});
