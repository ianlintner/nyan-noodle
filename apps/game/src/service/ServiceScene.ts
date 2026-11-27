import Phaser from 'phaser';
import {
  MIN_ACCEPT_QUALITY,
  settleBowl,
  traitQualityBar,
  type CookMeasurements,
  type ToppingId,
} from '@nyan-noodle/sim';
import { isPortrait } from '../config';
import { nativeScreenPoint } from '../shop/screen';
import { PALETTE } from '../theme/palette';
import { session } from '../meta/session';
import { audio } from '../audio/manager';
import { installPause } from '../audio/pause';
import { persistAudioSettings } from '../audio/controller';
import { backdrop } from '../meta/ui';
import { SHOP_SCENE_KEY } from '../shop/ShopScene';
import { ATLAS_KEY } from '../shop/CatActor';
import { ATLAS_JSON, ATLAS_PNG } from '../assets';
import { emptyBrothHold, requiredToppings, sampleBroth, toMeasurements } from './measure';
import { serviceRail, drawServiceRail, type ServiceTicket } from './tickets';
import { buildServiceHud } from './hud';
import { serviceLayout, stageBar, type ServiceLayout } from './layout';
import type { CookStage, ServiceTouchControls } from './touch';
import {
  BROTH_HI,
  BROTH_LO,
  BROTH_SAMPLES,
  drawBroth,
  drawNoodles,
  drawToppings,
} from './stageView';
export const SERVICE_SCENE_KEY = 'ServiceScene';

/** The three cooking minigames, run in order for each selected ticket. */
type Stage = CookStage;

const RUSH_THRESHOLD_BEATS = 30;

interface ServiceParams {
  seed: number;
  count: number;
}

/** Interactive service phase: ticket rail, three cooking minigames and a sim-scored serve. */
export class ServiceScene extends Phaser.Scene {
  private params: ServiceParams = { seed: 2026, count: 4 };
  private inSession = false;
  private tickets: ServiceTicket[] = [];
  private qualities: (number | null)[] = [];
  private todayLines: string[] = [];
  private activeIdx = -1;
  private completed = new Set<number>();
  private stage: Stage = 'broth';
  private layout!: ServiceLayout;
  private touch?: ServiceTouchControls;
  private touchHolding = false;
  private uiObjects: Phaser.GameObjects.GameObject[] = [];

  private readonly onViewportOrientation = (portrait: boolean): void => {
    if (portrait !== this.layout.portrait) this.relayout();
  };

  private brothHold = emptyBrothHold;
  private brothHeat = 0.5;
  private noodleSweep = 0;
  private noodleStopped = false;
  private toppingSequence: ToppingId[] = [];
  private required: readonly ToppingId[] = [];

  private streak = 0;
  private coins = 0;
  private beats = 0;

  private railButtons: Phaser.GameObjects.Container[] = [];
  private railRings: Phaser.GameObjects.Rectangle[] = [];
  private stageG!: Phaser.GameObjects.Graphics;
  private stageText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private keys!: Record<
    'SPACE' | 'W' | 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE' | 'SIX',
    Phaser.Input.Keyboard.Key
  >;

  constructor() {
    super(SERVICE_SCENE_KEY);
  }

  init(data: { session?: boolean }): void {
    this.inSession = data?.session === true && session.active;
    this.tickets = [];
    this.qualities = [];
    this.activeIdx = -1;
    this.completed = new Set();
    this.stage = 'broth';
    this.streak = 0;
    this.coins = 0;
    this.railButtons = [];
  }

  preload(): void {
    // The ticket rail draws cat portraits and dish icons from the shared atlas; when
    // booting straight into `?scene=service` this scene is first and must load it itself.
    this.load.atlas(ATLAS_KEY, ATLAS_PNG, ATLAS_JSON);
  }

  create(): void {
    audio.setMusicMode('service');
    const q = new URLSearchParams(window.location.search);
    this.params = {
      seed: Number(q.get('seed') ?? 2026) || 2026,
      count: Math.min(8, Math.max(1, Number(q.get('count') ?? 4) || 4)),
    };
    this.cameras.main.setBackgroundColor(PALETTE.nightBlue);
    backdrop(this);
    this.keys = this.input.keyboard!.addKeys(
      'SPACE,W,ONE,TWO,THREE,FOUR,FIVE,SIX',
    ) as unknown as ServiceScene['keys'];
    this.buildTickets();
    this.buildUi();
    installPause(this, persistAudioSettings);
    this.exposeDebugApi();
    this.registry.set('serviceReady', true);
    this.game.events.on('viewport-orientation', this.onViewportOrientation);
    this.events.once('shutdown', () => {
      this.registry.set('serviceReady', false);
      this.game.events.off('viewport-orientation', this.onViewportOrientation);
    });
  }

  // --- setup ---------------------------------------------------------------

  private buildTickets(): void {
    const rail = serviceRail(this.inSession, this.params.seed, this.params.count);
    this.tickets = rail.tickets;
    this.todayLines = rail.todayLines;
    this.qualities = this.tickets.map(() => null);
  }

  private buildUi(): void {
    this.layout = serviceLayout(isPortrait());
    const intro = this.inSession
      ? `Day ${session.state.clock.day}: cook the first cats'\nbowls by hand, or just\nopen the doors.`
      : 'Click a ticket on the rail.';
    const hud = buildServiceHud({
      scene: this,
      layout: this.layout,
      inSession: this.inSession,
      todayLines: this.todayLines,
      intro,
      onHold: (on) => (this.touchHolding = on),
      onStop: () => this.stopNoodles(),
      onTopping: (i) => this.addToppingByIndex(i),
      onServe: () => this.serve(),
      onOpenDoors: () => this.openDoors(),
    });
    this.stageG = hud.stageG;
    this.stageText = hud.stageText;
    this.statusText = hud.statusText;
    this.touch = hud.touch;
    this.uiObjects = hud.objects;
    this.drawRail();
  }

  /** Rebuild HUD for the new orientation while keeping tickets and cooking progress. */
  private relayout(): void {
    const hint = this.stageText.text;
    const status = this.statusText.text;
    const statusColor = this.statusText.style.color;
    this.touch?.destroy();
    this.uiObjects.forEach((o) => o.destroy());
    this.buildUi();
    this.stageText.setText(hint);
    this.statusText.setText(status).setColor(statusColor);
    this.drawStage();
  }

  private drawStage(): void {
    if (this.activeIdx < 0) return;
    const bar = stageBar(this.layout.cooking);
    if (this.stage === 'broth') drawBroth(this.stageG, this.brothHeat, this.brothHold.samples, bar);
    else if (this.stage === 'noodles')
      drawNoodles(this.stageG, this.tickets[this.activeIdx]!.doneness, this.noodleSweep, bar);
    else drawToppings(this.stageG, this.required.length, this.toppingSequence.length, bar);
  }

  private drawRail(): void {
    this.railButtons.forEach((b) => b.destroy());
    this.railRings.forEach((r) => r.destroy());
    const { buttons, rings } = drawServiceRail(
      this,
      this.tickets,
      this.activeIdx,
      this.completed,
      this.layout.railRows,
      (i) => this.select(i),
    );
    this.railButtons = buttons;
    this.railRings = rings;
  }

  // --- ticket selection & stage machine ------------------------------------

  private select(i: number): void {
    if (i < 0 || i >= this.tickets.length || this.completed.has(i)) return;
    this.activeIdx = i;
    this.stage = 'broth';
    this.brothHold = emptyBrothHold;
    this.brothHeat = 0.5;
    this.noodleSweep = 0;
    this.noodleStopped = false;
    this.toppingSequence = [];
    const ticket = this.tickets[i]!;
    this.required = requiredToppings(ticket.order.recipeId, ticket.order.extraToppings);
    this.beats = 0;
    this.stageText.setText('Broth: hold SPACE to heat.\nKeep the needle in the green band.');
    this.statusText.setText('');
    this.drawRail();
  }

  /** Leave the kitchen: the shop plays today's service with the hand-cooked bowls. */
  openDoors(): void {
    if (!this.inSession) return;
    this.scene.start(SHOP_SCENE_KEY, {
      session: true,
      mode: 'service',
      chefQualities: [...this.qualities],
    });
  }

  // --- per-frame update ----------------------------------------------------

  override update(_time: number, deltaMs: number): void {
    this.touch?.update(
      this.stage,
      this.required.length,
      this.activeIdx >= 0 && !this.completed.has(this.activeIdx),
    );
    if (this.activeIdx < 0) return;
    this.beats += deltaMs / 250;
    const k = this.keys;
    [k.ONE, k.TWO, k.THREE, k.FOUR, k.FIVE, k.SIX].forEach((key, i) => {
      if (Phaser.Input.Keyboard.JustDown(key)) this.addToppingByIndex(i);
    });
    if (Phaser.Input.Keyboard.JustDown(k.SPACE)) {
      if (this.stage === 'noodles') this.stopNoodles();
      else if (this.stage === 'serve') this.serve();
    }
    if (this.stage === 'broth') this.updateBroth(deltaMs);
    else if (this.stage === 'noodles') this.updateNoodles(deltaMs);
  }

  private updateBroth(deltaMs: number): void {
    const heating = this.keys.SPACE.isDown || this.keys.W.isDown || this.touchHolding;
    const dt = deltaMs / 16;
    const drift = (Math.sin(this.beats * 0.6) * 0.3 + 0.5 - this.brothHeat) * 0.02 * dt;
    const push = (heating ? 0.02 : -0.012) * dt;
    this.brothHeat = Phaser.Math.Clamp(this.brothHeat + push + drift, 0, 1);
    this.sampleBroth();
  }

  private sampleBroth(): void {
    this.brothHold = sampleBroth(this.brothHold, this.brothHeat, BROTH_LO, BROTH_HI);
    if (this.brothHold.samples >= BROTH_SAMPLES) this.advanceBroth();
    else this.drawStage();
  }

  private updateNoodles(deltaMs: number): void {
    if (!this.noodleStopped) this.noodleSweep = (this.noodleSweep + deltaMs / 1000 / 2.4) % 1;
    this.drawStage();
  }

  // --- input handlers (mouse + keyboard + e2e share these) -----------------

  private addToppingByIndex(index: number): void {
    if (index < 0 || index >= this.required.length) return;
    this.addTopping(this.required[index]!);
  }

  addTopping(id: ToppingId): void {
    if (this.stage !== 'toppings') return;
    this.toppingSequence = [...this.toppingSequence, id];
    audio.play('topping');
    this.drawStage();
    if (this.toppingSequence.length >= this.required.length) {
      this.stage = 'serve';
      this.stageText.setText('Bowl ready.\nPress SPACE to serve to the seat.');
    }
  }

  stopNoodles(): void {
    if (this.stage !== 'noodles') return;
    this.noodleStopped = true;
    this.stage = 'toppings';
    audio.play('boil');
    this.toppingSequence = [];
    this.drawStage();
    this.stageText.setText(`Toppings: tap 1..${this.required.length} in order.`);
  }

  private advanceBroth(): void {
    this.stage = 'noodles';
    audio.play('sizzle');
    this.noodleSweep = 0;
    this.noodleStopped = false;
    this.stageText.setText('Noodles: press SPACE when the\nbar hits the thick band.');
    this.drawStage();
  }

  serve(): void {
    const ticket = this.tickets[this.activeIdx];
    if (!ticket || this.completed.has(this.activeIdx)) return;
    if (this.stage !== 'serve' && this.toppingSequence.length < this.required.length) return;
    const payout = settleBowl(
      ticket.order.recipeId,
      ticket.order.extraToppings,
      ticket.order.price,
      this.metrics(),
      this.streak,
      Math.floor(this.beats),
      RUSH_THRESHOLD_BEATS,
      MIN_ACCEPT_QUALITY + (ticket.isRegular ? traitQualityBar(ticket.trait) : 0),
    );
    this.qualities[this.activeIdx] = payout.quality;
    if (payout.failed) {
      audio.play('serveFail');
      this.streak = 0;
      this.statusText
        .setText(`Quality ${payout.quality} — FAILED. Combo reset.`)
        .setColor(PALETTE.chiliRed);
    } else {
      this.streak += 1;
      const gain = ticket.order.price + payout.bonusCoins;
      this.coins += gain;
      audio.play(payout.quality >= 90 ? 'servePerfect' : 'serveOk');
      if (payout.bonusCoins > 0) audio.play('coins');
      this.statusText
        .setText(
          `+${gain} (price ${ticket.order.price}, tip ${payout.bonusCoins})\ncombo x${payout.comboMultiplier.toFixed(2)}  total ${this.coins}`,
        )
        .setColor(PALETTE.lanternYellow);
    }
    this.completed.add(this.activeIdx);
    this.stage = 'serve';
    const next = this.inSession ? 'Next ticket,\nor Open doors!' : 'Pick another ticket.';
    this.stageText.setText(`Quality ${payout.quality}/100. ${next}`);
    this.drawRail();
  }

  private metrics(): CookMeasurements {
    const ticket = this.tickets[this.activeIdx]!;
    return toMeasurements(
      this.brothHold,
      { stoppedAt: this.noodleStopped ? this.noodleSweep : 0 },
      { applied: this.toppingSequence },
      ticket.doneness,
    );
  }

  private exposeDebugApi(): void {
    const api = {
      inSession: () => this.inSession,
      stage: () => this.stage,
      activeIdx: () => this.activeIdx,
      streak: () => this.streak,
      coins: () => this.coins,
      completed: () => [...this.completed],
      qualities: () => [...this.qualities],
      tickets: () =>
        this.tickets.map((t) => ({
          recipeId: t.order.recipeId,
          extras: [...t.order.extraToppings],
          price: t.order.price,
          doneness: t.doneness,
        })),
      required: () => [...this.required],
      layout: () => this.layout,
      toppingSequence: () => [...this.toppingSequence],
      broth: () => ({ ...this.brothHold, heat: this.brothHeat }),
      noodleSweep: () => this.noodleSweep,
      select: (i: number) => this.select(i),
      ticketScreen: (i: number) =>
        nativeScreenPoint(this, this.railButtons[i]!.x, this.railButtons[i]!.y),
      addTopping: (t: ToppingId) => this.addTopping(t),
      addToppingByIndex: (i: number) => this.addToppingByIndex(i),
      stopNoodles: () => this.stopNoodles(),
      serve: () => this.serve(),
      openDoors: () => this.openDoors(),
      /** DEBUG: drive the broth needle directly, one sample per call. */
      setBrothHeat: (h: number) =>
        void ((this.brothHeat = Phaser.Math.Clamp(h, 0, 1)), this.sampleBroth()),
      /** DEBUG: set the noodle sweep position directly (before/after stop). */
      setNoodleSweep: (s: number) => void (this.noodleSweep = s % 1),
    };
    (window as unknown as { __nyanService: typeof api }).__nyanService = api;
  }
}
