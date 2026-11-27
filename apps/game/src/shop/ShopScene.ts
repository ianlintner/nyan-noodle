import Phaser from 'phaser';
import {
  createSimState,
  describeBuildError,
  getTier,
  isTierId,
  planService,
  tipEligibleVisits,
  settleDay,
  upgradeTier,
  type BuildError,
  type ServicePlan,
  type ShopTierId,
  type SimState,
} from '@nyan-noodle/sim';
import { NATIVE_HEIGHT, NATIVE_WIDTH, TILE_SIZE } from '../config';
import { PALETTE } from '../theme/palette';
import type { ButtonHandle } from '../theme/hud';
import { buildShopHud, overBottomButtons, shopBuildSummary } from './hudView';
import { BuildController, type BuildTool } from '../build/BuildController';
import { BTN_STEP, type BuildPanel } from '../build/BuildPanel';
import { ATLAS_KEY, CatActor, cellCenterX, cellFeetY, createCatAnimations } from './CatActor';
import { ATLAS_JSON, ATLAS_PNG } from '../assets';
import { CameraRig } from './CameraRig';
import { ShopDirector } from './director';
import { ShopInteraction } from './interact';
import { buildLayout } from './layout';
import type { ShopLayout } from './layout';
import { startSteam } from './steam';
import { overBuildTouch, type ShopTouchUi } from './touch';
import { cellScreenPoint, nativeScreenPoint } from './screen';
import { WorldView } from './WorldView';
import { session } from '../meta/session';
import { installCoach, overCoachButton, type CoachHandle } from '../meta/coach';
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
    tier: isTierId(tier) ? tier : 'cart',
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
  private interact: ShopInteraction | null = null;
  private mode: 'service' | 'build' = 'service';
  private world!: WorldView;
  private rig!: CameraRig;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private build!: BuildController;
  private buildPanel!: BuildPanel;
  private touchUi!: ShopTouchUi;
  private toggle!: ButtonHandle;
  private coach!: CoachHandle;
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
    () => this.mode,
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
    this.interact = null;
    this.staffActor = null;
    this.speedButton = null;
  }

  preload(): void {
    this.load.atlas(ATLAS_KEY, ATLAS_PNG, ATLAS_JSON);
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
    this.coach = installCoach(
      this,
      this.params.mode === 'build' ? 'build' : 'shop',
      session.coach,
      {
        registerUi: (o) => this.cameras.main.ignore(o),
      },
    );
    this.shopAudio.install(this, this.soundSource, {
      registerUi: (o) => this.cameras.main.ignore(o),
    });
    for (const o of this.children.list) if (!hudBefore.has(o)) this.cameras.main.ignore(o);

    if (this.params.mode === 'build') this.enterBuild();
    else this.startService();
    this.exposeDebugApi();
    this.registry.set('shopReady', true);
    this.registry.set('shopInSession', this.inSession);
    this.events.once('shutdown', () => this.registry.set('shopInSession', false));
  }

  override update(_time: number, deltaMs: number): void {
    this.touchUi.setVisible(this.mode === 'build');
    if (this.mode === 'build') {
      this.hudText.setText(shopBuildSummary(this.state));
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
    this.interact?.update();
    if (this.inSession && !this.settled && this.beat > this.plan.beats && this.director.done) {
      this.finishDay();
    }
    const c = this.director.counts();
    this.hudText.setText(
      `Day ${this.plan.day} service ${Math.min(Math.floor(this.beat), this.plan.beats)}/${this.plan.beats}\n` +
        `Queue ${c.queued}  Seated ${c.seated}/${this.plan.seats}\n` +
        `Served ${c.served}  Lost ${c.lost}\n${this.interact?.hudLine() ?? ''}`,
    );
    this.msgText.setText('');
  }

  // ---- modes ---------------------------------------------------------------

  private startService(): void {
    this.build.disable();
    this.buildPanel.setVisible(false);
    this.rig.dragEnabled = true;
    this.mode = 'service';
    this.coach.setContext('shop');
    this.director?.destroy();
    this.interact?.destroy();
    this.plan = planService(this.state);
    this.beat = 0;
    this.director = new ShopDirector(this, this.layout, this.plan, (o) => this.uiCam.ignore(o));
    this.interact = new ShopInteraction({
      scene: this,
      layout: this.layout,
      tier: this.state.tierId,
      director: this.director,
      beat: () => this.beat,
      replan: (byCat) => (this.plan = planService(this.state, undefined, byCat)),
      eligible: tipEligibleVisits(this.state, this.plan, this.chefQualities),
      overUi: (x, y) => this.overUi(x, y),
      register: (o) => this.uiCam.ignore(o),
    });
    this.toggle.setLabel(this.inSession ? 'Skip day' : 'Build');
    this.speedButton?.container.setVisible(this.inSession);
    this.message = '';
  }

  /** Settle the finished service into the session, autosave, and show the report. */
  private finishDay(): void {
    if (!this.plan || this.settled) return;
    this.settled = true;
    const { state } = settleDay(this.state, this.plan, {
      chefQualities: this.chefQualities,
      collected: this.interact?.ids,
    });
    session.update(state);
    this.scene.start(SCENE_KEYS.report);
  }

  private leaveBuild(): void {
    void session.save().catch(() => undefined);
    this.scene.start(SCENE_KEYS.prep);
  }

  private enterBuild(): void {
    this.director?.destroy();
    this.interact?.destroy();
    this.interact = null;
    this.director = null;
    this.plan = null;
    this.mode = 'build';
    this.rig.dragEnabled = false;
    this.buildPanel.setVisible(true);
    this.buildPanel.setTier(this.state.tierId);
    this.build.enable();
    this.toggle.setLabel(this.inSession ? 'Done' : 'Open shop');
    this.speedButton?.container.setVisible(false);
    this.coach.setContext('build');
    if (this.params.mode !== 'build') this.coach.callout('build');
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
    if (this.mode === 'build' && (this.buildPanel.contains(x, y) || overBuildTouch(x, y)))
      return true;
    return (x < 136 && y < 68) || overBottomButtons(x, y) || overCoachButton('shop', x, y);
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
    const hud = buildShopHud({
      scene: this,
      inSession: this.inSession,
      tierId: this.state.tierId,
      rig: this.rig,
      build: this.build,
      isBuild: () => this.mode === 'build',
      speed: () => this.params.speed,
      onSpeed: (next) => void (this.params = { ...this.params, speed: next }),
      onToggle: () => {
        if (this.inSession) return this.mode === 'build' ? this.leaveBuild() : this.finishDay();
        if (this.mode === 'build') this.startService();
        else this.enterBuild();
      },
      onPick: (tool) => this.pick(tool),
      onRotate: () => this.build.rotate(),
      onUpgrade: () => this.upgrade(),
    });
    Object.assign(this, hud);
  }
  private exposeDebugApi(): void {
    const screen = (x: number, y: number): { x: number; y: number } => cellScreenPoint(this, x, y);
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
      toolScreen: (i: number) =>
        nativeScreenPoint(
          this,
          this.buildPanel.rect.x + 52,
          this.buildPanel.rect.y + 27 + i * BTN_STEP,
        ),
      toggleScreen: () => nativeScreenPoint(this, 36, NATIVE_HEIGHT - 11),
      startService: () => this.startService(),
      finishDay: () => this.finishDay(),
      interact: () => this.interact?.debug() ?? null,
      setSpeed: (n: number) => (this.params = { ...this.params, speed: n }),
      inSession: () => this.inSession,
      enterBuild: () => this.enterBuild(),
    };
    (window as unknown as { __nyanShop: typeof api }).__nyanShop = api;
  }
}
