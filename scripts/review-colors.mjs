// Prints the dominant colours of review screenshots (art-review aid, no vision tool).
import { readFileSync } from 'node:fs';
import { decodePng } from './art/core.mjs';

let names = process.argv.slice(2);
const tagIdx = names.indexOf('--tag');
let tag = 'before';
if (tagIdx >= 0) {
  tag = names[tagIdx + 1] ?? 'before';
  names = names.filter((_, i) => i !== tagIdx && i !== tagIdx + 1);
}
if (names.length === 0) names = ['title', 'prep', 'kitchen', 'service'];

for (const name of names) {
  const { w, h, rgba } = decodePng(readFileSync(process.cwd() + `/docs/review/${tag}-${name}.png`));
  const colors = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    const key = `${rgba[i]},${rgba[i + 1]},${rgba[i + 2]}`;
    colors.set(key, (colors.get(key) || 0) + 1);
  }
  const sorted = [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.info(
    name,
    `${w}x${h}`,
    sorted.map(([c, n]) => `${c}=${((n / (w * h)) * 100).toFixed(1)}%`).join('  '),
  );
}
