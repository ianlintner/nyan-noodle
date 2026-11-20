// 16x16 food: ramen bowls (one per broth), toppings and ingredient icons.
import { Canvas } from './core.mjs';

function make(fn) {
  const c = new Canvas(16, 16);
  fn(c);
  return c.autoOutline();
}

function bowl(broth, extras) {
  return make((c) => {
    c.shadedEllipse(8, 9, 6, 5, ['cream', 'norenIndigo', 'nightBlue']);
    c.rect(0, 0, 16, 7, null); // flat top: the rim ellipse covers the opening
    c.ellipse(8, 7, 6, 3, 'cream');
    c.ellipse(8, 7, 4, 2, broth);
    c.rect(4, 6, 2, 1, 'steamWhite'); // rim glint
    extras?.(c);
    c.rect(5, 14, 6, 1, 'nightBlue'); // foot
  });
}

const noodles = (c) => {
  c.rect(6, 6, 4, 1, 'brothGold');
  c.rect(7, 7, 4, 1, 'lanternYellow');
  c.set(10, 6, 'scallion');
  c.set(6, 8, 'scallion');
};

function foodBowls() {
  return {
    'food/bowl_empty': bowl('stone'),
    'food/bowl_shoyu': bowl('woodMid', noodles),
    'food/bowl_miso': bowl('misoOrange', noodles),
    'food/bowl_tonkotsu': bowl('tatami', noodles),
    'food/bowl_spicy': bowl('chiliRed', noodles),
  };
}

function toppings() {
  return {
    'topping/egg': make((c) => {
      c.shadedEllipse(8, 8, 5, 4, ['steamWhite', 'cream', 'catGrey']);
      c.shadedEllipse(8, 8, 2, 2, ['lanternYellow', 'brothGold', 'misoOrange']);
    }),
    'topping/nori': make((c) => {
      c.box(2, 3, 12, 10, 2, 2, ['noriGreen', 'noriGreen', 'nightBlue']);
      for (const [x, y] of [
        [4, 6],
        [8, 7],
        [11, 6],
        [5, 10],
        [9, 10],
      ])
        c.set(x, y, 'scallion');
    }),
    'topping/scallion': make((c) => {
      for (const [x, y] of [
        [5, 6],
        [10, 5],
        [8, 11],
      ]) {
        c.ellipse(x, y, 2, 2, 'scallion');
        c.set(x, y, 'cream');
        c.set(x + 1, y + 1, 'noriGreen');
      }
    }),
    'topping/chashu': make((c) => {
      c.ellipse(8, 8, 6, 5, 'woodMid');
      c.shadedEllipse(8, 8, 5, 4, ['paperPink', 'sakura', 'chiliRed']);
      c.rect(5, 7, 4, 1, 'paperPink');
      c.rect(8, 10, 3, 1, 'paperPink');
    }),
    'topping/naruto': make((c) => {
      c.shadedEllipse(8, 8, 5, 5, ['steamWhite', 'cream', 'catGrey']);
      c.bitmap(
        5,
        5,
        ['..sss..', '.s...s.', 's..ss.s', 's.s.s.s', 's..s..s', '.s...s.', '..sss..'],
        { s: 'sakura' },
      );
    }),
  };
}

function ingredients() {
  return {
    'ingredient/noodles': make((c) => {
      c.shadedEllipse(8, 9, 6, 4, ['steamWhite', 'cream', 'tatami']);
      for (const y of [7, 9, 11])
        for (let x = 3; x < 14; x += 3) if (c.get(x, y)) c.set(x, y, 'tatami');
      for (let y = 5; y < 14; y++) if (c.get(8, y)) c.set(8, y, 'chiliRed'); // paper band
    }),
    'ingredient/broth': make((c) => {
      c.box(4, 4, 9, 10, 2, 2, ['lanternYellow', 'brothGold', 'misoOrange']);
      c.rect(5, 2, 7, 2, 'woodDark');
      c.rect(5, 7, 1, 4, 'lanternYellow');
    }),
    'ingredient/pork': make((c) => {
      c.shadedEllipse(8, 8, 6, 4, ['paperPink', 'sakura', 'chiliRed']);
      for (const [x, y] of [
        [6, 7],
        [10, 6],
        [9, 9],
      ])
        c.set(x, y, 'paperPink');
    }),
    'ingredient/egg': make((c) => {
      c.shadedEllipse(8, 8, 4, 5, ['steamWhite', 'cream', 'tatami']);
    }),
    'ingredient/fish': make((c) => {
      c.bitmap(11, 5, ['..t', '.tt', 'ttt', 'ttt', '.tt', '..t'], { t: 'slate' });
      c.shadedEllipse(7, 8, 5, 3, ['steamWhite', 'catGrey', 'slate']);
      c.set(4, 7, 'ink');
    }),
    'ingredient/chili': make((c) => {
      c.bitmap(
        3,
        4,
        [
          '......nn.',
          '.....rrn.',
          '....rrrr.',
          '...rrrrd.',
          '..rrrrdd.',
          '.rrrrddd.',
          'mrrrddd..',
          'rrddd....',
        ],
        {
          n: 'noriGreen',
          r: 'chiliRed',
          m: 'misoOrange',
          d: 'woodDark',
        },
      );
    }),
    'ingredient/scallion': make((c) => {
      for (const x of [3, 7, 11]) {
        c.rect(x, 2, 2, 12, 'scallion');
        c.rect(x + 1, 2, 1, 12, 'noriGreen');
        c.rect(x, 10, 2, 4, 'cream');
      }
    }),
  };
}

export function buildFood() {
  return { ...foodBowls(), ...toppings(), ...ingredients() };
}
