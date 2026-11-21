// Cat character sprites: 16x24, 4 directions x (idle 2f, walk 4f), coat palette swaps,
// plus accessory overlays derived by diffing. The 'right' direction is the mirrored 'left'.
import { Canvas } from './core.mjs';

export const DIRS = ['down', 'up', 'left', 'right'];
export const ANIMS = { idle: 2, walk: 4 };
export const ACCESSORIES = ['bow', 'scarf'];

/** role palette per coat: base/light/shade + stripe + muzzle. Ear-inner is shared. */
export const COATS = {
  tabby: {
    base: 'tabbyOrange',
    light: 'brothGold',
    shade: 'misoOrange',
    stripe: 'woodMid',
    belly: 'cream',
  },
  grey: {
    base: 'catGrey',
    light: 'steamWhite',
    shade: 'stone',
    stripe: 'slate',
    belly: 'steamWhite',
  },
  black: { base: 'catBlack', light: 'slate', shade: 'ink', stripe: 'ink', belly: 'slate' },
  white: {
    base: 'catWhite',
    light: 'steamWhite',
    shade: 'catGrey',
    stripe: 'catGrey',
    belly: 'steamWhite',
  },
};

/** Per-frame pose: body bob (px down) and leg lift per leg slot. */
function pose(anim, f) {
  if (anim === 'idle') return { bob: f === 1 ? 1 : 0, lift: [0, 0], off: 0 };
  // walk: contact frames (0,2) bob down with the opposite leg lifted; passing frames (1,3) stand tall.
  return {
    bob: f % 2 === 0 ? 1 : 0,
    lift: [f === 0 ? 1 : 0, f === 2 ? 1 : 0],
    off: [-1, 0, 1, 0][f],
  };
}

const LEG_BOTTOM = 22;

function legs(c, k, xs, y0, lift, w = 2) {
  xs.forEach((x, i) => {
    const top = y0 + (lift[i] ?? 0);
    c.rect(x, top, w, LEG_BOTTOM - top + 1, i === 0 ? k.base : k.shade);
    c.rect(x, LEG_BOTTOM, w, 1, k.light); // paw
  });
}

function front(c, k, p, back) {
  const ty = 4 + p.bob;
  const body = ty + 7;
  legs(c, k, [4, 10], body + 5, p.lift);
  // tail
  c.rect(13, body + 1, 2, 6, k.base);
  c.rect(13, body + 6, 2, 1, k.stripe);
  // torso
  c.rect(4, body, 8, 7, k.base);
  c.rect(11, body, 1, 7, k.shade);
  c.rect(4, body + 6, 8, 1, k.shade);
  if (!back) c.rect(6, body + 1, 4, 4, k.belly);
  else c.rect(7, body + 1, 2, 4, k.stripe);
  // head + ears
  c.rect(3, ty - 2, 3, 3, k.base);
  c.rect(10, ty - 2, 3, 3, k.base);
  c.rect(3, ty, 10, 7, k.base);
  c.rect(4, ty, 7, 1, k.light);
  c.rect(12, ty, 1, 7, k.shade);
  c.rect(3, ty + 6, 10, 1, k.shade);
  if (!back) {
    c.set(4, ty - 1, 'paperPink');
    c.set(11, ty - 1, 'paperPink');
    c.rect(5, ty + 3, 1, 2, 'ink');
    c.rect(10, ty + 3, 1, 2, 'ink');
    c.rect(6, ty + 5, 4, 2, k.belly);
    c.rect(7, ty + 5, 2, 1, 'sakura'); // nose
    c.rect(4, ty + 2, 1, 1, k.stripe); // brow stripes
    c.rect(11, ty + 2, 1, 1, k.stripe);
  } else {
    // Back of the head (bob cut): a soft dark crown, not a face. Nothing here — a solid
    // stripe reads as a "dark rectangle" over the head, especially on grey/black coats.
  }
}

function side(c, k, p) {
  const ty = 4 + p.bob;
  const body = ty + 7;
  const o = p.off;
  legs(c, k, [5 + o, 11 - o], body + 4, p.lift);
  // far legs (darker) read as depth
  c.rect(8 - o, body + 5, 2, LEG_BOTTOM - body - 4, k.shade);
  c.rect(9 + o, body + 5, 2, LEG_BOTTOM - body - 4, k.shade);
  // tail curls up behind
  c.rect(14, body - 3, 1, 8, k.base);
  c.rect(13, body - 4, 1, 2, k.stripe);
  // torso
  c.rect(4, body, 10, 6, k.base);
  c.rect(4, body + 5, 10, 1, k.shade);
  c.rect(13, body + 1, 1, 5, k.shade);
  c.rect(5, body + 2, 3, 3, k.belly);
  c.rect(10, body + 2, 1, 2, k.stripe);
  c.rect(12, body + 2, 1, 2, k.stripe);
  // head (facing left)
  c.rect(2, ty, 9, 7, k.base);
  c.rect(3, ty, 7, 1, k.light);
  c.rect(10, ty, 1, 7, k.shade);
  c.rect(2, ty + 6, 9, 1, k.shade);
  c.rect(3, ty - 2, 3, 2, k.base);
  c.rect(8, ty - 2, 3, 2, k.base);
  c.set(4, ty - 1, 'paperPink');
  c.rect(4, ty + 3, 1, 2, 'ink');
  c.rect(2, ty + 4, 3, 3, k.belly);
  c.set(2, ty + 4, 'sakura'); // nose
  c.rect(8, ty + 2, 1, 1, k.stripe);
}

const ACC = {
  bow(c, dir, p) {
    const ty = 4 + p.bob;
    const x = dir === 'left' ? 7 : dir === 'up' ? 3 : 9;
    c.rect(x, ty - 1, 4, 3, 'sakura');
    c.set(x + 1, ty, 'chiliRed');
    c.set(x + 2, ty, 'chiliRed');
    c.set(x, ty - 1, 'paperPink');
  },
  scarf(c, dir, p) {
    const y = 4 + p.bob + 6;
    const [x, w] = dir === 'down' || dir === 'up' ? [3, 10] : [3, 8];
    c.rect(x, y, w, 2, 'chiliRed');
    c.rect(x, y, w, 1, 'misoOrange');
    c.rect(x + w - 2, y + 2, 2, 3, 'chiliRed'); // hanging end
  },
};

function drawCat(coat, dir, anim, f, acc) {
  const c = new Canvas(16, 24);
  const k = COATS[coat];
  const p = pose(anim, f);
  const base = dir === 'right' ? 'left' : dir;
  if (base === 'left') side(c, k, p);
  else front(c, k, p, base === 'up');
  if (acc) ACC[acc](c, base, p);
  c.autoOutline();
  return dir === 'right' ? c.flipX() : c;
}

export function buildCats() {
  const out = {};
  for (const coat of Object.keys(COATS))
    for (const dir of DIRS)
      for (const [anim, n] of Object.entries(ANIMS))
        for (let f = 0; f < n; f++)
          out[`cat/${coat}/${dir}/${anim}_${f}`] = drawCat(coat, dir, anim, f);
  return out;
}

/** Accessory overlays: only the pixels an accessory adds/changes, drawn over any coat. */
export function buildAccessories() {
  const out = {};
  for (const acc of ACCESSORIES)
    for (const dir of DIRS)
      for (const [anim, n] of Object.entries(ANIMS))
        for (let f = 0; f < n; f++)
          out[`cataccessory/${acc}/${dir}/${anim}_${f}`] = drawCat('grey', dir, anim, f, acc).diff(
            drawCat('grey', dir, anim, f),
          );
  return out;
}
