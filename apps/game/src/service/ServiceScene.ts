import Phaser from 'phaser';
import {
  MIN_ACCEPT_QUALITY,
  settleBowl,
  traitQualityBar,
  type CookMeasurements,
  type ToppingId,
} from '@nyan-noodle/sim';
import { isPortrait } from '../config';
import { PALETTE } from '../theme/palette';
import { createButton, drawPanel, pixelText } from '../theme/hud';
import { session } from '../meta/session';
import { audio } from '../audio/manager';
import { installPause } from '../audio/pause';
import { persistAudioSettings } from '../audio/controller';
import { backdrop } from '../meta/ui';
import { SHOP_SCENE_KEY } from '../shop/ShopScene';
import { ATLAS_KEY } from '../shop/CatActor';
import { ATLAS_JSON, ATLAS_PNG } from '../assets';
import { emptyBrothHold, requiredToppings, sampleBroth, toMeasurements } from './measure';
import { serviceRail, type ServiceTicket } from './tickets';
import { serviceLayout, type ServiceLayout } from './layout';
import { ServiceTouchControls, type CookStage } from './touch';
import {
  BROTH_HI,
  BROTH_LO,
  BROTH_SAMPLES,
  drawBroth,
  drawNoodles,
  drawTicketRail,
  drawTodayPanel,
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

/**
 * Interactive service phase: a ticket rail, three cooking minigames, serve with
 * quality-driven tips/combos. The pure sim scores every result; this scene only
 * measures player input and plays the payout back. With a session the rail holds
 * today's first cats and "Open doors!" starts the shop; `?scene=service` alone is
 * a seeded sandbox.
 */
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
    this.events.once('shutdown', () => this.registry.set('serviceReady', false));
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
    const { rail, cooking, today, touch: pad, openDoors, hintY } = this.layout;
    drawPanel(this, rail.x, rail.y, rail.w, rail.h);
    const { content } = drawPanel(this, cooking.x, cooking.y, cooking.w, cooking.h, {
      title: 'Cooking',
    });
    this.stageG = this.add.graphics();
    const intro = this.inSession
      ? `Day ${session.state.clock.day}: cook the first cats'\nbowls by hand, or just\nopen the doors.`
      : 'Click a ticket on the rail.';
    this.stageText = pixelText(this, content.x + 2, content.y + 4, intro);
    this.statusText = pixelText(this, content.x + 2, content.y + Math.min(134, cooking.h - 24), '', {
      token: 'lanternYellow',
    });
    this.drawRail();
    if (this.inSession) {
      drawTodayPanel(this, this.todayLines, today);
      createButton(this, openDoors.x, openDoors.y, openDoors.w, openDoors.h, 'Open doors!', () =>
        this.openDoors(),
      );
    }
    pixelText(
      this,
      4,
      hintY,
      this.layout.railRows > 1
        ? 'tap tickets   HOLD  STOP  1-6 toppings'
        : 'click tickets   SPACE advance   W heat   1-6 toppings',
      { token: 'steamWhite' },
    );
    this.touch = new ServiceTouchControls(this, pad, this.layout.railRows > 1, {
      hold: (on) => (this.touchHolding = on),
      stop: () => this.stopNoodles(),
      topping: (i) => this.addToppingByIndex(i),
      serve: () => this.serve(),
      openDoors: () => this.openDoors(),
    });
  }

  private drawRail(): void {
    this.railButtons.forEach((b) => b.destroy());
    this.railButtons = [];
    this.railRings.forEach((r) => r.destroy());
    this.railRings = [];
    const { buttons, rings } = drawTicketRail(
      this,
      this.tickets.map((t) => ({
        recipeId: t.order.recipeId,
        coat: t.coat,
        patience: t.patience,
        name: t.name,
        trait: t.trait,
        affection: t.affection,
        resolveCoat: (coat) => (coat === 'sakura' ? 'white' : coat),
        onSelect: (i) => this.select(i),
      })),
      this.activeIdx,
      this.completed,
      this.layout.railRows,
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
    else drawBroth(this.stageG, this.brothHeat, this.brothHold.samples);
  }

  private updateNoodles(deltaMs: number): void {
    if (!this.noodleStopped) this.noodleSweep = (this.noodleSweep + deltaMs / 1000 / 2.4) % 1;
    drawNoodles(this.stageG, this.tickets[this.activeIdx]!.doneness, this.noodleSweep);
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
    drawToppings(this.stageG, this.required.length, this.toppingSequence.length);
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
    drawToppings(this.stageG, this.required.length, 0);
    this.stageText.setText(`Toppings: tap 1..${this.required.length} in order.`);
  }

  private advanceBroth(): void {
    this.stage = 'noodles';
    audio.play('sizzle');
    this.noodleSweep = 0;
    this.noodleStopped = false;
    this.stageText.setText('Noodles: press SPACE when the\nbar hits the thick band.');
    drawNoodles(this.stageG, this.tickets[this.activeIdx]!.doneness, 0);
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
      toppingSequence: () => [...this.toppingSequence],
      broth: () => ({ ...this.brothHold, heat: this.brothHeat }),
      noodleSweep: () => this.noodleSweep,
      select: (i: number) => this.select(i),
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
