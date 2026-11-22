// 16x16 UI icons: currencies, status and action glyphs.
import { Canvas } from './core.mjs';

function make(fn) {
  const c = new Canvas(16, 16);
  fn(c);
  return c.autoOutline();
}

/** Centre an ASCII bitmap on the 16x16 canvas. */
function place(c, rows, legend) {
  const x0 = Math.floor((16 - rows[0].length) / 2);
  const y0 = Math.floor((16 - rows.length) / 2);
  c.bitmap(x0, y0, rows, legend);
}

export function buildIcons() {
  return {
    'icon/coin': make((c) => {
      c.shadedEllipse(8, 8, 6, 6, ['lanternYellow', 'brothGold', 'misoOrange']);
      c.rect(7, 5, 2, 6, 'misoOrange');
      c.rect(5, 7, 6, 2, 'misoOrange');
    }),
    'icon/star': make((c) => {
      place(
        c,
        [
          '.....s.....',
          '....sss....',
          'sssssssssss',
          '.sssssssss.',
          '..sssssss..',
          '..sssssss..',
          '.ssss.ssss.',
          '.sss...sss.',
          'ss.......ss',
        ],
        { s: 'brothGold' },
      );
      c.edgeShade('brothGold', 'lanternYellow', 'misoOrange');
    }),
    'icon/heart': make((c) => {
      place(
        c,
        [
          '.hh...hh.',
          'hhhh.hhhh',
          'hhhhhhhhh',
          'hhhhhhhhh',
          '.hhhhhhh.',
          '..hhhhh..',
          '...hhh...',
          '....h....',
        ],
        {
          h: 'chiliRed',
        },
      );
      c.edgeShade('chiliRed', 'sakura', 'woodDark');
    }),
    'icon/clock': make((c) => {
      c.shadedEllipse(8, 8, 6, 6, ['steamWhite', 'cream', 'tatami']);
      c.rect(8, 4, 1, 5, 'ink');
      c.rect(8, 8, 3, 1, 'ink');
    }),
    'icon/flame': make((c) => {
      c.shadedEllipse(8, 10, 5, 4, ['misoOrange', 'chiliRed', 'woodDark']);
      c.ellipse(8, 6, 2, 3, 'chiliRed');
      c.set(8, 2, 'misoOrange');
      c.ellipse(8, 11, 2, 2, 'brothGold');
      c.set(8, 10, 'lanternYellow');
    }),
    'icon/hammer': make((c) => {
      c.box(2, 2, 12, 5, 2, 2, ['stone', 'slate', 'nightBlue']);
      c.rect(6, 7, 4, 7, 'woodMid');
      c.rect(6, 7, 1, 7, 'woodLight');
      c.rect(9, 7, 1, 7, 'woodDark');
    }),
    'icon/check': make((c) => {
      place(
        c,
        [
          '........cc',
          '.......ccc',
          'c.....ccc.',
          'cc...ccc..',
          'ccc.ccc...',
          '.ccccc....',
          '..ccc.....',
          '...c......',
        ],
        { c: 'noriGreen' },
      );
      c.edgeShade('noriGreen', 'scallion', 'nightBlue');
    }),
    'icon/cross': make((c) => {
      place(
        c,
        [
          'cc....cc',
          'ccc..ccc',
          '.cccccc.',
          '..cccc..',
          '..cccc..',
          '.cccccc.',
          'ccc..ccc',
          'cc....cc',
        ],
        { c: 'chiliRed' },
      );
      c.edgeShade('chiliRed', 'sakura', 'woodDark');
    }),
    'icon/plus': make((c) => {
      c.rect(6, 2, 4, 12, 'noriGreen');
      c.rect(2, 6, 12, 4, 'noriGreen');
      c.edgeShade('noriGreen', 'scallion', 'nightBlue');
    }),
    // Steam puff (soft white, lightly outlined): used as an animated stove effect.
    'fx/steam': make((c) => {
      c.ellipse(8, 9, 5, 6, 'steamWhite');
      c.ellipse(5, 11, 3, 3, 'steamWhite');
      c.ellipse(11, 11, 3, 3, 'steamWhite');
      c.ellipse(8, 8, 3, 3, 'steamWhite');
    }),
  };
}
