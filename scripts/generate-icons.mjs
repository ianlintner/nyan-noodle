// Generates the PWA home-screen icons from the shared palette. Dependency-free:
// the indexed Canvas + PNG encoder live in scripts/art/core.mjs. The 64x64 master
// is drawn once and scaled by whole pixels into 192 and 512 canvases.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Canvas, encodePng } from './art/core.mjs';

const OUT = fileURLToPath(new URL('../apps/game/public/icons/', import.meta.url));
mkdirSync(OUT, { recursive: true });

function block(c, k, x, y, w, h, token) {
  c.rect(x * k, y * k, w * k, h * k, token);
}
function disc(c, k, cx, cy, rx, ry, token) {
  c.ellipse(cx * k, cy * k, rx * k, ry * k, token);
}

function draw(size) {
  const k = size / 64;
  const c = new Canvas(size, size);
  block(c, k, 0, 0, 64, 64, 'nightBlue');
  // Warm bowl of ramen under a cat face: the game's two icon ideas in one mark.
  disc(c, k, 32, 47, 23, 13, 'outline');
  disc(c, k, 32, 46, 21, 11, 'brothGold');
  disc(c, k, 32, 44, 19, 8, 'misoOrange');
  block(c, k, 12, 45, 40, 2, 'cream');
  for (const x of [17, 27, 37, 47]) block(c, k, x, 39, 3, 3, 'noriGreen');
  // Cat head: tabby coat with triangular ears, ink eyes, pink nose.
  block(c, k, 15, 8, 8, 12, 'outline');
  block(c, k, 41, 8, 8, 12, 'outline');
  block(c, k, 17, 10, 4, 8, 'paperPink');
  block(c, k, 43, 10, 4, 8, 'paperPink');
  disc(c, k, 32, 27, 19, 17, 'outline');
  disc(c, k, 32, 26, 17, 15, 'tabbyOrange');
  block(c, k, 29, 4, 6, 10, 'tabbyOrange');
  block(c, k, 30, 20, 3, 3, 'ink');
  block(c, k, 41, 20, 3, 3, 'ink');
  block(c, k, 34, 27, 4, 3, 'sakura');
  block(c, k, 26, 30, 4, 1, 'ink');
  block(c, k, 40, 30, 4, 1, 'ink');
  block(c, k, 13, 29, 7, 2, 'cream');
  block(c, k, 44, 29, 7, 2, 'cream');
  return encodePng(size, size, c.toRgba());
}

for (const size of [192, 512]) {
  const name = `icon-${size}.png`;
  writeFileSync(new URL(name, `file://${OUT}`), draw(size));
  console.info(`generated ${name}`);
}
