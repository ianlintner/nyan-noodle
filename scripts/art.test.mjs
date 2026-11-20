// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PALETTE, decodePng } from './art/core.mjs';
import { buildContactSheet, buildSprites, packAtlas, toPng } from './art/index.mjs';
import { expectedNames, validateAtlas, validateSheet } from './validate-assets.mjs';

function freshAtlas() {
  const sprites = buildSprites();
  const { atlas, json } = packAtlas(sprites);
  return { sprites, json, img: decodePng(toPng(atlas)) };
}

describe('art pipeline', () => {
  it('generates exactly the expected atlas keys, palette-only', () => {
    const { json, img } = freshAtlas();
    expect(Object.keys(json.frames).sort()).toEqual(expectedNames().sort());
    expect(validateAtlas(img, json)).toEqual([]);
  });

  it('is deterministic byte-for-byte', () => {
    const a = toPng(packAtlas(buildSprites()).atlas);
    const b = toPng(packAtlas(buildSprites()).atlas);
    expect(a.equals(b)).toBe(true);
  });

  it('contact sheet is palette-only', () => {
    const sheet = buildContactSheet(buildSprites());
    expect(validateSheet(decodePng(toPng(sheet)))).toEqual([]);
  });

  it('rejects an off-palette pixel', () => {
    const { json, img } = freshAtlas();
    const f = json.frames['furniture/stool'].frame;
    const o = ((f.y + 8) * img.w + f.x + 8) * 4;
    img.rgba.set([255, 0, 255, 255], o);
    expect(validateAtlas(img, json).join('\n')).toMatch(/off-palette #ff00ff/);
  });

  it('rejects a missing atlas key and a wrong frame size', () => {
    const { json, img } = freshAtlas();
    delete json.frames['icon/coin'];
    json.frames['cat/tabby/down/idle_0'].frame.h = 16;
    const errs = validateAtlas(img, json).join('\n');
    expect(errs).toMatch(/missing atlas key: icon\/coin/);
    expect(errs).toMatch(/cat\/tabby\/down\/idle_0: bad size 16x16/);
  });

  it('rejects a silhouette pixel that is not outline-coloured', () => {
    const { json, img } = freshAtlas();
    const f = json.frames['food/bowl_empty'].frame;
    // Find the first opaque pixel in the top-most opaque row and recolour it to cream.
    for (let y = 0; y < f.h; y++) {
      let hit = -1;
      for (let x = 0; x < f.w; x++) if (img.rgba[((f.y + y) * img.w + f.x + x) * 4 + 3]) hit = x;
      if (hit >= 0) {
        const [r, g, b] = [0xff, 0xf3, 0xd6];
        img.rgba.set([r, g, b, 255], ((f.y + y) * img.w + f.x + hit) * 4);
        break;
      }
    }
    expect(validateAtlas(img, json).join('\n')).toMatch(/food\/bowl_empty: silhouette pixel/);
  });

  it('palette has the 24 art-direction tokens', () => {
    expect(Object.keys(PALETTE)).toHaveLength(24);
  });
});
