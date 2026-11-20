import type Phaser from 'phaser';
import { TILE_SIZE } from '../config';
import { ATLAS_KEY } from './CatActor';
import type { Placed, ShopLayout } from './layout';

/**
 * Sprites for a `ShopLayout`: floor, walls and y-sorted furniture. Rebuilt whenever
 * the layout changes (build mode edits, tier upgrade). Holds no rules.
 */
export class WorldView {
  private objects: Phaser.GameObjects.Image[] = [];
  private byItem = new Map<number, Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    /** Hides each created object from the HUD camera. */
    private readonly register: (o: Phaser.GameObjects.GameObject) => void,
  ) {}

  render(layout: ShopLayout): void {
    this.clear();
    for (const f of layout.floor) this.place(f, -1000);
    // Walls and furniture y-sort by their bottom edge, shared with cat feet.
    for (const w of layout.walls) this.place(w, (w.ty + 1) * TILE_SIZE);
    for (const f of layout.furniture) this.place(f, (f.ty + 1) * TILE_SIZE - 1);
  }

  /** The sprite showing a sim item (for tinting while it is being moved). */
  spriteOf(itemId: number): Phaser.GameObjects.Image | undefined {
    return this.byItem.get(itemId);
  }

  clear(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.byItem.clear();
  }

  private place(p: Placed, depth: number): void {
    const frame = this.scene.textures.getFrame(ATLAS_KEY, p.frame);
    const image = this.scene.add
      .image(p.tx * TILE_SIZE, (p.ty + 1) * TILE_SIZE, ATLAS_KEY, p.frame)
      .setOrigin(0, 1)
      .setDepth(depth)
      .setSize(frame.width, frame.height);
    this.register(image);
    this.objects.push(image);
    if (p.itemId !== null) this.byItem.set(p.itemId, image);
  }
}
