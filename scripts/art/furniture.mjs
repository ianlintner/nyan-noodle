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

// Bar counter: a long low serving bar with a lacquered top and a foot rail,
// the signature piece of the Ramen Bar.
const barCounter = () =>
  make(16, 24, (c) => {
    c.box(1, 4, 14, 19, 6, 3, ['woodDark', 'norenIndigo', 'nightBlue']);
    c.rect(1, 4, 14, 4, 'woodLight'); // lacquered top
    c.rect(1, 4, 14, 1, 'steamWhite'); // lit top edge
    c.rect(1, 20, 14, 2, 'woodLight'); // foot rail
    c.rect(1, 22, 14, 1, 'woodMid');
    // Two recessed front panels on the indigo body.
    c.rect(3, 10, 4, 7, 'nightBlue');
    c.rect(9, 10, 4, 7, 'nightBlue');
    c.rect(4, 12, 2, 3, 'norenIndigo');
    c.rect(10, 12, 2, 3, 'norenIndigo');
  });

// Booth: a padded two-seat bench with a high back and a table edge tucked in front.
const booth = () =>
  make(16, 24, (c) => {
    layer(c, (l) => {
      l.box(1, 1, 14, 20, 5, 3, ['woodLight', 'woodMid', 'woodDark']); // seat body
      l.box(1, 1, 14, 16, 2, 2, ['paperPink', 'sakura', 'chiliRed']); // padded back/seat
    });
    layer(c, (l) => {
      l.box(1, 3, 13, 4, 1, 1, ['woodLight', 'woodMid', 'woodDark']); // table edge
      l.rect(1, 3, 13, 1, 'steamWhite');
    });
  });

// Big pot: an oversized floor-standing ramen vat on a stone plinth.
const bigPot = () =>
  make(16, 24, (c) => {
    layer(c, (l) => {
      l.box(4, 3, 9, 13, 3, 2, ['catGrey', 'slate', 'nightBlue']); // the vat
      l.ellipse(8, 3, 6, 2, 'brothGold'); // broth surface
      l.rect(4, 4, 7, 3, 'brothGold');
      l.set(6, 1, 'steamWhite');
      l.set(9, 1, 'steamWhite');
      l.set(12, 2, 'steamWhite');
    });
    layer(c, (l) => {
      l.box(2, 16, 12, 7, 2, 2, ['stone', 'slate', 'nightBlue']); // plinth
      l.rect(2, 17, 12, 1, 'stone');
    });
  });

// Menu board: a standing chalkboard with a wooden A-frame and written specials.
const menuBoard = () =>
  make(16, 24, (c) => {
    layer(c, (l) => {
      l.box(1, 1, 14, 16, 3, 2, ['woodLight', 'woodMid', 'woodDark']); // frame
      l.rect(2, 2, 12, 14, 'nightBlue'); // board surface
      l.rect(3, 3, 10, 1, 'cream');
      l.rect(3, 5, 8, 1, 'cream');
      l.rect(3, 7, 10, 1, 'cream');
      l.rect(3, 9, 6, 1, 'cream');
      l.rect(3, 11, 9, 1, 'cream');
      l.rect(3, 13, 5, 1, 'cream');
      l.set(5, 3, 'chiliRed'); // a price slash
    });
    layer(c, (l) => {
      l.rect(6, 17, 2, 6, 'woodDark'); // leg
      l.rect(8, 17, 2, 6, 'woodMid');
    });
  });

// Koi tank: a lit aquarium with three koi, a stone base and bubbles.
const koiTank = () =>
  make(16, 24, (c) => {
    layer(c, (l) => {
      l.box(1, 2, 14, 15, 3, 2, ['woodDark', 'norenIndigo', 'nightBlue']); // tank frame
      l.rect(2, 3, 12, 13, 'nightBlue'); // water
      l.rect(2, 3, 12, 1, 'lanternYellow'); // lit surface
      // Koi (two oranges + one white).
      l.ellipse(5, 8, 3, 2, 'misoOrange');
      l.ellipse(6, 8, 1, 1, 'chiliRed');
      l.ellipse(9, 12, 3, 2, 'catWhite');
      l.ellipse(10, 12, 1, 1, 'chiliRed');
      l.ellipse(5, 14, 3, 2, 'tabbyOrange');
      l.ellipse(6, 14, 1, 1, 'chiliRed');
      // Bubbles.
      l.set(4, 5, 'steamWhite');
      l.set(8, 4, 'steamWhite');
      l.set(11, 6, 'steamWhite');
    });
    layer(c, (l) => {
      l.box(2, 17, 12, 6, 2, 2, ['stone', 'slate', 'nightBlue']); // cabinet
      l.rect(3, 18, 9, 1, 'slate');
    });
  });

// Maneki-neko: the lucky cat on a small wooden stand, one paw raised.
const manekiNeko = () =>
  make(16, 24, (c) => {
    layer(c, (l) => {
      // Raised beckoning paw (right side).
      l.rect(10, 7, 3, 3, 'catWhite');
      l.rect(10, 6, 1, 1, 'paperPink');
    });
    layer(c, (l) => {
      // Body.
      l.shadedEllipse(8, 13, 5, 6, ['catWhite', 'catGrey', 'slate']);
      // Head.
      l.shadedEllipse(8, 6, 4, 4, ['catWhite', 'catGrey', 'slate']);
      // Ears (simple triangles from two rects each).
      l.bitmap(4, 1, ['.c.', 'cc.'], { c: 'catWhite' });
      l.bitmap(11, 1, ['.c.', '.cc'], { c: 'catWhite' });
      l.set(5, 2, 'paperPink'); // inner ear (left)
      l.set(11, 2, 'paperPink'); // inner ear (right)
      // Face.
      l.set(6, 6, 'catBlack');
      l.set(10, 6, 'catBlack');
      l.set(8, 8, 'sakura'); // nose
      l.bitmap(7, 8, ['.c.', '.c.'], { c: 'chiliRed' }); // mouth dots
      // Collar + bell.
      l.rect(5, 10, 6, 1, 'chiliRed');
      l.set(8, 11, 'brothGold');
    });
    layer(c, (l) => {
      l.box(3, 19, 10, 4, 2, 2, ['woodLight', 'woodMid', 'woodDark']); // stand
      l.rect(4, 20, 8, 1, 'woodLight');
    });
  });

// Wall menu: a wood board of menu plates (noren-indigo slip with a bowl, a price plate and
// two nori strips), hung high on the back wall. Pure set dressing (never a sim item).
const wallMenu = () =>
  make(48, 20, (c) => {
    // Board frame with 3-tone wood and a lit top edge.
    c.box(1, 1, 46, 18, 3, 2, ['woodLight', 'woodMid', 'woodDark']);
    c.rect(2, 2, 44, 1, 'woodLight');
    // Three menu slips, left to right: a bowl, a price plate, a nori strip.
    const slip = (x, w) => c.box(x, 5, w, 11, 1, 1, ['norenIndigo', 'nightBlue', 'ink']);
    slip(4, 11);
    slip(18, 11);
    slip(32, 11);
    // Bowl on the left slip.
    c.shadedEllipse(9, 11, 4, 3, ['cream', 'norenIndigo', 'nightBlue']);
    c.ellipse(9, 9, 4, 2, 'cream');
    c.ellipse(9, 9, 2, 1, 'brothGold');
    c.rect(5, 8, 2, 1, 'steamWhite');
    // Price plate on the middle slip.
    c.shadedEllipse(23, 11, 4, 3, ['cream', 'catGrey', 'slate']);
    c.bitmap(21, 9, ['..c..', '.ccc.', 'cc.cc', '.ccc.', '..c..'], { c: 'scallion' });
    // Nori strips on the right slip.
    c.rect(34, 7, 6, 2, 'noriGreen');
    c.rect(34, 11, 6, 2, 'noriGreen');
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
    'furniture/bar_counter': barCounter(),
    'furniture/booth': booth(),
    'furniture/big_pot': bigPot(),
    'furniture/menu_board': menuBoard(),
    'furniture/koi_tank': koiTank(),
    'furniture/maneki_neko': manekiNeko(),
    'furniture/wall_menu': wallMenu(),
  };
}
