import type Phaser from 'phaser';
import { TILE_SIZE } from '../config';
import type { Cell, Dir } from './layout';

export const ATLAS_KEY = 'nyan';
/** Walking speed in px/sec at 1x sim speed (3 tiles/sec). */
const WALK_SPEED = 48;
/** Feet sit this many px above the tile's bottom edge. */
const FEET_OFFSET = 2;
/** Lowers a seated cat so its legs tuck behind the stool top. */
const SIT_DROP = 3;

export const COAT_FRAMES = ['tabby', 'grey', 'black', 'white'] as const;
export type CoatFrame = (typeof COAT_FRAMES)[number];
export type Accessory = 'bow' | 'scarf';
const DIRS: readonly Dir[] = ['down', 'up', 'left', 'right'];
const ANIMS = { idle: 2, walk: 4 } as const;

export function catAnimKey(coat: string, dir: Dir, anim: keyof typeof ANIMS): string {
  return `cat-${coat}-${dir}-${anim}`;
}
export function accAnimKey(acc: Accessory, dir: Dir, anim: keyof typeof ANIMS): string {
  return `acc-${acc}-${dir}-${anim}`;
}

/** Register all cat/accessory animations once per game. */
export function createCatAnimations(scene: Phaser.Scene): void {
  const make = (key: string, prefix: string, anim: keyof typeof ANIMS): void => {
    if (scene.anims.exists(key)) return;
    scene.anims.create({
      key,
      frames: Array.from({ length: ANIMS[anim] }, (_, n) => ({
        key: ATLAS_KEY,
        frame: `${prefix}_${n}`,
      })),
      frameRate: anim === 'walk' ? 8 : 2,
      repeat: -1,
    });
  };
  for (const dir of DIRS) {
    for (const anim of Object.keys(ANIMS) as (keyof typeof ANIMS)[]) {
      for (const coat of COAT_FRAMES)
        make(catAnimKey(coat, dir, anim), `cat/${coat}/${dir}/${anim}`, anim);
      for (const acc of ['bow', 'scarf'] as const)
        make(accAnimKey(acc, dir, anim), `cataccessory/${acc}/${dir}/${anim}`, anim);
    }
  }
}

export function cellCenterX(tx: number): number {
  return tx * TILE_SIZE + TILE_SIZE / 2;
}
export function cellFeetY(ty: number): number {
  return (ty + 1) * TILE_SIZE - FEET_OFFSET;
}

/** A cat sprite (plus optional accessory overlay) that walks along cell paths. */
export class CatActor {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly overlay: Phaser.GameObjects.Sprite | null;
  private waypoints: Cell[] = [];
  private dir: Dir = 'down';
  private seated = false;
  private onArrive: (() => void) | null = null;
  /** True (sub-pixel) feet position, separate from the whole-pixel sprite render. */
  private fx = 0;
  private fy = 0;
  speedScale = 1;

  constructor(
    scene: Phaser.Scene,
    private readonly coat: CoatFrame,
    private readonly accessory: Accessory | null,
    cell: Cell,
    register: (o: Phaser.GameObjects.GameObject) => void,
  ) {
    const x = cellCenterX(cell.tx);
    const y = cellFeetY(cell.ty);
    this.fx = x;
    this.fy = y;
    this.sprite = scene.add.sprite(x, y, ATLAS_KEY).setOrigin(0.5, 1);
    register(this.sprite);
    this.overlay = accessory ? scene.add.sprite(x, y, ATLAS_KEY).setOrigin(0.5, 1) : null;
    if (this.overlay) register(this.overlay);
    this.refresh();
    this.syncDepth();
  }

  get x(): number {
    return this.fx;
  }
  get y(): number {
    return this.fy;
  }
  get isSeated(): boolean {
    return this.seated;
  }
  get isMoving(): boolean {
    return this.waypoints.length > 0;
  }
  /** Nearest tile cell to the sprite's feet. */
  get cell(): Cell {
    // `fy` is the true feet line (SIT_DROP is a render-only offset), so no correction needed.
    return {
      tx: Math.floor(this.fx / TILE_SIZE),
      ty: Math.floor((this.fy + FEET_OFFSET - 1) / TILE_SIZE),
    };
  }

  /** Follow `path` (cells, first is the current cell); calls `done` on arrival. */
  walkTo(path: readonly Cell[], done?: () => void): void {
    this.seated = false;
    this.waypoints = path.slice(1).map((c) => ({ ...c }));
    this.onArrive = done ?? null;
    // Drop the seated render offset immediately so the sprite is back on its feet line.
    this.sprite.setPosition(this.fx, this.fy);
    if (this.waypoints.length === 0) this.finish();
    this.refresh();
  }

  face(dir: Dir): void {
    this.dir = dir;
    this.refresh();
  }

  /** Snap onto a stool cell and settle in facing `dir`. */
  sit(cell: Cell, dir: Dir): void {
    this.seated = true;
    this.waypoints = [];
    this.dir = dir;
    this.fx = cellCenterX(cell.tx);
    this.fy = cellFeetY(cell.ty);
    this.sprite.setPosition(this.fx, this.fy + SIT_DROP);
    this.refresh();
    this.syncDepth(1);
  }

  update(deltaMs: number): void {
    this.sprite.anims.timeScale = this.speedScale;
    if (this.overlay) this.overlay.anims.timeScale = this.speedScale;
    if (this.waypoints.length === 0) return;
    let budget = (WALK_SPEED * this.speedScale * deltaMs) / 1000;
    while (budget > 0 && this.waypoints.length > 0) {
      const target = this.waypoints[0]!;
      const tx = cellCenterX(target.tx);
      const ty = cellFeetY(target.ty);
      const dx = tx - this.fx;
      const dy = ty - this.fy;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01) {
        const nextDir: Dir =
          Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        if (nextDir !== this.dir) {
          this.dir = nextDir;
          this.refresh();
        }
      }
      if (dist <= budget) {
        this.fx = tx;
        this.fy = ty;
        budget -= dist;
        this.waypoints.shift();
      } else {
        this.fx += (dx / dist) * budget;
        this.fy += (dy / dist) * budget;
        budget = 0;
      }
    }
    // Whole-pixel render positions keep the pixel grid crisp; the true position stays in
    // fx/fy so sub-pixel movement accumulates instead of being rounded away each frame.
    this.sprite.setPosition(Math.round(this.fx), Math.round(this.fy));
    this.syncDepth();
    if (this.waypoints.length === 0) this.finish();
  }

  destroy(): void {
    this.sprite.destroy();
    this.overlay?.destroy();
  }

  private finish(): void {
    this.refresh();
    const cb = this.onArrive;
    this.onArrive = null;
    cb?.();
  }

  private refresh(): void {
    const anim = this.waypoints.length > 0 ? 'walk' : 'idle';
    this.sprite.play(catAnimKey(this.coat, this.dir, anim), true);
    if (this.overlay && this.accessory) {
      this.overlay.play(accAnimKey(this.accessory, this.dir, anim), true);
    }
  }

  /** y-sort: depth is the feet line; seated cats sit just in front of their stool. */
  private syncDepth(bias = 0): void {
    const depth = this.sprite.y + bias;
    this.sprite.setDepth(depth);
    this.overlay?.setPosition(this.sprite.x, this.sprite.y).setDepth(depth + 0.1);
  }
}
