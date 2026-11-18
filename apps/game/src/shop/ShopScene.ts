import Phaser from 'phaser';
import { createSimState, planService } from '@nyan-noodle/sim';
import type { ServicePlan, ShopTierId } from '@nyan-noodle/sim';
import { NATIVE_HEIGHT, NATIVE_WIDTH, TILE_SIZE } from '../config';
import { PALETTE } from '../theme/palette';
import { drawPanel, pixelText } from '../theme/hud';
import { ATLAS_KEY, CatActor, cellCenterX, cellFeetY, createCatAnimations } from './CatActor';
import { CameraRig } from './CameraRig';
import { ShopDirector } from './director';
import { buildLayout } from './layout';
import type { Placed, ShopLayout } from './layout';

export const SHOP_SCENE_KEY = 'ShopScene';
/** Real milliseconds per sim beat at 1x speed. */
export const BEAT_MS = 250;

export interface ShopParams {
  seed: number;
  tier: ShopTierId;
  speed: number;
}

export function readShopParams(search: string): ShopParams {
  const q = new URLSearchParams(search);
  const tier = q.get('tier');
  return {
    seed: Number(q.get('seed') ?? 2026) || 2026,
    tier: tier === 'stall' || tier === 'small-shop' ? tier : 'cart',
    speed: Math.min(16, Math.max(1, Number(q.get('speed') ?? 1) || 1)),
  };
}

/** Phaser shop view: renders the layout and plays the sim's service plan back. */
export class ShopScene extends Phaser.Scene {
  private params: ShopParams = { seed: 2026, tier: 'cart', speed: 1 };
  private layout!: ShopLayout;
  private plan!: ServicePlan;
  private director!: ShopDirector;
  private rig!: CameraRig;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private beat = 0;
  private hudText!: Phaser.GameObjects.Text;

  constructor() {
    super(SHOP_SCENE_KEY);
  }

  preload(): void {
    this.load.atlas(ATLAS_KEY, 'assets/nyan-atlas.png', 'assets/nyan-atlas.json');
  }

  create(): void {
    this.params = readShopParams(window.location.search);
    const state = createSimState(this.params.seed, this.params.tier);
    this.plan = planService(state);
    this.layout = buildLayout(this.params.tier);
    createCatAnimations(this);

    this.cameras.main.setBackgroundColor(PALETTE.nightBlue);
    this.cameras.main.setRoundPixels(true);
    this.uiCam = this.cameras.add(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);
    this.uiCam.setRoundPixels(true);

    const before = new Set(this.children.list);
    this.buildWorld();
    this.buildStaff();
    for (const o of this.children.list) if (!before.has(o)) this.uiCam.ignore(o);

    this.director = new ShopDirector(this, this.layout, this.plan, (o) => this.uiCam.ignore(o));
    this.rig = new CameraRig(this, this.layout.cols * TILE_SIZE, this.layout.rows * TILE_SIZE);

    const hudBefore = new Set(this.children.list);
    this.buildHud();
    for (const o of this.children.list) if (!hudBefore.has(o)) this.cameras.main.ignore(o);

    this.exposeDebugApi();
    this.registry.set('shopReady', true);
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 100);
    this.beat += (dt * this.params.speed) / BEAT_MS;
    this.director.update(this.beat, dt, this.params.speed);
    const c = this.director.counts();
    const day = this.plan.day;
    this.hudText.setText(
      `Day ${day} service ${Math.min(Math.floor(this.beat), this.plan.beats)}/${this.plan.beats}\n` +
        `Queue ${c.queued}  Seated ${c.seated}/${this.plan.seats}\n` +
        `Served ${c.served}  Lost ${c.lost}`,
    );
  }

  private placeSprite(p: Placed, depth: number): Phaser.GameObjects.Image {
    const frame = this.textures.getFrame(ATLAS_KEY, p.frame);
    return this.add
      .image(p.tx * TILE_SIZE, (p.ty + 1) * TILE_SIZE, ATLAS_KEY, p.frame)
      .setOrigin(0, 1)
      .setDepth(depth)
      .setSize(frame.width, frame.height);
  }

  private buildWorld(): void {
    for (const f of this.layout.floor) this.placeSprite(f, -1000);
    // Walls and furniture y-sort by their bottom edge, shared with cat feet.
    for (const w of this.layout.walls) this.placeSprite(w, (w.ty + 1) * TILE_SIZE);
    for (const f of this.layout.furniture) this.placeSprite(f, (f.ty + 1) * TILE_SIZE - 1);
  }

  private buildStaff(): void {
    const staff = new CatActor(this, 'grey', 'scarf', this.layout.staff, () => undefined);
    staff.face('up');
    this.staffActor = staff;
    // Staff cat stands in the counter gap in front of the stove.
    staff.sprite.setPosition(cellCenterX(this.layout.staff.tx), cellFeetY(this.layout.staff.ty));
  }

  private staffActor: CatActor | null = null;

  private buildHud(): void {
    const { content } = drawPanel(this, 4, 4, 128, 48, { title: 'Nyan Noodle' });
    this.hudText = pixelText(this, content.x + 2, content.y + 1, '');
    pixelText(this, NATIVE_WIDTH - 4, NATIVE_HEIGHT - 3, '+/- zoom  arrows pan', {
      token: 'cream',
      originX: 1,
      originY: 1,
    });
  }

  private exposeDebugApi(): void {
    const api = {
      beat: () => this.beat,
      zoom: () => this.rig.zoom,
      plan: () => this.plan,
      events: () => this.director.events,
      counts: () => this.director.counts(),
      customers: () => this.director.snapshot(),
      sortViolations: () => this.director.sortViolations(),
      done: () => this.beat > this.plan.beats && this.director.done,
      setZoom: (z: number) => this.rig.setZoom(z),
      staff: () => ({ x: this.staffActor?.x ?? 0, y: this.staffActor?.y ?? 0 }),
    };
    (window as unknown as { __nyanShop: typeof api }).__nyanShop = api;
  }
}
