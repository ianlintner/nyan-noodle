// Asset validator: palette-only colours, frame sizes, outlines, frame counts, atlas keys.
// Independent of the generator (own expectations) so a generator bug cannot pass itself.
// Usage: node scripts/validate-assets.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PALETTE, decodePng } from './art/core.mjs';

const root = new URL('../', import.meta.url);
const ATLAS_JSON = fileURLToPath(new URL('apps/game/public/assets/nyan-atlas.json', root));
const SHEET = fileURLToPath(new URL('docs/art/contact-sheet.png', root));

const DIRS = ['down', 'up', 'left', 'right'];
const ANIMS = { idle: 2, walk: 4 };
const COATS = ['tabby', 'grey', 'black', 'white'];
const ACCESSORIES = ['bow', 'scarf'];
const STATIC = {
  tile: [
    'floor_wood',
    'floor_tatami',
    'floor_stone',
    'floor_checker',
    'wall_plaster',
    'wall_wood',
    'wall_window',
  ],
  furniture: [
    'counter',
    'stove',
    'stool',
    'table',
    'noren',
    'lantern',
    'plant',
    'sign',
    'wall_menu',
  ],
  food: ['bowl_empty', 'bowl_shoyu', 'bowl_miso', 'bowl_tonkotsu', 'bowl_spicy'],
  topping: ['egg', 'nori', 'scallion', 'chashu', 'naruto'],
  ingredient: ['noodles', 'broth', 'pork', 'egg', 'fish', 'chili', 'scallion'],
  icon: ['coin', 'star', 'heart', 'clock', 'flame', 'hammer', 'check', 'cross', 'plus'],
  fx: ['steam'],
};
/** category -> [w, h] rule; h may be a function. */
const SIZE = {
  tile: (w, h) => w === 16 && h === 16,
  furniture: (w, h) => (w === 16 && h % 8 === 0 && h >= 16) || (w === 48 && h === 20),
  cat: (w, h) => w === 16 && h === 24,
  cataccessory: (w, h) => w === 16 && h === 24,
  food: (w, h) => w === 16 && h === 16,
  topping: (w, h) => w === 16 && h === 16,
  ingredient: (w, h) => w === 16 && h === 16,
  icon: (w, h) => w === 16 && h === 16,
  fx: (w, h) => w === 16 && h === 16,
};
const OUTLINED = new Set(['furniture', 'cat', 'food', 'topping', 'ingredient', 'icon']);
const OUTLINE_COLORS = new Set([PALETTE.outline, PALETTE.ink]);

export function expectedNames() {
  const names = [];
  for (const [cat, list] of Object.entries(STATIC)) for (const n of list) names.push(`${cat}/${n}`);
  for (const coat of COATS)
    for (const dir of DIRS)
      for (const [anim, n] of Object.entries(ANIMS))
        for (let f = 0; f < n; f++) names.push(`cat/${coat}/${dir}/${anim}_${f}`);
  for (const acc of ACCESSORIES)
    for (const dir of DIRS)
      for (const [anim, n] of Object.entries(ANIMS))
        for (let f = 0; f < n; f++) names.push(`cataccessory/${acc}/${dir}/${anim}_${f}`);
  return names;
}

const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** Validate decoded atlas pixels + JSON. Returns a list of error strings. */
export function validateAtlas(img, json) {
  const errors = [];
  const err = (m) => errors.length < 60 && errors.push(m);
  const paletteSet = new Set(Object.values(PALETTE));
  if (json.meta?.size?.w !== img.w || json.meta?.size?.h !== img.h)
    err('meta.size does not match PNG dimensions');
  if (Object.keys(PALETTE).length !== 24)
    err(`palette has ${Object.keys(PALETTE).length} tokens, expected 24`);

  // Atlas keys: exact set, no extras, no missing.
  const have = new Set(Object.keys(json.frames));
  const want = new Set(expectedNames());
  for (const n of want) if (!have.has(n)) err(`missing atlas key: ${n}`);
  for (const n of have) if (!want.has(n)) err(`unexpected atlas key: ${n}`);

  // Whole-atlas colour check (alpha binary, palette only).
  for (let i = 0; i < img.w * img.h; i++) {
    const [r, g, b, a] = img.rgba.subarray(i * 4, i * 4 + 4);
    if (a === 0) continue;
    if (a !== 255) err(`partial alpha ${a} at atlas px ${i % img.w},${Math.floor(i / img.w)}`);
    else if (!paletteSet.has(hex(r, g, b)))
      err(`off-palette ${hex(r, g, b)} at atlas px ${i % img.w},${Math.floor(i / img.w)}`);
  }

  const rects = [];
  const sprites = {};
  for (const [name, f] of Object.entries(json.frames)) {
    const { x, y, w, h } = f.frame;
    const cat = name.split('/')[0];
    if (![x, y, w, h].every(Number.isInteger) || x < 0 || y < 0 || x + w > img.w || y + h > img.h) {
      err(`${name}: frame outside atlas`);
      continue;
    }
    if (!SIZE[cat]?.(w, h)) err(`${name}: bad size ${w}x${h} for category '${cat}'`);
    for (const r of rects)
      if (x < r.x + r.w && r.x < x + w && y < r.y + r.h && r.y < y + h)
        err(`${name}: overlaps ${r.name}`);
    rects.push({ name, x, y, w, h });
    const px = (i, j) => {
      const o = ((y + j) * img.w + x + i) * 4;
      return img.rgba[o + 3] === 0 ? null : hex(img.rgba[o], img.rgba[o + 1], img.rgba[o + 2]);
    };
    sprites[name] = { w, h, px };
    let opaque = 0;
    const tones = new Set();
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const c = px(i, j);
        if (!c) {
          if (cat === 'tile') err(`${name}: tile has transparent pixel at ${i},${j}`);
          continue;
        }
        opaque++;
        if (!OUTLINE_COLORS.has(c)) tones.add(c);
        if (!OUTLINED.has(cat)) continue;
        const edge = [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ].some(([dx, dy]) => !px(i + dx, j + dy));
        if (edge && !OUTLINE_COLORS.has(c))
          err(`${name}: silhouette pixel ${i},${j} is ${c}, not outline/ink`);
      }
    if (opaque === 0) err(`${name}: empty frame`);
    if (cat === 'furniture' && tones.size < 3)
      err(`${name}: needs >=3 shading tones, has ${tones.size}`);
  }

  // Cats: coats must genuinely differ; 'right' must mirror 'left'.
  const same = (a, b, mirror) => {
    if (!a || !b || a.w !== b.w || a.h !== b.h) return false;
    for (let j = 0; j < a.h; j++)
      for (let i = 0; i < a.w; i++)
        if (a.px(i, j) !== b.px(mirror ? a.w - 1 - i : i, j)) return false;
    return true;
  };
  for (const [anim, n] of Object.entries(ANIMS))
    for (let f = 0; f < n; f++) {
      if (
        !same(sprites[`cat/tabby/right/${anim}_${f}`], sprites[`cat/tabby/left/${anim}_${f}`], true)
      )
        err(`cat right/${anim}_${f} is not the mirror of left`);
      for (let a = 0; a < COATS.length; a++)
        for (let b = a + 1; b < COATS.length; b++)
          if (
            same(
              sprites[`cat/${COATS[a]}/down/${anim}_${f}`],
              sprites[`cat/${COATS[b]}/down/${anim}_${f}`],
              false,
            )
          )
            err(`coats ${COATS[a]}/${COATS[b]} identical at down/${anim}_${f}`);
    }
  for (const dir of DIRS)
    if (same(sprites[`cat/tabby/${dir}/walk_0`], sprites[`cat/tabby/${dir}/walk_1`], false))
      err(`cat ${dir} walk_0 == walk_1 (no motion)`);
  return errors;
}

/** Contact sheet: valid PNG with palette-only opaque pixels. */
export function validateSheet(img) {
  const paletteSet = new Set(Object.values(PALETTE));
  for (let i = 0; i < img.w * img.h; i++) {
    const [r, g, b, a] = img.rgba.subarray(i * 4, i * 4 + 4);
    if (a !== 255 || !paletteSet.has(hex(r, g, b)))
      return [`contact sheet has off-palette/transparent pixel at ${i}`];
  }
  return [];
}

function main() {
  const errors = [];
  if (!existsSync(ATLAS_JSON)) errors.push('atlas json missing: run `npm run assets:generate`');
  else {
    const json = JSON.parse(readFileSync(ATLAS_JSON, 'utf8'));
    const pngPath = fileURLToPath(new URL(json.meta.image, new URL(`file://${ATLAS_JSON}`)));
    if (!existsSync(pngPath)) errors.push(`atlas image missing: ${pngPath}`);
    else errors.push(...validateAtlas(decodePng(readFileSync(pngPath)), json));
  }
  if (!existsSync(SHEET)) errors.push('contact sheet missing: run `npm run assets:generate`');
  else errors.push(...validateSheet(decodePng(readFileSync(SHEET))));
  if (errors.length) {
    console.error(
      `validate-assets FAILED (${errors.length} error(s)):\n - ${errors.join('\n - ')}`,
    );
    process.exit(1);
  }
  console.info(
    `validate-assets OK: ${expectedNames().length} frames, palette-only, outlines and frame counts verified.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
