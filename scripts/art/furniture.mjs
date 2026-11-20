// Furniture sprites (16xN). Hard 3-tone cube shading, fixed top-left light,
// 1px outline added from the silhouette. Anchor: bottom-centre of the canvas.
import { Canvas } from './core.mjs';

function make(w, h, fn) {
  const c = new Canvas(w, h);
  fn(c);
  return c.layered ? c : c.autoOutline();
}

/**
 * Draw a sub-object on its own layer, outline it, then stamp it so overlapping parts stay
 * separated. A canvas built from layers is already outlined, so `make` skips the final pass.
 */
function layer(c, fn) {
  const l = new Canvas(c.w, c.h);
  fn(l);
  c.stamp(l.autoOutline());
  c.layered = true;
}

const counter = () =>
  make(16, 24, (c) => {
    c.box(1, 6, 14, 17, 6, 3, ['cream', 'woodMid', 'woodDark']);
    c.rect(1, 12, 11, 1, 'woodLight'); // trim under the counter top
    c.rect(1, 22, 14, 1, 'woodDark'); // kick plate
    // Two recessed front panels.
    c.rect(3, 15, 4, 5, 'woodDark');
    c.rect(4, 16, 2, 3, 'woodLight');
    c.rect(8, 15, 3, 5, 'woodDark');
    c.rect(9, 16, 1, 3, 'woodLight');
  });

const stove = () =>
  make(16, 24, (c) => {
    layer(c, (b) => {
      b.box(1, 9, 14, 14, 5, 3, ['stone', 'slate', 'nightBlue']);
      // Firebox opening with a little flame.
      b.rect(3, 16, 8, 5, 'ink');
      b.bitmap(5, 16, ['..c..', '.cmc.', 'cmgmc', 'cmggc'], {
        c: 'chiliRed',
        m: 'misoOrange',
        g: 'brothGold',
      });
      b.rect(3, 20, 8, 1, 'misoOrange');
    });
    // Stock pot with broth and steam.
    layer(c, (p) => {
      p.box(3, 4, 9, 7, 2, 2, ['catGrey', 'slate', 'nightBlue']);
      p.rect(4, 5, 6, 1, 'brothGold');
      p.set(6, 2, 'steamWhite');
      p.set(7, 1, 'steamWhite');
      p.set(9, 2, 'steamWhite');
    });
  });

const stool = () =>
  make(16, 16, (c) => {
    c.rect(4, 10, 2, 5, 'woodMid');
    c.rect(7, 10, 2, 4, 'woodMid');
    c.rect(10, 10, 2, 5, 'woodDark');
    c.ellipse(8, 8, 5, 3, 'woodDark');
    c.ellipse(8, 7, 5, 3, 'woodMid');
    c.shadedEllipse(8, 6, 5, 3, ['tatami', 'woodLight', 'woodMid']);
  });

const table = () =>
  make(16, 16, (c) => {
    c.rect(2, 11, 2, 4, 'woodMid');
    c.rect(11, 11, 2, 4, 'woodDark');
    c.box(1, 3, 14, 9, 6, 3, ['woodLight', 'woodMid', 'woodDark']);
    c.rect(4, 5, 7, 3, 'cream'); // placemat
    c.rect(4, 5, 7, 1, 'steamWhite');
  });

const noren = () =>
  make(16, 24, (c) => {
    c.rect(1, 1, 14, 2, 'woodMid');
    c.rect(1, 1, 14, 1, 'woodLight');
    const panels = [
      [1, 4, 19],
      [6, 4, 21],
      [11, 4, 19],
    ];
    for (const [x, w, bottom] of panels) {
      c.rect(x, 3, w, bottom - 3, 'norenIndigo');
      c.rect(x, 3, w, 2, 'nightBlue'); // shadow under the rod
      c.rect(x + w - 1, 5, 1, bottom - 5, 'nightBlue'); // dark right edge
      c.rect(x, bottom - 1, w, 1, 'cream'); // hem stripe
    }
    // Shop crest on the middle panel.
    c.bitmap(7, 9, ['.c.', 'ccc', '.c.'], { c: 'cream' });
  });

const lantern = () =>
  make(16, 24, (c) => {
    c.rect(7, 1, 2, 4, 'ink');
    c.shadedEllipse(8, 13, 5, 7, ['lanternYellow', 'brothGold', 'misoOrange']);
    for (const y of [10, 13, 16])
      for (let x = 2; x < 14; x++) if (c.get(x, y)) c.set(x, y, 'chiliRed');
    c.rect(4, 4, 8, 2, 'woodMid');
    c.rect(4, 4, 8, 1, 'woodLight');
    c.rect(5, 20, 6, 2, 'woodDark');
    c.rect(7, 22, 2, 1, 'chiliRed');
  });

const plant = () =>
  make(16, 24, (c) => {
    layer(c, (l) => {
      l.rect(7, 12, 2, 5, 'noriGreen');
      l.shadedEllipse(5, 10, 3, 3, ['scallion', 'noriGreen', 'nightBlue']);
      l.shadedEllipse(11, 9, 3, 4, ['scallion', 'noriGreen', 'nightBlue']);
      l.shadedEllipse(8, 5, 4, 4, ['scallion', 'noriGreen', 'nightBlue']);
    });
    layer(c, (l) => {
      l.box(3, 15, 10, 8, 3, 2, ['woodLight', 'woodMid', 'woodDark']);
      l.rect(4, 16, 7, 1, 'woodDark'); // soil
    });
  });

const sign = () =>
  make(16, 16, (c) => {
    c.rect(3, 1, 1, 4, 'slate');
    c.rect(12, 1, 1, 4, 'slate');
    c.box(1, 4, 14, 10, 2, 2, ['misoOrange', 'chiliRed', 'woodDark']);
    c.bitmap(4, 6, ['..c..c..', '...c..c.', 'cccccccc', '.cccccc.', '..cccc..'], { c: 'cream' });
  });

export function buildFurniture() {
  return {
    'furniture/counter': counter(),
    'furniture/stove': stove(),
    'furniture/stool': stool(),
    'furniture/table': table(),
    'furniture/noren': noren(),
    'furniture/lantern': lantern(),
    'furniture/plant': plant(),
    'furniture/sign': sign(),
  };
}
