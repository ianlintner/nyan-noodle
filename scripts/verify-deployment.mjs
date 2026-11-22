#!/usr/bin/env node
/**
 * Verify a deployed build over HTTP: status, security headers and sha256
 * equality of every emitted file against the local dist/.
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

// Vite splits Phaser into a separate chunk: hashing only the entry would pass
// a partial upload missing the largest bundle. Collect every JS chunk emitted
// in index.html so a missing/stale chunk fails verification.
const chunks = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"?#]+\.js)"/g)].map((m) => m[1]);
if (chunks.length === 0) {
  console.error('could not find any JS chunks in local index.html');
  process.exit(2);
}
// The atlas is loaded at runtime by Phaser (not referenced by index.html), and
// scripts/generate-art.mjs rewrites the same filenames on each art change, so
// its bytes must be hashed rather than merely checked for HTTP 200.
const atlas = readdirSync(join(DIST, 'assets')).filter((f) => f.startsWith('nyan-atlas.'));
if (atlas.length !== 2) fail(`expected atlas PNG+JSON in dist/assets, found ${atlas.length}`);
const paths = ['/index.html', ...chunks, ...atlas.map((f) => `/assets/${f}`)];
console.info(
  `verify-deployment: comparing ${paths.length} files (index + ${chunks.length} JS chunks + ${atlas.length} atlas files)`,
);

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

if (failures) {
  console.error(`verify-deployment: ${failures} failure(s)`);
  process.exit(1);
}
console.info('verify-deployment: all checks passed');
