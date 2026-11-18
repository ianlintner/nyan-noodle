// Procedural pixel-art generator (no external APIs). Writes:
//   apps/game/public/assets/nyan-atlas.png + nyan-atlas.json  (Phaser JSON-hash atlas)
//   docs/art/contact-sheet.png                                (3x review sheet)
// Usage: node scripts/generate-art.mjs [--ascii <frame name>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ATLAS_IMAGE,
  asciiSprite,
  buildContactSheet,
  buildSprites,
  packAtlas,
  toPng,
} from './art/index.mjs';

const root = new URL('../', import.meta.url);
export const OUT_DIR = fileURLToPath(new URL('apps/game/public/assets/', root));
export const SHEET_PATH = fileURLToPath(new URL('docs/art/contact-sheet.png', root));

function main() {
  const sprites = buildSprites();
  const ascii = process.argv.indexOf('--ascii');
  if (ascii > 0) {
    const name = process.argv[ascii + 1];
    if (!sprites[name]) throw new Error(`No such frame: ${name}`);
    console.info(asciiSprite(sprites[name]));
    return;
  }
  const { atlas, json } = packAtlas(sprites);
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(fileURLToPath(new URL('docs/art/', root)), { recursive: true });
  writeFileSync(OUT_DIR + ATLAS_IMAGE, toPng(atlas));
  writeFileSync(OUT_DIR + 'nyan-atlas.json', JSON.stringify(json, null, 2) + '\n');
  writeFileSync(SHEET_PATH, toPng(buildContactSheet(sprites)));
  console.info(
    `Generated ${Object.keys(sprites).length} sprites -> ${atlas.w}x${atlas.h} atlas, contact sheet written.`,
  );
}

main();
