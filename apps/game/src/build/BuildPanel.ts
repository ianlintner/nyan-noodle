import type Phaser from 'phaser';
import { FURNITURE, getTier, nextTier } from '@nyan-noodle/sim';
import type { ShopTierId } from '@nyan-noodle/sim';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { color } from '../theme/palette';
import { createButton, drawPanel } from '../theme/hud';
import type { ButtonHandle } from '../theme/hud';
import type { BuildTool } from './BuildController';

export const PANEL_X = NATIVE_WIDTH - 108;
const PANEL_W = 104;
const BTN_W = PANEL_W - 12;
const BTN_H = 14;
/** Vertical step between buttons (14px button + 1px gap); 15 works with up to 16 rows. */
export const BTN_STEP = 15;

export interface PanelActions {
  pick(tool: BuildTool): void;
  rotate(): void;
  upgrade(): void;
}

/** Build-mode HUD: furniture catalog, move/sell tools, rotate and shop upgrade. */
export class BuildPanel {
  readonly objects: Phaser.GameObjects.GameObject[] = [];
  readonly rect: { x: number; y: number; w: number; h: number };
  private readonly marker: Phaser.GameObjects.Graphics;
  private readonly upgradeButton: ButtonHandle;
  private readonly toolY = new Map<string, number>();

  constructor(scene: Phaser.Scene, actions: PanelActions, startTier: ShopTierId) {
    const before = new Set(scene.children.list);
    const rows = FURNITURE.length + 4;
    // Cap the panel to the native HUD viewport so the pinned action buttons (move/sell/
    // rotate/upgrade) never fall off screen as the catalog grows.
    const height = Math.min(18 + rows * BTN_STEP + 6, NATIVE_HEIGHT - 6);
    this.rect = { x: PANEL_X, y: 4, w: PANEL_W, h: height };
    const { graphics, content } = drawPanel(scene, PANEL_X, 4, PANEL_W, height, { title: 'Build' });
    this.objects.push(graphics);
    this.marker = scene.add.graphics().setDepth(5);
    this.objects.push(this.marker);

    let y = content.y + 2;
    const x = PANEL_X + 6;
    const add = (key: string, label: string, onClick: () => void): ButtonHandle => {
      const b = createButton(scene, x, y, BTN_W, BTN_H, label, onClick);
      b.container.setDepth(6);
      this.objects.push(b.container);
      this.toolY.set(key, y);
      y += BTN_STEP;
      return b;
    };
    for (const f of FURNITURE) {
      add(f.kind, `${f.name} ${f.cost}`, () => actions.pick({ kind: 'place', furniture: f.kind }));
    }
    add('move', 'Move', () => actions.pick({ kind: 'move', held: null }));
    add('sell', 'Sell (50%)', () => actions.pick({ kind: 'sell' }));
    add('rotate', 'Rotate [R]', actions.rotate);
    this.upgradeButton = add('upgrade', '', actions.upgrade);
    this.setTier(startTier);
    for (const o of scene.children.list) if (!before.has(o)) this.objects.push(o);
    this.setVisible(false);
  }

  /** Relabel the upgrade button for the current tier. */
  setTier(tierId: ShopTierId): void {
    const next = nextTier(tierId);
    this.upgradeButton.setLabel(
      next ? `To ${next.name} ${next.unlockCost}` : `${getTier(tierId).name} (max)`,
    );
  }

  /** Outline the active tool button. */
  highlight(tool: BuildTool | null): void {
    this.marker.clear();
    if (!tool) return;
    const key = tool.kind === 'place' ? tool.furniture : tool.kind;
    const y = this.toolY.get(key);
    if (y === undefined) return;
    this.marker.lineStyle(1, color('chiliRed'), 1);
    this.marker.strokeRect(PANEL_X + 5, y - 1, BTN_W + 2, BTN_H + 2);
  }

  setVisible(visible: boolean): void {
    for (const o of this.objects)
      (o as Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject).setVisible(
        visible,
      );
  }

  contains(x: number, y: number): boolean {
    const r = this.rect;
    return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  }
}
