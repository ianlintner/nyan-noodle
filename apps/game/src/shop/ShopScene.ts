import Phaser from 'phaser';
import {
  activeSeats,
  appealScore,
  createSimState,
  describeBuildError,
  getTier,
  layoutDemandMultiplier,
  planService,
  settleDay,
  upgradeInfo,
  upgradeTier,
} from '@nyan-noodle/sim';
import type { BuildError, ServicePlan, ShopTierId, SimState } from '@nyan-noodle/sim';
import { NATIVE_HEIGHT, NATIVE_WIDTH, TILE_SIZE } from '../config';
import { PALETTE } from '../theme/palette';
import { createButton, drawPanel, pixelText } from '../theme/hud';
import type { ButtonHandle } from '../theme/hud';
import { BuildController } from '../build/BuildController';
import type { BuildTool } from '../build/BuildController';
import { BuildPanel } from '../build/BuildPanel';
import { ATLAS_KEY, CatActor, cellCenterX, cellFeetY, createCatAnimations } from './CatActor';
import { CameraRig } from './CameraRig';
import { ShopDirector } from './director';
import { buildLayout } from './layout';
import type { ShopLayout } from './layout';
import { startSteam } from './steam';
import { WorldView } from './WorldView';
import { session } from '../meta/session';
import { SCENE_KEYS } from '../meta/ui';
import { ShopSound, shopSoundSource } from './sound';

export const SHOP_SCENE_KEY = 'ShopScene';
/** Real milliseconds per sim beat at 1x speed. */
export const BEAT_MS = 250;

export interface ShopParams {
  seed: number;
  tier: ShopTierId;
  speed: number;
  /** `build` opens straight into build mode instead of playing a service. */
  mode: 'service' | 'build';
  /** Dev/e2e overrides for starting Fish Coins and Reputation Stars. */
  coins: number | null;
  rep: number | null;
}

export function readShopParams(search: string): ShopParams {
  const q = new URLSearchParams(search);
  const tier = q.get('tier');
  const num = (key: string): number | null => (q.has(key) ? Number(q.get(key)) : null);
  return {
    seed: Number(q.get('seed') ?? 2026) || 2026,
    tier: tier === 'stall' || tier === 'small-shop' ? tier : 'cart',
    speed: Math.min(16, Math.max(1, Number(q.get('speed') ?? 1) || 1)),
    mode: q.get('mode') === 'build' ? 'build' : 'service',
    coins: num('coins'),
    rep: num('rep'),
  };
}

/** Phaser shop view: renders the layout, plays a service back, and hosts build mode. */
export class ShopScene extends Phaser.Scene {
  private params!: ShopParams;
  private state!: SimState;
  private layout!: ShopLayout;
  private plan: ServicePlan | null = null;
  private director: ShopDirector | null = null;
  private mode: 'service' | 'build' = 'service';
  private world!: WorldView;
  private rig!: CameraRig;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private build!: BuildController;
  private buildPanel!: BuildPanel;
  private toggle!: ButtonHandle;
  private beat = 0;
  private hudText!: Phaser.GameObjects.Text;
  private msgText!: Phaser.GameObjects.Text;
  private message = '';
  private staffActor: CatActor | null = null;
  /** True when driven by the day loop (prep -> service -> report) rather than the URL. */
  private inSession = false;
  private sessionMode: 'service' | 'build' = 'service';
  private settled = false;
  private speedButton: ButtonHandle | null = null;
  /** Qualities of the bowls hand-cooked in the kitchen (ServiceScene) before opening. */
  private chefQualities: readonly (number | null)[] = [];
  /** Cleanup for the animated stove-steam puffs (cosmetic, no sim effect). */
  private stopSteam: (() => void) | null = null;
  private shopAudio = new ShopSound();
  private soundSource = shopSoundSource(
    () => this.director?.events ?? [],
    () => this.beat,
  );

  constructor() {
    super(SHOP_SCENE_KEY);
  }

  init(data: {
    session?: boolean;
    mode?: 'service' | 'build';
    chefQualities?: readonly (number | null)[];
  }): void {
    this.chefQualities = data?.chefQualities ?? [];
    this.inSession = data?.session === true && session.active;
    this.sessionMode = data?.mode === 'build' ? 'build' : 'service';
    this.settled = false;
    this.beat = 0;
    this.plan = null;
    this.director = null;
    this.staffActor = null;
    this.speedButton = null;
  }

  preload(): void {
    this.load.atlas(ATLAS_KEY, 'assets/nyan-atlas.png', 'assets/nyan-atlas.json');
  }

  create(): void {
    this.params = readShopParams(window.location.search);
    const fresh = createSimState(this.params.seed, this.params.tier);
    this.state = this.inSession
      ? session.state
      : {
          ...fresh,
          economy: {
            ...fresh.economy,
            fishCoins: this.params.coins ?? fresh.economy.fishCoins,
            reputation: this.params.rep ?? fresh.economy.reputation,
          },
        };
    if (this.inSession) this.params = { ...this.params, mode: this.sessionMode };
    createCatAnimations(this);

    this.cameras.main.setBackgroundColor(PALETTE.nightBlue);
    this.cameras.main.setRoundPixels(true);
    this.uiCam = this.cameras.add(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);
    this.uiCam.setRoundPixels(true);
    const register = (o: Phaser.GameObjects.GameObject): void => {
      this.uiCam.ignore(o);
    };

    this.world = new WorldView(this, register);
    this.build = new BuildController({
      scene: this,
      getState: () => this.state,
      commit: (next) => this.commit(next),
      register,
      overUi: (x, y) => this.overUi(x, y),
      say: (text, good) => this.say(text, good),
    });
    this.layout = buildLayout(this.state.tierId, this.state.items);
    this.world.render(this.layout);
    this.rebuildStaff();
    this.stopSteam?.();
    this.stopSteam = startSteam(this, this.layout, this.uiCam);
    this.rig = new CameraRig(this, this.layout.cols * TILE_SIZE, this.layout.rows * TILE_SIZE);

    const hudBefore = new Set(this.children.list);
    this.buildHud();
    this.shopAudio.install(this, this.soundSource);
    for (const o of this.children.list) if (!hudBefore.has(o)) this.cameras.main.ignore(o);

    if (this.params.mode === 'build') this.enterBuild();
    else this.startService();
    this.exposeDebugApi();
    this.registry.set('shopReady', true);
    this.registry.set('shopInSession', this.inSession);
    this.events.once('shutdown', () => this.registry.set('shopInSession', false));
  }

  override update(_time: number, deltaMs: number): void {
    if (this.mode === 'build') {
      this.hudText.setText(this.buildSummary());
      const problem = this.build.hoverProblem;
      const text = problem ? describeBuildError(problem as BuildError) : this.message;
      this.msgText.setText(text);
      this.buildPanel.highlight(this.build.tool);
      return;
    }
    if (!this.plan || !this.director) return;
    const dt = Math.min(deltaMs, 100);
    this.beat += (dt * this.params.speed) / BEAT_MS;
    this.director.update(this.beat, dt, this.params.speed);
    if (this.inSession && !this.settled && this.beat > this.plan.beats && this.director.done) {
      this.finishDay();
    }
    const c = this.director.counts();
    this.hudText.setText(
      `Day ${this.plan.day} service ${Math.min(Math.floor(this.beat), this.plan.beats)}/${this.plan.beats}\n` +
        `Queue ${c.queued}  Seated ${c.seated}/${this.plan.seats}\n` +
        `Served ${c.served}  Lost ${c.lost}`,
    );
    this.msgText.setText('');
  }

  // ---- modes ---------------------------------------------------------------

  private startService(): void {
    this.build.disable();
    this.buildPanel.setVisible(false);
    this.rig.dragEnabled = true;
    this.mode = 'service';
    this.director?.destroy();
    this.plan = planService(this.state);
    this.beat = 0;
    this.director = new ShopDirector(this, this.layout, this.plan, (o) => this.uiCam.ignore(o));
    this.toggle.setLabel(this.inSession ? 'Skip day' : 'Build');
    this.speedButton?.container.setVisible(this.inSession);
    this.message = '';
  }

  /** Settle the finished service into the session, autosave, and show the report. */
  private finishDay(): void {
    if (!this.plan || this.settled) return;
    this.settled = true;
    const { state } = settleDay(this.state, this.plan, { chefQualities: this.chefQualities });
    session.update(state);
    this.scene.start(SCENE_KEYS.report);
  }

  private leaveBuild(): void {
    void session.save().catch(() => undefined);
    this.scene.start(SCENE_KEYS.prep);
  }

  private enterBuild(): void {
    this.director?.destroy();
    this.director = null;
    this.plan = null;
    this.mode = 'build';
    this.rig.dragEnabled = false;
    this.buildPanel.setVisible(true);
    this.buildPanel.setTier(this.state.tierId);
    this.build.enable();
    this.toggle.setLabel(this.inSession ? 'Done' : 'Open shop');
    this.speedButton?.container.setVisible(false);
    this.say('Pick furniture, click to place', true);
  }

  private commit(next: SimState): void {
    const tierChanged = next.tierId !== this.state.tierId;
    this.state = next;
    if (this.inSession) session.update(next);
    this.relayout(tierChanged);
  }

  private relayout(tierChanged: boolean): void {
    this.layout = buildLayout(this.state.tierId, this.state.items);
    this.world.render(this.layout);
    this.rebuildStaff();
    this.stopSteam?.();
    this.stopSteam = startSteam(this, this.layout, this.uiCam);
    if (tierChanged) {
      this.rig.resize(this.layout.cols * TILE_SIZE, this.layout.rows * TILE_SIZE);
      this.buildPanel.setTier(this.state.tierId);
    }
    this.build.refresh();
  }

  private upgrade(): void {
    const res = upgradeTier(this.state);
    if (!res.ok) return this.say(describeBuildError(res.reason), false);
    this.commit(res.state);
    const extra = res.refunded.length > 0 ? ` (${res.refunded.length} refunded)` : '';
    this.say(`Upgraded to ${getTier(res.state.tierId).name}!${extra}`, true);
  }

  private pick(tool: BuildTool): void {
    this.build.setTool(tool);
    this.buildPanel.highlight(this.build.tool);
    this.say(
      tool.kind === 'place' ? 'Click the floor to place (R turns)' : `${tool.kind}: click a piece`,
      true,
    );
  }

  private say(text: string, _good: boolean): void {
    this.message = text;
    this.buildPanel?.highlight(this.build?.tool ?? null);
  }

  private overUi(x: number, y: number): boolean {
    if (this.mode === 'build' && this.buildPanel.contains(x, y)) return true;
    return x < 136 && y < 58 ? true : x < 72 && y > NATIVE_HEIGHT - 20;
  }

  private buildSummary(): string {
    const s = this.state;
    const tier = getTier(s.tierId);
    const seats = activeSeats(s.tierId, s.items).length;
    const stoves = s.items.filter((i) => i.kind === 'stove').length;
    const demand = Math.round(
      (layoutDemandMultiplier(s.tierId, s.items) / tier.demandMultiplier - 1) * 100,
    );
    const up = upgradeInfo(s);
    const need = up ? `Next: ${up.cost}c ${up.reputation}*` : 'Top tier';
    return (
      `${tier.name}  Coins ${s.economy.fishCoins}\n` +
      `Seats ${seats}/${tier.seats} Stoves ${stoves}/${tier.stoves}\n` +
      `Appeal ${appealScore(s.items)} (+${demand}%) ${need}`
    );
  }

  // ---- scene pieces ----------------------------------------------------------

  private rebuildStaff(): void {
    this.staffActor?.destroy();
    this.staffActor = null;
    const cell = this.layout.staff;
    if (!cell) return;
    const staff = new CatActor(this, 'grey', 'scarf', cell, (o) => this.uiCam.ignore(o));
    staff.face('up');
    // Staff cat stands in the counter gap in front of the stove.
    staff.sprite.setPosition(cellCenterX(cell.tx), cellFeetY(cell.ty));
    this.staffActor = staff;
  }

  private buildHud(): void {
    const { content } = drawPanel(this, 4, 4, 128, 56, { title: 'Nyan Noodle' });
    this.hudText = pixelText(this, content.x + 2, content.y + 1, '');
    this.msgText = pixelText(this, 6, 62, '', { token: 'brothGold' });
    this.toggle = createButton(this, 4, NATIVE_HEIGHT - 18, 64, 14, 'Build', () => {
      if (this.inSession) return this.mode === 'build' ? this.leaveBuild() : this.finishDay();
      if (this.mode === 'build') this.startService();
      else this.enterBuild();
    });
    if (this.inSession) {
      this.speedButton = createButton(this, 72, NATIVE_HEIGHT - 18, 48, 14, 'x1', () => {
        const next = this.params.speed >= 8 ? 1 : this.params.speed * 2;
        this.params = { ...this.params, speed: next };
        this.speedButton?.setLabel(`x${next}`);
      });
    }
    this.buildPanel = new BuildPanel(
      this,
      {
        pick: (tool) => this.pick(tool),
        rotate: () => this.build.rotate(),
        upgrade: () => this.upgrade(),
      },
      this.state.tierId,
    );
    pixelText(this, NATIVE_WIDTH - 4, NATIVE_HEIGHT - 3, '+/- zoom  arrows pan', {
      token: 'cream',
      originX: 1,
      originY: 1,
    });
  }
  private exposeDebugApi(): void {
    const screen = (x: number, y: number): { x: number; y: number } => {
      const cam = this.cameras.main;
      const rect = this.game.canvas.getBoundingClientRect();
      const k = rect.width / NATIVE_WIDTH;
      const wx = (x + 1) * TILE_SIZE + TILE_SIZE / 2;
      const wy = (y + 1) * TILE_SIZE + TILE_SIZE / 2;
      return {
        x: rect.left + (wx - cam.worldView.x) * cam.zoom * k,
        y: rect.top + (wy - cam.worldView.y) * cam.zoom * k,
      };
    };
    const api = {
      beat: () => this.beat,
      zoom: () => this.rig.zoom,
      plan: () => this.plan,
      events: () => this.director?.events ?? [],
      counts: () =>
        this.director?.counts() ?? { present: 0, queued: 0, seated: 0, served: 0, lost: 0 },
      customers: () => this.director?.snapshot() ?? [],
      sortViolations: () => this.director?.sortViolations() ?? 0,
      done: () => !!this.plan && this.beat > this.plan.beats && !!this.director?.done,
      setZoom: (z: number) => this.rig.setZoom(z),
      staff: () => ({ x: this.staffActor?.x ?? 0, y: this.staffActor?.y ?? 0 }),
      mode: () => this.mode,
      state: () => JSON.parse(JSON.stringify(this.state)) as SimState,
      layoutSize: () => ({ cols: this.layout.cols, rows: this.layout.rows }),
      message: () => this.message,
      cellScreen: screen,
      /** Catalog / tool buttons by key: panel centre in page coordinates. */
      toolScreen: (index: number) => {
        const rect = this.game.canvas.getBoundingClientRect();
        const k = rect.width / NATIVE_WIDTH;
        const r = this.buildPanel.rect;
        return { x: rect.left + (r.x + 52) * k, y: rect.top + (r.y + 27 + index * 16) * k };
      },
      toggleScreen: () => {
        const rect = this.game.canvas.getBoundingClientRect();
        const k = rect.width / NATIVE_WIDTH;
        return { x: rect.left + 36 * k, y: rect.top + (NATIVE_HEIGHT - 11) * k };
      },
      startService: () => this.startService(),
      finishDay: () => this.finishDay(),
      setSpeed: (n: number) => (this.params = { ...this.params, speed: n }),
      inSession: () => this.inSession,
      enterBuild: () => this.enterBuild(),
    };
    (window as unknown as { __nyanShop: typeof api }).__nyanShop = api;
  }
}
