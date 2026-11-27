import type Phaser from 'phaser';
import { PALETTE, blendHex, color, hexToNumber, type PaletteToken } from './palette';
import { safeHorizontalPad, safeVerticalPad, type ButtonBox } from './hitArea';

/**
 * Gated buttons wash out their face instead of fading the whole container: the ink
 * label stays at full opacity so it keeps WCAG AA contrast in every button state.
 */
export const DIM_FACE_ALPHA = 0.55;

/** The colour actually painted under a button label, for normal/pressed/dim states. */
export function buttonFaceHex(pressed: boolean, dimmed: boolean): string {
  const face = pressed ? PALETTE.misoOrange : PALETTE.brothGold;
  return dimmed ? blendHex(face, PALETTE.cream, DIM_FACE_ALPHA) : face;
}

interface RegisteredButton {
  box: ButtonBox;
  padX: number;
  padY: number;
  setPad(padX: number, padY: number): void;
}

/** Hit areas are tracked per scene so stacked buttons cannot cover each other's faces. */
const sceneButtons = new WeakMap<Phaser.Scene, RegisteredButton[]>();

/** One pixel font for the whole game: 8px base, integer multiples only. */
export const FONT_FAMILY = '"Courier New", Courier, monospace';
export const FONT_BASE_PX = 8;

export interface TextOptions {
  /** Integer multiple of the 8px base (1, 2 or 3). */
  scale?: 1 | 2 | 3;
  token?: PaletteToken;
  originX?: number;
  originY?: number;
}

/** Pixel-font text, ink by default. Position is snapped to whole pixels. */
export function pixelText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  options: TextOptions = {},
): Phaser.GameObjects.Text {
  const { scale = 1, token = 'ink', originX = 0, originY = 0 } = options;
  return scene.add
    .text(Math.round(x), Math.round(y), text, {
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: `${FONT_BASE_PX * scale}px`,
      color: PALETTE[token],
    })
    .setOrigin(originX, originY);
}

export interface PanelOptions {
  /** Optional noren-indigo header band with cream title text. */
  title?: string;
  headerHeight?: number;
}

export interface PanelResult {
  graphics: Phaser.GameObjects.Graphics;
  /** Content area below the header band, inside the border. */
  content: { x: number; y: number; width: number; height: number };
}

/** Rect with 2px "rounded" corners (corner pixels trimmed) — no anti-aliasing. */
function roundedRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  g.fillRect(x + 2, y, w - 4, h);
  g.fillRect(x, y + 2, w, h - 4);
  g.fillRect(x + 1, y + 1, w - 2, h - 2);
}

/** Cream panel, 2px outline, 1px inner highlight, optional indigo header band. */
export function drawPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  options: PanelOptions = {},
): PanelResult {
  const g = scene.add.graphics();
  g.fillStyle(color('outline'), 1);
  roundedRect(g, x, y, width, height);
  g.fillStyle(color('cream'), 1);
  roundedRect(g, x + 2, y + 2, width - 4, height - 4);
  g.fillStyle(color('steamWhite'), 1);
  g.fillRect(x + 4, y + 3, width - 8, 1);
  g.fillRect(x + 3, y + 4, 1, height - 8);

  let headerHeight = 0;
  if (options.title !== undefined) {
    headerHeight = options.headerHeight ?? 14;
    g.fillStyle(color('norenIndigo'), 1);
    g.fillRect(x + 2, y + 3, width - 4, headerHeight);
    pixelText(scene, x + 6, y + 3 + Math.floor((headerHeight - FONT_BASE_PX) / 2), options.title, {
      token: 'cream',
    });
  }
  return {
    graphics: g,
    content: {
      x: x + 4,
      y: y + 4 + headerHeight,
      width: width - 8,
      height: height - 8 - headerHeight,
    },
  };
}

export interface ButtonHandle {
  container: Phaser.GameObjects.Container;
  setLabel(label: string): void;
  /** Greyed look for a gated action; the button still fires so the UI can explain why. */
  setDim(dim: boolean): void;
}

/** Touch-capable devices get an invisible margin around every small HUD button. */
export function isTouchDevice(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.navigator.maxTouchPoints > 0 || 'ontouchstart' in window)
  );
}

/** Button with outline, 3-tone face and a pressed state that shifts the face 1px. */
export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  onClick: () => void,
): ButtonHandle {
  const g = scene.add.graphics();
  const text = pixelText(scene, 0, 0, label, { token: 'ink', originX: 0.5, originY: 0.5 });
  const container = scene.add.container(Math.round(x), Math.round(y), [g, text]);

  let pressed = false;
  let dimmed = false;
  const draw = (): void => {
    const dy = pressed ? 1 : 0;
    g.clear();
    g.fillStyle(color(dimmed ? 'stone' : 'outline'), 1);
    roundedRect(g, 0, 0, width, height);
    g.fillStyle(hexToNumber(buttonFaceHex(pressed, dimmed)), 1);
    roundedRect(g, 2, 2 + dy, width - 4, height - 4 - (pressed ? 1 : 0));
    if (!pressed && !dimmed) {
      g.fillStyle(color('lanternYellow'), 1);
      g.fillRect(3, 3, width - 6, 1);
      g.fillStyle(color('misoOrange'), 1);
      g.fillRect(3, height - 4, width - 6, 1);
    }
    text.setPosition(Math.round(width / 2), Math.round(height / 2) + dy);
  };
  draw();

  container.setSize(width, height);
  const desiredPad = isTouchDevice() ? 5 : 0;
  const box: ButtonBox = { x, y, width, height };
  const registered = sceneButtons.get(scene) ?? [];
  sceneButtons.set(scene, registered);
  container.setInteractive({ useHandCursor: true });
  const hitArea = container.input!.hitArea as {
    setPosition(x: number, y: number): void;
    setSize(width: number, height: number): void;
  };
  /**
   * Resize the existing rectangle in place; re-calling setInteractive after a scene restart crashes Phaser.
   * Container.setSize() sets displayOrigin to (width/2, height/2), so local (0, 0) in hit-test space is
   * shifted by (-width/2, -height/2) relative to the children drawn at [0..width, 0..height].
   */
  const setHitArea = (nextX: number, nextY: number): void => {
    hitArea.setPosition(width / 2 - nextX, height / 2 - nextY);
    hitArea.setSize(width + nextX * 2, height + nextY * 2);
  };
  let padX = desiredPad;
  let padY = desiredPad;
  for (const other of registered) {
    padX = Math.min(padX, safeHorizontalPad(box, other.box, desiredPad));
    padY = Math.min(padY, safeVerticalPad(box, other.box, desiredPad));
    other.setPad(
      Math.min(other.padX, safeHorizontalPad(other.box, box, desiredPad)),
      Math.min(other.padY, safeVerticalPad(other.box, box, desiredPad)),
    );
  }
  const entry: RegisteredButton = {
    box,
    padX,
    padY,
    setPad(nextX, nextY) {
      this.padX = nextX;
      this.padY = nextY;
      setHitArea(nextX, nextY);
    },
  };
  registered.push(entry);
  const unregister = (): void => {
    const i = registered.indexOf(entry);
    if (i >= 0) registered.splice(i, 1);
  };
  // HUD rebuilds destroy buttons without shutting the scene down. Leaving their
  // boxes registered would keep shrinking the replacements' hit areas.
  container.once('destroy', unregister);
  scene.events.once('shutdown', unregister);
  setHitArea(padX, padY);
  container.on('pointerdown', () => {
    pressed = true;
    draw();
  });
  container.on('pointerup', () => {
    if (!pressed) return;
    pressed = false;
    draw();
    onClick();
  });
  container.on('pointerout', () => {
    pressed = false;
    draw();
  });

  return {
    container,
    setLabel: (next) => text.setText(next),
    setDim: (dim) => {
      dimmed = dim;
      draw();
    },
  };
}
