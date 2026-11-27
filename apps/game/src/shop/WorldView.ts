import type Phaser from 'phaser';
import { NATIVE_HEIGHT, NATIVE_WIDTH, TILE_SIZE } from '../config';
import { color } from '../theme/palette';
import { ATLAS_KEY } from './CatActor';
import type { Placed, ShopLayout } from './layout';

export interface ExteriorDressing {
  readonly frame: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Sprites for a `ShopLayout`: floor, walls and y-sorted furniture. Rebuilt whenever
 * the layout changes (build mode edits, tier upgrade). Holds no rules.
 */
export class WorldView {
  private objects: Phaser.GameObjects.Image[] = [];
  private byItem = new Map<number, Phaser.GameObjects.Image>();
  private backdrop: Phaser.GameObjects.GameObject[] = [];
  private exterior: ExteriorDressing[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    /** Hides each created object from the HUD camera. */
    private readonly register: (o: Phaser.GameObjects.GameObject) => void,
  ) {}

  render(layout: ShopLayout): void {
    this.clear();
    this.renderBackdrop(layout);
    (
      window as unknown as { __nyanWorld: { exterior: () => readonly ExteriorDressing[] } }
    ).__nyanWorld = { exterior: () => this.exteriorDressing() };
    for (const f of layout.floor) this.place(f, -1000);
    // Walls, furniture and cats all y-sort by the SAME feet line: (ty+1)*TILE_SIZE.
    // Sub-pixel fractions order layers within one row: wall (0) -> floor-level
    // furniture (0.1) -> tall furniture (0.2) -> cats/staff (0.5). Cats always sit
    // in front of the furniture in their row; furniture occludes the wall behind it.
    for (const w of layout.walls) this.place(w, (w.ty + 1) * TILE_SIZE + 0.1);
    for (const f of layout.furniture) this.place(f, f.depth ?? (f.ty + 1) * TILE_SIZE + 0.3);
    this.renderWarmLight(layout);
  }

  /** The sprite showing a sim item (for tinting while it is being moved). */
  spriteOf(itemId: number): Phaser.GameObjects.Image | undefined {
    return this.byItem.get(itemId);
  }

  clear(): void {
    for (const o of this.objects) o.destroy();
    for (const b of this.backdrop) b.destroy();
    this.objects = [];
    this.backdrop = [];
    this.exterior = [];
    this.byItem.clear();
  }

  /** Non-interactive street dressing placed in the camera margins (e2e layout gate). */
  exteriorDressing(): readonly ExteriorDressing[] {
    return this.exterior.map((d) => ({ ...d }));
  }

  /**
   * Dusk street beyond the shop: banded translucent night-shades drawn behind the whole
   * map, extending a little past the walls so the camera margins read as dusk rather than
   * a flat navy void. Layered solid fills instead of `fillGradientStyle`, which forces a
   * costly ReadPixels on software GL and crashed the headless CI renderer.
   */
  private renderBackdrop(layout: ShopLayout): void {
    const worldW = layout.cols * TILE_SIZE;
    const worldH = layout.rows * TILE_SIZE;
    // The backdrop must cover the whole camera view, not just the map: at fit-zoom 1 a
    // small (cart/stall) map is centred in the 480x270 viewport, and the deep navy margin
    // reads as an unfinished void. Centre the dusk bands on the map and span the full
    // native viewport so the margins read as dusk sky instead of flat navy.
    const spanW = Math.max(worldW, NATIVE_WIDTH);
    const spanH = Math.max(worldH, NATIVE_HEIGHT);
    const ox = (worldW - spanW) / 2;
    const oy = (worldH - spanH) / 2;
    const g = this.scene.add.graphics();
    // Dusk: cool indigo at the top warming toward the street. Layers are translucent
    // over the camera's night-blue so the small-map margins read as evening sky, not a
    // flat navy void. Solid fills (no fillGradientStyle) avoid software-GL ReadPixels.
    const bands: [Parameters<typeof color>[0], number][] = [
      ['norenIndigo', 0.85],
      ['norenIndigo', 0.5],
      ['woodDark', 0.45],
      ['brothGold', 0.18],
    ];
    const bandH = spanH / bands.length;
    bands.forEach(([token, alpha], i) => {
      g.fillStyle(color(token), alpha);
      g.fillRect(ox, oy + i * bandH, spanW, bandH + 1);
    });
    g.setDepth(-2000);
    this.register(g);
    this.backdrop.push(g);
    this.paveStreet(ox, oy, spanW, spanH, bandH, worldW);
  }

  /**
   * Street dressing for the dusk margins: stone paving in the lower bands plus
   * hanging noren/lanterns beside the shop. Purely cosmetic: no itemId, no hit
   * areas, no sim contact, and never painted above the shop's own floor.
   */
  private paveStreet(
    ox: number,
    oy: number,
    spanW: number,
    spanH: number,
    bandH: number,
    worldW: number,
  ): void {
    const add = (frame: string, x: number, y: number, scale: number, alpha: number): void => {
      const image = this.scene.add
        .image(x, y, ATLAS_KEY, frame)
        .setOrigin(0, 0)
        .setScale(scale)
        .setAlpha(alpha)
        .setDepth(-1900);
      this.register(image);
      this.backdrop.push(image);
      const src = this.scene.textures.getFrame(ATLAS_KEY, frame);
      this.exterior.push({
        frame,
        x,
        y,
        width: src.width * scale,
        height: src.height * scale,
      });
    };
    const streetTop = oy + 2 * bandH;
    for (let px = ox; px < ox + spanW; px += TILE_SIZE) {
      for (let py = streetTop; py < oy + spanH; py += TILE_SIZE) {
        add('tile/floor_stone', px, py, 1, 0.55);
      }
    }
    for (const x of [-TILE_SIZE * 3, -TILE_SIZE, worldW + TILE_SIZE, worldW + TILE_SIZE * 3]) {
      add('furniture/noren', x, 4, 1.5, 0.95);
      add('furniture/lantern', x + 4, 40, 1.5, 0.95);
      add('furniture/lantern', x + 4, 82, 1.5, 0.95);
    }
  }

  /**
   * Warm lantern glow over the interior. A single translucent lantern-yellow fill drawn
   * ABOVE the furniture but at a depth just under the noren, so the whole room reads as
   * warmly lit while seated/queued cats layer normally in front of it.
   */
  private renderWarmLight(layout: ShopLayout): void {
    const worldW = layout.cols * TILE_SIZE;
    const worldH = layout.rows * TILE_SIZE;
    const g = this.scene.add.graphics();
    g.fillStyle(color('lanternYellow'), 0.12);
    g.fillRect(0, 0, worldW, worldH);
    // Just under the noren (rows*TILE_SIZE + 1) and above all row-sorted furniture.
    g.setDepth(layout.rows * TILE_SIZE + 0.9);
    this.register(g);
    this.backdrop.push(g);
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
