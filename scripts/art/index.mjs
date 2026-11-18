// Assembles every sprite, packs the atlas and renders the contact sheet.
import { Canvas, PALETTE, TOKENS, encodePng } from './core.mjs';
import { buildTiles } from './tiles.mjs';
import { buildFurniture } from './furniture.mjs';
import { buildCats, buildAccessories, ACCESSORIES, ANIMS, COATS, DIRS } from './cats.mjs';
import { buildFood } from './food.mjs';
import { buildIcons } from './icons.mjs';

export const ATLAS_IMAGE = 'nyan-atlas.png';
export const ATLAS_WIDTH = 512;
const PAD = 1;
const SHEET_SCALE = 3;
const SHEET_GAP = 4;
const SHEET_BG = 'cream';

/** @returns {Record<string, Canvas>} insertion-ordered name -> sprite */
export function buildSprites() {
  return {
    ...buildTiles(),
    ...buildFurniture(),
    ...buildCats(),
    ...buildAccessories(),
    ...buildFood(),
    ...buildIcons(),
  };
}

/** Deterministic shelf packer: tallest first, ties keep insertion order. */
export function packAtlas(sprites) {
  const entries = Object.entries(sprites).map(([name, c], i) => ({ name, c, i }));
  entries.sort((a, b) => b.c.h - a.c.h || a.i - b.i);
  const placed = [];
  let x = PAD;
  let y = PAD;
  let rowH = 0;
  for (const e of entries) {
    if (x + e.c.w + PAD > ATLAS_WIDTH) {
      x = PAD;
      y += rowH + PAD;
      rowH = 0;
    }
    placed.push({ ...e, x, y });
    x += e.c.w + PAD;
    rowH = Math.max(rowH, e.c.h);
  }
  const height = y + rowH + PAD;
  const atlas = new Canvas(ATLAS_WIDTH, height);
  const frames = {};
  for (const p of placed) atlas.stamp(p.c, p.x, p.y);
  // Frame table follows insertion order so the JSON diff is readable.
  for (const p of [...placed].sort((a, b) => a.i - b.i))
    frames[p.name] = {
      frame: { x: p.x, y: p.y, w: p.c.w, h: p.c.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: p.c.w, h: p.c.h },
      sourceSize: { w: p.c.w, h: p.c.h },
    };
  const json = {
    frames,
    meta: {
      app: 'nyan-noodle/scripts/generate-art.mjs',
      version: '1',
      image: ATLAS_IMAGE,
      format: 'RGBA8888',
      size: { w: atlas.w, h: atlas.h },
      scale: '1',
      nyan: {
        palette: PALETTE,
        paletteOrder: TOKENS,
        dirs: DIRS,
        anims: ANIMS,
        coats: Object.keys(COATS),
        accessories: ACCESSORIES,
        frameName: 'cat/{coat}/{dir}/{anim}_{n}; overlay: cataccessory/{acc}/{dir}/{anim}_{n}',
      },
    },
  };
  return { atlas, json };
}

const rowKey = (name) => {
  const parts = name.split('/');
  return parts[0] === 'cat' || parts[0] === 'cataccessory' ? parts.slice(0, 2).join('/') : parts[0];
};

/** 3x contact sheet: one row per group, on a cream backdrop so outlines read clearly. */
export function buildContactSheet(sprites) {
  const rows = new Map();
  for (const [name, c] of Object.entries(sprites)) {
    const k = rowKey(name);
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k).push(c);
  }
  const cell = (c) => c.w * SHEET_SCALE + SHEET_GAP;
  const width = Math.max(
    ...[...rows.values()].map((r) => r.reduce((s, c) => s + cell(c), SHEET_GAP)),
  );
  const rowHeights = [...rows.values()].map(
    (r) => Math.max(...r.map((c) => c.h)) * SHEET_SCALE + SHEET_GAP,
  );
  const height = rowHeights.reduce((s, h) => s + h, SHEET_GAP);
  const sheet = new Canvas(width, height);
  sheet.rect(0, 0, width, height, SHEET_BG);
  let y = SHEET_GAP;
  [...rows.values()].forEach((row, r) => {
    let x = SHEET_GAP;
    for (const c of row) {
      for (let j = 0; j < c.h; j++)
        for (let i = 0; i < c.w; i++) {
          const v = c.px[j * c.w + i];
          if (v)
            sheet.rect(
              x + i * SHEET_SCALE,
              y + j * SHEET_SCALE,
              SHEET_SCALE,
              SHEET_SCALE,
              TOKENS[v - 1],
            );
        }
      x += cell(c);
    }
    y += rowHeights[r];
  });
  return sheet;
}

export const toPng = (c) => encodePng(c.w, c.h, c.toRgba());

/** Debug: print a sprite as letters (one per palette token, '.' transparent). */
export function asciiSprite(c) {
  const letters = 'abcdefghijklmnopqrstuvwx';
  const legend = TOKENS.map((t, i) => `${letters[i]}=${t}`).join(' ');
  const rows = [];
  for (let y = 0; y < c.h; y++) {
    let line = '';
    for (let x = 0; x < c.w; x++) line += c.px[y * c.w + x] ? letters[c.px[y * c.w + x] - 1] : '.';
    rows.push(line);
  }
  return `${rows.join('\n')}\n${legend}`;
}
