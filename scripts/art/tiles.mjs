// 16x16 seamless floor and wall tiles. Fully opaque, no outline (tiles abut each other).
import { Canvas } from './core.mjs';

function tile(fn) {
  const c = new Canvas(16, 16);
  fn(c);
  return c;
}

function woodFloor() {
  return tile((c) => {
    c.rect(0, 0, 16, 16, 'woodLight');
    // Four 4px planks, staggered seams, dark gap line under each plank.
    for (let p = 0; p < 4; p++) {
      const y = p * 4;
      c.rect(0, y + 3, 16, 1, 'woodMid');
      c.rect(0, y, 16, 1, 'tatami'); // lit top edge
      const seam = (p * 7 + 3) % 16;
      c.rect(seam, y, 1, 3, 'woodMid');
      c.set((seam + 5) % 16, y + 1, 'woodMid'); // grain fleck
      c.set((seam + 10) % 16, y + 2, 'woodMid');
    }
  });
}

function tatamiFloor() {
  return tile((c) => {
    c.rect(0, 0, 16, 16, 'tatami');
    // Woven rows.
    for (let y = 1; y < 16; y += 2) c.rect(0, y, 16, 1, 'cream');
    // Dark mat border along the right edge, lit border along the top.
    c.rect(15, 0, 1, 16, 'woodMid');
    c.rect(0, 7, 16, 1, 'woodMid');
    c.rect(0, 0, 16, 1, 'cream');
    c.rect(0, 8, 16, 1, 'cream');
    c.rect(8, 8, 1, 8, 'woodMid');
  });
}

function stoneFloor() {
  return tile((c) => {
    c.rect(0, 0, 16, 16, 'stone');
    // 2x2 pavers with grout, top-left light.
    c.rect(0, 7, 16, 1, 'slate');
    c.rect(0, 15, 16, 1, 'slate');
    c.rect(7, 0, 1, 7, 'slate');
    c.rect(15, 8, 1, 8, 'slate');
    c.rect(0, 0, 7, 1, 'catGrey');
    c.rect(8, 0, 8, 1, 'catGrey');
    c.rect(0, 8, 15, 1, 'catGrey');
    c.set(3, 3, 'catGrey');
    c.set(11, 11, 'catGrey');
  });
}

function checkerFloor() {
  return tile((c) => {
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        const dark = (x + y) % 2 === 1;
        c.rect(x * 8, y * 8, 8, 8, dark ? 'tatami' : 'cream');
        c.rect(x * 8, y * 8, 8, 1, dark ? 'cream' : 'steamWhite');
        c.rect(x * 8 + 7, y * 8 + 1, 1, 7, dark ? 'woodLight' : 'tatami');
      }
  });
}

function plasterWall() {
  return tile((c) => {
    c.rect(0, 0, 16, 16, 'paperPink');
    c.rect(0, 0, 16, 2, 'cream'); // lit crown
    c.rect(0, 13, 16, 3, 'woodMid'); // baseboard
    c.rect(0, 13, 16, 1, 'woodLight');
    c.rect(0, 15, 16, 1, 'woodDark');
    // plaster speckle
    for (const [x, y] of [
      [3, 5],
      [11, 8],
      [7, 10],
      [14, 4],
    ])
      c.set(x, y, 'sakura');
  });
}

function woodWall() {
  return tile((c) => {
    c.rect(0, 0, 16, 16, 'woodMid');
    for (let x = 0; x < 16; x += 4) {
      c.rect(x, 0, 1, 16, 'woodLight'); // lit edge of each board
      c.rect(x + 3, 0, 1, 16, 'woodDark'); // shadow gap
    }
    c.set(2, 5, 'woodDark');
    c.set(6, 11, 'woodDark');
    c.set(10, 3, 'woodDark');
    c.set(14, 9, 'woodDark');
  });
}

function windowWall() {
  return tile((c) => {
    c.rect(0, 0, 16, 16, 'woodDark');
    c.rect(2, 2, 12, 11, 'nightBlue');
    c.rect(2, 2, 12, 1, 'norenIndigo'); // dusk sky glow along the top
    // Lantern glow reflections + stars.
    c.set(4, 4, 'lanternYellow');
    c.set(10, 6, 'lanternYellow');
    c.set(12, 3, 'cream');
    c.rect(7, 2, 2, 11, 'woodDark'); // mullion
    c.rect(2, 7, 12, 1, 'woodDark');
    c.rect(1, 13, 14, 1, 'woodLight'); // sill
    c.rect(0, 14, 16, 2, 'woodMid');
  });
}

export function buildTiles() {
  return {
    'tile/floor_wood': woodFloor(),
    'tile/floor_tatami': tatamiFloor(),
    'tile/floor_stone': stoneFloor(),
    'tile/floor_checker': checkerFloor(),
    'tile/wall_plaster': plasterWall(),
    'tile/wall_wood': woodWall(),
    'tile/wall_window': windowWall(),
  };
}
