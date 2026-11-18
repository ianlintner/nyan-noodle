import Phaser from 'phaser';
import { PALETTE, color, type PaletteToken } from './palette';

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

  const draw = (pressed: boolean): void => {
    const dy = pressed ? 1 : 0;
    g.clear();
    g.fillStyle(color('outline'), 1);
    roundedRect(g, 0, 0, width, height);
    g.fillStyle(color(pressed ? 'misoOrange' : 'brothGold'), 1);
    roundedRect(g, 2, 2 + dy, width - 4, height - 4 - (pressed ? 1 : 0));
    if (!pressed) {
      g.fillStyle(color('lanternYellow'), 1);
      g.fillRect(3, 3, width - 6, 1);
      g.fillStyle(color('misoOrange'), 1);
      g.fillRect(3, height - 4, width - 6, 1);
    }
    text.setPosition(Math.round(width / 2), Math.round(height / 2) + dy);
  };
  draw(false);

  container.setSize(width, height);
  container.setInteractive(
    new Phaser.Geom.Rectangle(0, 0, width, height),
    Phaser.Geom.Rectangle.Contains,
  );
  container.on('pointerdown', () => draw(true));
  container.on('pointerup', () => {
    draw(false);
    onClick();
  });
  container.on('pointerout', () => draw(false));

  return { container, setLabel: (next) => text.setText(next) };
}
