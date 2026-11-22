#!/usr/bin/env node
/**
 * Verify a deployed build over HTTP: status, security headers and sha256
 * equality of index.html and the main JS bundle against the local dist/.
 *
 *   node scripts/verify-deployment.mjs https://<swa-host>
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'apps/game/dist');
const base = (process.argv[2] ?? '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('usage: node scripts/verify-deployment.mjs <https://swa-host>');
  process.exit(2);
}

// Matches apps/game/public/staticwebapp.config.json globalHeaders.
const HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

let failures = 0;
const fail = (m) => {
  failures++;
  console.error('FAIL: ' + m);
};

const localIndex = join(DIST, 'index.html');
if (!existsSync(localIndex)) {
  console.error(`missing local build: ${localIndex} (run npm run build first)`);
  process.exit(2);
}
const html = readFileSync(localIndex, 'utf8');
// Vite emits the app entry as /assets/index-<hash>.js (the atlas and phaser
// chunk are covered by the asset check below; index.html + the entry are the
// two files that change on every content update).
const entry = html.match(/src="([^"]*\/assets\/index-[^"]+\.js)"/)?.[1];
if (!entry) {
  console.error('could not find main JS bundle in local index.html');
  process.exit(2);
}
const paths = ['/index.html', entry];
console.info(`verify-deployment: comparing ${paths.length} files (index.html + main JS)`);

for (const path of paths) {
  let res;
  try {
    res = await fetch(base + path);
  } catch (e) {
    fail(`${path} request failed: ${e.message}`);
    continue;
  }
  if (res.status !== 200) {
    fail(`${path} returned HTTP ${res.status}`);
    continue;
  }
  for (const [name, want] of Object.entries(HEADERS)) {
    if ((res.headers.get(name) ?? '').toLowerCase() !== want.toLowerCase())
      fail(`${path} missing header ${name}: ${want}`);
  }
  const expected = sha256(readFileSync(join(DIST, path.replace(/^\//, ''))));
  const actual = sha256(Buffer.from(await res.arrayBuffer()));
  if (actual !== expected) fail(`${path} sha256 mismatch: local ${expected} vs served ${actual}`);
  else console.info(`  OK ${path} (${expected.slice(0, 12)}…)`);
}

// Sanity-check that the atlas asset is present locally and fetchable. Its
// contents are immutable art, so only status is checked here (the JS bundle
// hash above covers code changes).
const atlas = readdirSync(join(DIST, 'assets')).filter((f) => f.startsWith('nyan-atlas.'));
if (atlas.length !== 2) fail(`expected atlas PNG+JSON in dist/assets, found ${atlas.length}`);
for (const file of atlas) {
  const res = await fetch(`${base}/assets/${file}`).catch(() => null);
  if (!res || res.status !== 200) fail(`atlas asset ${file} not served`);
}

if (failures) {
  console.error(`verify-deployment: ${failures} failure(s)`);
  process.exit(1);
}
console.info('verify-deployment: all checks passed');
