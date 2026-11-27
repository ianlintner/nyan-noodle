import Phaser from 'phaser';
import type { Doneness, TraitId } from '@nyan-noodle/sim';
import { NATIVE_WIDTH } from '../config';
import { color } from '../theme/palette';
import { drawPanel, FONT_FAMILY, pixelText } from '../theme/hud';
import { ATLAS_KEY } from '../shop/CatActor';
import { drawTraitGlyph } from '../theme/traits';

/** Broth band the needle has to stay inside, as a 0..1 fraction of the bar. */
export const BROTH_LO = 0.4;
export const BROTH_HI = 0.8;
/** Samples per broth hold before the stage auto-advances. */
export const BROTH_SAMPLES = 60;
/** Noodle sweet spot centre per requested doneness. */
export const NOODLE_TARGETS: Record<Doneness, number> = { soft: 0.55, firm: 0.7, default: 0.62 };

/** Cooking-panel geometry, shared by all three minigame renderers. */
export const STAGE_BAR = { x: 10, y: 78, w: 140, h: 14 };

/** Broth heat-hold bar: green band, red needle, cream progress strip. */
export function drawBroth(g: Phaser.GameObjects.Graphics, heat: number, samples: number): void {
  const { x, y, w, h } = STAGE_BAR;
  g.clear();
  g.fillStyle(color('noriGreen'), 1);
  g.fillRect(x + w * BROTH_LO, y, w * (BROTH_HI - BROTH_LO), h);
  g.fillStyle(color('chiliRed'), 1);
  g.fillRect(x + w * heat - 1, y - 3, 2, h + 6);
  g.lineStyle(1, color('steamWhite'), 0.4);
  g.strokeRect(x, y - 1, w, h + 2);
  g.fillStyle(color('cream'), 1);
  g.fillRect(x, y + h + 3, w * (samples / BROTH_SAMPLES), 3);
}

/** Noodle boil timer: green sweet-spot band around the doneness target, gold sweep. */
export function drawNoodles(
  g: Phaser.GameObjects.Graphics,
  doneness: Doneness,
  sweep: number,
): void {
  const { x, y, w, h } = STAGE_BAR;
  const target = NOODLE_TARGETS[doneness];
  g.clear();
  g.fillStyle(color('noriGreen'), 1);
  g.fillRect(x + w * (target - 0.08), y, w * 0.16, h);
  g.fillStyle(color('brothGold'), 1);
  g.fillRect(x + w * sweep - 1, y - 3, 2, h + 6);
  g.lineStyle(1, color('steamWhite'), 0.4);
  g.strokeRect(x, y - 1, w, h + 2);
}

/** Session-mode side panel: what today's service looks like before the doors open. */
export function drawTodayPanel(scene: Phaser.Scene, lines: readonly string[]): void {
  const { content } = drawPanel(scene, 166, 34, 310, 120, { title: 'Today' });
  lines.forEach((line, i) => pixelText(scene, content.x + 2, content.y + 4 + i * 12, line));
}

/** Topping assembly: one square per required topping, green once applied. */
export function drawToppings(g: Phaser.GameObjects.Graphics, required: number, done: number): void {
  const { x, w } = STAGE_BAR;
  g.clear();
  for (let i = 0; i < required; i++) {
    const cx = x + 6 + i * ((w - 12) / Math.max(1, required - 1));
    g.fillStyle(color(done > i ? 'noriGreen' : 'slate'), 1);
    g.fillRect(cx, STAGE_BAR.y + 4, 8, 8);
  }
}

/** A single service-ticket card on the rail: cat portrait, dish icon, patience bar. */
export interface RailTicket {
  recipeId: string;
  coat: string;
  patience: number;
  /** Customer name (a regular's name, or a seeded walk-in name). */
  name: string;
  /** Personality trait this ticket carries (null hides the glyph). */
  trait: TraitId;
  /** Affection of a returning regular (0 for walk-ins, hides the hearts). */
  affection: number;
  /** Sim coats beyond the atlas get a base coat (sakura -> white + bow). */
  resolveCoat: (coat: string) => string;
  /** Called on tap, with the ticket's index. */
  onSelect: (index: number) => void;
}

/**
 * Draws the ticket rail: one row of cards (portrait + bowl + patience) in a thin band.
 * Returns the created containers and selection rings so the caller can clear/destroy
 * them on the next redraw.
 */
export function drawTicketRail(
  scene: Phaser.Scene,
  tickets: readonly RailTicket[],
  activeIdx: number,
  completed: ReadonlySet<number>,
): { buttons: Phaser.GameObjects.Container[]; rings: Phaser.GameObjects.Rectangle[] } {
  const buttons: Phaser.GameObjects.Container[] = [];
  const rings: Phaser.GameObjects.Rectangle[] = [];
  // Shrink cards to fit when the rail holds more than the fixed 70px stride can carry.
  const gap = 4;
  const avail = NATIVE_WIDTH - 16; // 8px margins on each side of the rail band.
  const w = Math.min(
    66,
    Math.floor((avail - gap * (tickets.length - 1)) / Math.max(1, tickets.length)),
  );
  tickets.forEach((t, i) => {
    const done = completed.has(i);
    const active = i === activeIdx;
    const x = 8 + i * (w + gap);
    const h = 24;
    const c = scene.add.container(x, 4);

    // Ticket tile background: a small card with a 1px outline and 3-tone face.
    // Added first so the affection hearts and labels drawn later sit above it.
    const g = scene.add.graphics();
    g.fillStyle(color('outline'), 1);
    g.fillRect(0, 0, w, h);
    g.fillStyle(color(done ? 'tatami' : 'cream'), 1);
    g.fillRect(1, 1, w - 2, h - 2);
    g.fillStyle(color(done ? 'tatami' : 'steamWhite'), 1);
    g.fillRect(1, 1, w - 2, 1);
    c.add(g);

    // Cat portrait: head crop of the down/idle frame.
    const coat = t.resolveCoat(t.coat);
    const portrait = scene.add.image(9, 20, ATLAS_KEY, `cat/${coat}/down/idle_0`);
    portrait.setOrigin(0.5, 1);
    portrait.setCrop(0, 0, 16, 12); // head + ears only
    portrait.setScale(0.75);

    // Dish icon: the broth's bowl.
    const bowl = scene.add.image(w - 9, 20, ATLAS_KEY, `food/bowl_${t.recipeId}`);
    bowl.setOrigin(0.5, 1);
    bowl.setScale(0.7);

    // Name (forename) + trait glyph + affection hearts fill the top row, above the bowl.
    const forename = t.name.split(' ')[0] ?? '';
    const label = scene.add.text(24, 1, forename, {
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: '8px',
      color: '#2b1d2e',
    });
    if (t.affection > 0) {
      const hearts = scene.add.text(w - 11, 2, '♥'.repeat(Math.min(t.affection, 5)), {
        fontFamily: FONT_FAMILY,
        fontSize: '7px',
        color: '#c33a3a',
      });
      hearts.setOrigin(1, 0);
      c.add(hearts);
    }
    const glyphG = scene.add.graphics();
    drawTraitGlyph(glyphG, 16, 10, t.trait, 'ink');

    // Patience bar: calm coats wait longer. Normalised over the coat patience range.
    const patienceG = scene.add.graphics();
    const frac = Phaser.Math.Clamp((t.patience - 50) / (80 - 50), 0.06, 1);
    const full = Math.round(frac * (w - 6));
    patienceG.fillStyle(color('slate'), 1);
    patienceG.fillRect(3, h - 4, w - 6, 2);
    patienceG.fillStyle(
      color(t.patience >= 69 ? 'noriGreen' : t.patience >= 60 ? 'brothGold' : 'chiliRed'),
      1,
    );
    patienceG.fillRect(3, h - 4, full, 2);

    c.add([portrait, bowl, label, glyphG, patienceG]);
    c.setSize(w, h);
    c.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    c.on('pointerup', () => t.onSelect(i));
    if (active) {
      const ring = scene.add
        .rectangle(x + w / 2, 6 + h / 2, w + 2, h + 2)
        .setStrokeStyle(1, color('misoOrange'));
      rings.push(ring);
    }
    c.setAlpha(done ? 0.55 : 1);
    buttons.push(c);
  });
  return { buttons, rings };
}
