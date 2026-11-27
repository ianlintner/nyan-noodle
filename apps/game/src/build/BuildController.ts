import type Phaser from 'phaser';
import {
  checkPlacement,
  describeBuildError,
  getFurniture,
  itemAt,
  moveItem,
  nextRotation,
  placeItem,
  sellItem,
  sellValue,
} from '@nyan-noodle/sim';
import type { BuildResult, FurnitureKind, Rotation, SimState } from '@nyan-noodle/sim';
import { TILE_SIZE } from '../config';
import { color } from '../theme/palette';
import { pixelText } from '../theme/hud';
import { ATLAS_KEY } from '../shop/CatActor';
import { toGrid, toWorld } from '../shop/layout';

export type BuildTool =
  | { readonly kind: 'place'; readonly furniture: FurnitureKind }
  | { readonly kind: 'move'; readonly held: number | null }
  | { readonly kind: 'sell' };

export interface BuildHost {
  readonly scene: Phaser.Scene;
  getState(): SimState;
  /** Adopt a new sim state (the host re-lays-out the shop). */
  commit(next: SimState): void;
  /** Hide an object from the HUD camera. */
  register(o: Phaser.GameObjects.GameObject): void;
  /** True when a pointer is over HUD chrome, so clicks do not reach the shop floor. */
  overUi(x: number, y: number): boolean;
  say(text: string, good: boolean): void;
}

const ARROWS = ['^', '>', 'v', '<'] as const;
const GHOST_DEPTH = 9000;

/** Ghost preview, valid/invalid tint and place / move / sell / rotate input for build mode. */
export class BuildController {
  tool: BuildTool | null = null;
  rotation: Rotation = 0;
  hover: { x: number; y: number } | null = null;
  private active = false;
  private readonly cell: Phaser.GameObjects.Graphics;
  private readonly ghost: Phaser.GameObjects.Image;
  private readonly ghostArrow: Phaser.GameObjects.Text;
  private markers: Phaser.GameObjects.Text[] = [];
  /** Result of the last validity check for the hovered cell (null means valid). */
  hoverProblem: string | null = null;
  /** Touch build actions commit on release, never on pinch start. */
  private readonly activeTouches = new Set<number>();
  private pendingTouch: { id: number; x: number; y: number } | null = null;

  constructor(private readonly host: BuildHost) {
    const { scene } = host;
    this.cell = scene.add.graphics().setDepth(GHOST_DEPTH - 1);
    this.ghost = scene.add
      .image(0, 0, ATLAS_KEY)
      .setOrigin(0, 1)
      .setAlpha(0.8)
      .setDepth(GHOST_DEPTH)
      .setVisible(false);
    this.ghostArrow = pixelText(scene, 0, 0, '', { token: 'cream', originX: 0.5, originY: 0.5 })
      .setDepth(GHOST_DEPTH + 1)
      .setVisible(false);
    for (const o of [this.cell, this.ghost, this.ghostArrow]) host.register(o);

    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUpTouch(p));
    scene.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onUpTouch(p));
    scene.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (!this.active) return;
      if (e.key === 'r' || e.key === 'R') this.rotate();
      else if (e.key === 'Escape') this.cancel();
    });
  }

  enable(): void {
    this.active = true;
    this.refresh();
  }

  disable(): void {
    this.active = false;
    this.tool = null;
    this.hover = null;
    this.hide();
    this.clearMarkers();
  }

  get isActive(): boolean {
    return this.active;
  }

  setTool(tool: BuildTool | null): void {
    this.tool = tool;
    this.refresh();
  }

  rotate(): void {
    this.rotation = nextRotation(this.rotation);
    this.refresh();
  }

  cancel(): void {
    this.tool = null;
    this.refresh();
  }

  /** Re-evaluate ghost, tint and facing markers after the tool, rotation or state changed. */
  refresh(): void {
    if (!this.active) return;
    this.drawMarkers();
    this.drawGhost();
  }

  /** Click a grid cell (also used by the pointer handler). */
  clickCell(x: number, y: number): void {
    const state = this.host.getState();
    const tool = this.tool;
    if (!tool) {
      this.host.say('Pick something from the catalog', true);
      return;
    }
    if (tool.kind === 'place') {
      this.report(placeItem(state, tool.furniture, x, y, this.rotation), () => {
        return `Placed ${getFurniture(tool.furniture).name}`;
      });
    } else if (tool.kind === 'sell') {
      const hit = itemAt(state, x, y);
      if (!hit) return this.host.say('Nothing to sell there', false);
      const name = getFurniture(hit.kind).name;
      this.report(sellItem(state, hit.id), () => `Sold ${name} +${sellValue(hit.kind)}`);
    } else if (tool.held === null) {
      const hit = itemAt(state, x, y);
      if (!hit) return this.host.say('Nothing to move there', false);
      this.rotation = hit.rot;
      this.tool = { kind: 'move', held: hit.id };
      this.host.say(`Moving ${getFurniture(hit.kind).name}: click a spot (R turns)`, true);
    } else {
      const held = tool.held;
      const res = moveItem(state, held, x, y, this.rotation);
      if (res.ok) this.tool = { kind: 'move', held: null };
      this.report(res, () => 'Moved');
    }
    this.refresh();
  }

  private report(res: BuildResult, okText: (r: BuildResult) => string): void {
    if (res.ok) {
      this.host.commit(res.state);
      this.host.say(okText(res), true);
    } else {
      this.host.say(describeBuildError(res.reason), false);
    }
  }

  private cellAt(p: Phaser.Input.Pointer): { x: number; y: number } | null {
    const world = this.host.scene.cameras.main.getWorldPoint(p.x, p.y);
    return toGrid(
      this.host.getState().tierId,
      Math.floor(world.x / TILE_SIZE),
      Math.floor(world.y / TILE_SIZE),
    );
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.active) return;
    if (
      this.pendingTouch?.id === p.id &&
      Math.hypot(p.x - this.pendingTouch.x, p.y - this.pendingTouch.y) > 8
    ) {
      this.pendingTouch = null;
    }
    this.hover = this.host.overUi(p.x, p.y) ? null : this.cellAt(p);
    this.drawGhost();
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.active) return;
    if (p.wasTouch) {
      // Track every finger, even one that lands on HUD chrome: a second finger
      // must invalidate a pending floor tap regardless of where it landed.
      if (this.activeTouches.size > 0) this.pendingTouch = null;
      else this.pendingTouch = { id: p.id, x: p.x, y: p.y };
      this.activeTouches.add(p.id);
    }
    if (this.host.overUi(p.x, p.y)) return;
    if (p.rightButtonDown()) return this.cancel();
    if (!p.wasTouch) {
      const cell = this.cellAt(p);
      if (cell) this.clickCell(cell.x, cell.y);
    }
  }

  /** Touch taps commit only on a confirmed single-finger release. */
  private onUpTouch(p: Phaser.Input.Pointer): void {
    if (!p.wasTouch) return;
    this.activeTouches.delete(p.id);
    const pending = this.pendingTouch;
    this.pendingTouch = null;
    if (!pending || pending.id !== p.id || this.activeTouches.size > 0) return;
    if (this.host.overUi(p.x, p.y)) return;
    const cell = this.cellAt(p);
    if (cell) this.clickCell(cell.x, cell.y);
  }

  private hide(): void {
    this.cell.clear();
    this.ghost.setVisible(false);
    this.ghostArrow.setVisible(false);
  }

  private drawGhost(): void {
    this.hide();
    const { hover, tool } = this;
    const state = this.host.getState();
    this.hoverProblem = null;
    if (!hover || !tool) return;
    const world = toWorld(hover.x, hover.y);
    const px = world.tx * TILE_SIZE;
    const py = world.ty * TILE_SIZE;
    const here = itemAt(state, hover.x, hover.y);

    let kind: FurnitureKind | null = null;
    let good = false;
    if (tool.kind === 'place') {
      kind = tool.furniture;
      const problem = checkPlacement(state, kind, hover.x, hover.y, this.rotation);
      const broke = state.economy.fishCoins < getFurniture(kind).cost;
      good = !problem && !broke;
      this.hoverProblem = problem ?? (broke ? 'funds' : null);
    } else if (tool.kind === 'move' && tool.held !== null) {
      const held = state.items.find((i) => i.id === tool.held);
      if (!held) return;
      kind = held.kind;
      const problem = checkPlacement(state, kind, hover.x, hover.y, this.rotation, held.id);
      good = !problem;
      this.hoverProblem = problem;
    } else {
      // Sell / pick-up targeting: highlight the piece under the cursor.
      good = tool.kind === 'move' && !!here;
      this.hoverProblem = here ? null : 'unknown-item';
      this.cell.fillStyle(
        color(tool.kind === 'sell' ? 'chiliRed' : 'lanternYellow'),
        here ? 0.55 : 0.2,
      );
      this.cell.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      return;
    }
    this.cell.fillStyle(color(good ? 'scallion' : 'chiliRed'), 0.5);
    this.cell.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    this.ghost
      .setFrame(getFurniture(kind).frame)
      .setPosition(px, py + TILE_SIZE)
      .setDepth(GHOST_DEPTH)
      .setVisible(true);
    if (good) this.ghost.clearTint();
    else this.ghost.setTint(color('chiliRed'));
    if (kind === 'stool') {
      this.ghostArrow
        .setText(ARROWS[this.rotation]!)
        .setPosition(px + TILE_SIZE / 2, py + 5)
        .setVisible(true);
    }
  }

  private drawMarkers(): void {
    this.clearMarkers();
    for (const item of this.host.getState().items) {
      if (item.kind !== 'stool') continue;
      const w = toWorld(item.x, item.y);
      const t = pixelText(
        this.host.scene,
        w.tx * TILE_SIZE + 8,
        w.ty * TILE_SIZE + 4,
        ARROWS[item.rot]!,
        {
          token: 'lanternYellow',
          originX: 0.5,
          originY: 0.5,
        },
      ).setDepth(GHOST_DEPTH - 2);
      this.host.register(t);
      this.markers.push(t);
    }
  }

  private clearMarkers(): void {
    for (const m of this.markers) m.destroy();
    this.markers = [];
  }
}
