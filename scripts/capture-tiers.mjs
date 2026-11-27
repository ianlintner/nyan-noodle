// Captures build-mode screenshots for all 5 shop tiers + a grand-hall service shot.
// Usage: node scripts/capture-tiers.mjs [--out <dir>]
// Requires the preview server (npm run preview) on 127.0.0.1:4173 and Playwright chromium.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

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
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('pageerror', (e) => console.warn('pageerror:', String(e)));

const shot = (name) => page.locator('canvas').screenshot({ path: join(outDir, `${name}.png`) });

const waitReady = (key) =>
  page.waitForFunction((k) => globalThis.__nyan?.registry.get(k) === true, key, {
    timeout: 15000,
  });

const tiers = [
  ['cart', '1x'],
  ['stall', '1x'],
  ['small-shop', '1x'],
  ['ramen-bar', '1x'],
  ['grand-hall', '1x'],
];

for (const [id] of tiers) {
  await page.goto(`${BASE}/?scene=shop&seed=2026&tier=${id}&mode=build&coins=99999&rep=5`);
  await waitReady('shopReady');
  await page.waitForTimeout(400);
  await shot(`build-${id}`);
}

// Grand-hall service mode with a live day (seated cats). Wait for a cat to
// actually reach its stool (walk time varies with the larger grid) rather than
// relying on a fixed delay that can capture the arrivals walk instead.
await page.goto(`${BASE}/?scene=shop&seed=2026&tier=grand-hall&coins=99999&rep=5`);
await waitReady('shopReady');
await page.waitForFunction(() => globalThis.__nyanShop?.counts().seated > 0, undefined, {
  timeout: 15000,
});
await shot('service-grand-hall');

await browser.close();
console.info(`captured tier screenshots -> ${outDir}`);
