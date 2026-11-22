import { expect, test } from '@playwright/test';

// The base path under test (set by e2e:subpath); '/' for the SWA/dev suite.
const BASE_PATH = process.env.E2E_BASE_PATH ?? '/';

/**
 * Hosting smoke: every asset must resolve under the configured base path.
 *
 * Run with `npm run e2e:subpath` to build with VITE_BASE=/nyan-noodle/ and
 * serve that subpath via `vite preview`; the same spec also passes against the
 * root-hosted SWA/dev build. It exercises title -> new game -> prep -> service
 * and fails on any failed request or non-2xx response (atlas PNG/JSON, fonts,
 * audio or hashed JS chunks would all show up here).
 */
interface W {
  __nyan?: { registry: { get(k: string): unknown } };
  __nyanTitle?: { newGame(): void };
  __nyanPrep?: { openShop(): void };
  __nyanService?: { openDoors(): void };
}

test('loads title, starts a game and reaches service with no failed requests', async ({ page }) => {
  const failures: string[] = [];
  const atlasRequests: string[] = [];
  const track = (url: string, reason?: string) =>
    failures.push(`${url}${reason ? ` (${reason})` : ''}`);
  page.on('requestfailed', (r) => track(r.url(), r.failure()?.errorText));
  page.on('response', (r) => {
    if (r.status() < 200 || r.status() > 299) track(r.url(), `HTTP ${r.status()}`);
    if (r.url().includes('nyan-atlas')) atlasRequests.push(r.url());
  });

  await page.goto(BASE_PATH);
  await page.waitForFunction(
    () => (window as unknown as W).__nyan?.registry.get('titleReady') === true,
    undefined,
    { timeout: 40_000 },
  );
  await expect(page.locator('canvas')).toHaveCount(1);

  await page.evaluate(() => (window as unknown as W).__nyanTitle!.newGame());
  await page.waitForFunction(
    () => (window as unknown as W).__nyan?.registry.get('prepReady') === true,
    undefined,
    { timeout: 40_000 },
  );
  await page.evaluate(() => (window as unknown as W).__nyanPrep!.openShop());
  await page.waitForFunction(
    () => (window as unknown as W).__nyan?.registry.get('serviceReady') === true,
    undefined,
    { timeout: 40_000 },
  );
  await page.evaluate(() => (window as unknown as W).__nyanService!.openDoors());
  await page.waitForFunction(
    () => (window as unknown as W).__nyan?.registry.get('shopInSession') === true,
    undefined,
    { timeout: 40_000 },
  );

  expect(atlasRequests).toEqual(
    expect.arrayContaining([
      expect.stringContaining(`${BASE_PATH}assets/nyan-atlas.png`),
      expect.stringContaining(`${BASE_PATH}assets/nyan-atlas.json`),
    ]),
  );
  expect(failures).toEqual([]);
});
