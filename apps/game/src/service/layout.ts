import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ServiceLayout {
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
    rail: { x: 4, y: 4, w: NATIVE_WIDTH - 8, h: 50 },
    railRows: 2,
    cooking: { x: 4, y: 58, w: 150, h: 152 },
    today: { x: 158, y: 58, w: 318, h: 74 },
    touch: { x: 158, y: 136, w: 318, h: 96 },
    openDoors: { x: 340, y: 236, w: 136, h: 22 },
    hintY: NATIVE_HEIGHT - 11,
  };
}
