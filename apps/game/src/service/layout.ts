import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ServiceLayout {
  portrait: boolean;
  rail: Rect;
  /** Ticket rows in the rail: one landscape, two when the device is held upright. */
  railRows: number;
  cooking: Rect;
  today: Rect;
  touch: Rect;
  openDoors: Rect;
  hintY: number;
}

/**
 * Two arrangements of the same 480x270 native frame. Portrait packs the rail
 * into two short rows and gives the cooking panel and touch pad taller, easier
 * targets instead of squeezing the landscape HUD into a narrow phone screen.
 */
export function serviceLayout(portrait: boolean): ServiceLayout {
  if (!portrait) {
    return {
      portrait: false,
      rail: { x: 4, y: 4, w: NATIVE_WIDTH - 8, h: 26 },
      railRows: 1,
      cooking: { x: 4, y: 34, w: 156, h: 186 },
      today: { x: 166, y: 34, w: 310, h: 120 },
      touch: { x: 166, y: 160, w: 310, h: 56 },
      openDoors: { x: NATIVE_WIDTH - 126, y: NATIVE_HEIGHT - 48, w: 120, h: 18 },
      hintY: NATIVE_HEIGHT - 22,
    };
  }
  return {
    portrait: true,
    rail: { x: 4, y: 4, w: NATIVE_WIDTH - 8, h: 50 },
    railRows: 2,
    cooking: { x: 4, y: 58, w: 150, h: 152 },
    today: { x: 158, y: 58, w: 318, h: 74 },
    touch: { x: 158, y: 136, w: 318, h: 96 },
    openDoors: { x: 340, y: 236, w: 136, h: 22 },
    hintY: NATIVE_HEIGHT - 11,
  };
}

/**
 * Minigame bar inside the cooking panel: border + header + two-line instruction
 * block. Derived from the panel so portrait never paints over its instructions.
 */
export function stageBar(cooking: Rect): Rect {
  return { x: cooking.x + 6, y: cooking.y + 44, w: cooking.w - 16, h: 14 };
}

/**
 * Pot and noodle basket are the stage's focal art: 2x atlas sprites directly
 * below the gauge, with room for the instruction and status lines.
 */
export function stageVessels(cooking: Rect, bar: Rect): { pot: Rect; basket: Rect } {
  const scale = 2;
  const top = bar.y + bar.h + 6;
  return {
    pot: { x: cooking.x + 26, y: top, w: 16 * scale, h: 24 * scale },
    basket: {
      x: cooking.x + cooking.w - 26 - 16 * scale,
      y: top,
      w: 16 * scale,
      h: 16 * scale,
    },
  };
}
