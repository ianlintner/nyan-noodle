// Captures before/after review screenshots for the four main scenes at 1440x810.
// Usage:
//   node scripts/capture-screens.mjs [--out <dir>] [--tag <before|after>]
// Requires the preview server (npm run preview) running on 127.0.0.1:4173 and
// Playwright's Chromium installed (`npx playwright install chromium`).
//
// Uses the game's `?scene=` dev URLs plus the `window.__nyan*` debug APIs to reach a
// stable, deterministic frame in each scene. No assertions — this is an art-review aid,
// not a test (see e2e/ for those).
/* global window */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = process.env.E2E_PORT ?? 4173;
const BASE = `http://127.0.0.1:${PORT}`;

const args = process.argv.slice(2);
const outDir = fileURLToPath(
  new URL(
    (() => {
      const i = args.indexOf('--out');
      return i >= 0 ? args[i + 1] : 'docs/review/';
    })(),
    new URL(`file://${process.cwd()}/`),
  ),
);
const tag = (() => {
  const i = args.indexOf('--tag');
  return i >= 0 ? args[i + 1] : 'shot';
})();
mkdirSync(outDir, { recursive: true });

// Mirrors the window surface the game + e2e specs expose.
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('pageerror', (e) => console.warn('pageerror:', String(e)));

const shot = (name) =>
  page.locator('canvas').screenshot({
    path: `${outDir}${tag}-${name}.png`,
  });

const waitReady = (key) =>
  page.waitForFunction((k) => window.__nyan?.registry.get(k) === true, key, {
    timeout: 15000,
  });

// 1. Title — plays once the save summary loads.
await page.goto(`${BASE}/?scene=title`);
await waitReady('titleReady');
await shot('title');

// 2. Prep — needs a live session; the title debug API starts a fresh game.
await page.evaluate(() => window.__nyanTitle.newGame());
await waitReady('prepReady');
await shot('prep');

// 3. Kitchen (ServiceScene sandbox, seeded tickets) — the cooking/ticket-rail screen.
await page.goto(`${BASE}/?scene=service&seed=2026&count=4`);
await waitReady('serviceReady');
await shot('kitchen');

// 4. Service (ShopScene, service mode) — the open shop with seated/queued cats.
await page.goto(`${BASE}/?scene=shop&seed=2026&tier=small-shop&coins=200&rep=3`);
await waitReady('shopReady');
// Let the day play a little so at least one cat seats before we shoot.
await page.waitForTimeout(1200);
await shot('service');

await browser.close();
console.info(`captured ${tag} screenshots -> ${outDir}`);
