import Phaser from 'phaser';
import {
  CHEF_TICKETS,
  DONENESS_OPTIONS,
  RECIPES,
  bowlPrice,
  chefTickets,
  createRng,
  createSimState,
  generateOrder,
  planService,
  settleBowl,
  type CookMeasurements,
  type Doneness,
  type Order,
  type ToppingId,
} from '@nyan-noodle/sim';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { PALETTE } from '../theme/palette';
import { createButton, drawPanel, pixelText, type ButtonHandle } from '../theme/hud';
import { session } from '../meta/session';
import { SHOP_SCENE_KEY } from '../shop/ShopScene';
import { emptyBrothHold, requiredToppings, sampleBroth, toMeasurements } from './measure';
import {
  BROTH_HI,
  BROTH_LO,
  BROTH_SAMPLES,
  drawBroth,
  drawNoodles,
  drawTodayPanel,
  drawToppings,
} from './stageView';

export const SERVICE_SCENE_KEY = 'ServiceScene';

/** The three cooking minigames, run in order for each selected ticket. */
type Stage = 'broth' | 'noodles' | 'toppings' | 'serve';

const RUSH_THRESHOLD_BEATS = 30;

interface Ticket {
  readonly order: Order;
  readonly doneness: Doneness;
}

interface ServiceParams {
  seed: number;
  count: number;
}

function readServiceParams(search: string): ServiceParams {
  const q = new URLSearchParams(search);
  return {
    seed: Number(q.get('seed') ?? 2026) || 2026,
    count: Math.min(8, Math.max(1, Number(q.get('count') ?? 4) || 4)),
  };
}

/**
 * Interactive service phase: a ticket rail, three cooking minigames, serve with
 * quality-driven tips/combos. The pure sim scores every result; this scene only
 * measures player input (heat samples, boil stop, topping taps) and plays the
 * payout back. Keyboard + mouse both drive the same handlers.
 *
 * In a game session (started from Prep) the rail holds today's first seated cats and
 * "Open doors!" hands the hand-cooked qualities to the shop's service and settlement.
 * Without a session (`?scene=service`) it is a sandbox with seeded tickets.
 */
export class ServiceScene extends Phaser.Scene {
  private params: ServiceParams = { seed: 2026, count: 4 };
  private inSession = false;
  private tickets: Ticket[] = [];
  private qualities: (number | null)[] = [];
  private todayLines: string[] = [];
  private activeIdx = -1;
  private completed = new Set<number>();
  private stage: Stage = 'broth';

  private brothHold = emptyBrothHold;
  private brothHeat = 0.5;
  private noodleSweep = 0;
  private noodleStopped = false;
  private toppingSequence: ToppingId[] = [];
  private required: readonly ToppingId[] = [];

  private streak = 0;
  private coins = 0;
  private beats = 0;

  private railButtons: ButtonHandle[] = [];
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

  create(): void {
    this.params = readServiceParams(window.location.search);
    this.cameras.main.setBackgroundColor(PALETTE.nightBlue);
    this.keys = this.input.keyboard!.addKeys(
      'SPACE,W,ONE,TWO,THREE,FOUR,FIVE,SIX',
    ) as unknown as ServiceScene['keys'];
    this.buildTickets();
    this.buildUi();
    this.exposeDebugApi();
    this.registry.set('serviceReady', true);
    this.events.once('shutdown', () => this.registry.set('serviceReady', false));
  }

  // --- setup ---------------------------------------------------------------

  private buildTickets(): void {
    if (this.inSession) {
      const state = session.state;
      const plan = planService(state);
      this.tickets = chefTickets(state, plan, CHEF_TICKETS);
      const coming = plan.visits.filter((v) => v.outcome === 'served').length;
      this.todayLines = [
        `${coming} cats will get a seat (${plan.seats} seats)`,
        `Stock: ${state.stock} bowls`,
        `Hand-cook up to ${this.tickets.length} bowls first.`,
        'Better bowls = bigger tips + more stars.',
        'Skipped tickets cook at your usual quality.',
      ];
    } else {
      const state = createSimState(this.params.seed, 'cart');
      const rng = createRng((this.params.seed * 31 + 7) >>> 0);
      for (let i = 0; i < this.params.count; i++) {
        const recipeId = state.unlockedRecipes[rng.int(0, state.unlockedRecipes.length - 1)]!;
        const cat = {
          id: i,
          coat: 'tabby' as const,
          patience: 0,
          preferences: { recipeOrder: [recipeId], likedToppings: [] },
          isRegular: false,
          visits: 0,
        };
        const order = generateOrder(i, cat, state.economy.reputation, bowlPrice, rng);
        this.tickets.push({ order, doneness: DONENESS_OPTIONS[rng.int(0, 2)]! });
      }
    }
    this.qualities = this.tickets.map(() => null);
  }

  private buildUi(): void {
    drawPanel(this, 4, 4, NATIVE_WIDTH - 8, 26, { title: 'Ticket rail' });
    const { content } = drawPanel(this, 4, 34, 156, 186, { title: 'Cooking' });
    this.stageG = this.add.graphics();
    const intro = this.inSession
      ? `Day ${session.state.clock.day}: cook the first cats'\nbowls by hand, or just\nopen the doors.`
      : 'Click a ticket on the rail.';
    this.stageText = pixelText(this, content.x + 2, content.y + 4, intro);
    this.statusText = pixelText(this, content.x + 2, content.y + 134, '', {
      token: 'lanternYellow',
    });
    this.drawRail();
    if (this.inSession) {
      drawTodayPanel(this, this.todayLines);
      createButton(this, NATIVE_WIDTH - 126, NATIVE_HEIGHT - 48, 120, 18, 'Open doors!', () =>
        this.openDoors(),
      );
    }
    pixelText(
      this,
      4,
      NATIVE_HEIGHT - 22,
      'click tickets   SPACE advance   W heat   1-6 toppings',
      {
        token: 'steamWhite',
      },
    );
  }

  private drawRail(): void {
    this.railButtons.forEach((b) => b.container.destroy());
    this.railButtons = [];
    this.tickets.forEach((t, i) => {
      const done = this.completed.has(i);
      const label = done
        ? `Q${this.qualities[i] ?? 0}`
        : `${i + 1}.${RECIPES[t.order.recipeId].name.slice(0, 6)}`;
      const btn = createButton(this, 8 + i * 58, 9, 54, 16, label, () => this.select(i));
      btn.container.setAlpha(i === this.activeIdx ? 1 : done ? 0.5 : 0.85);
      this.railButtons.push(btn);
    });
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
    const heating = this.keys.SPACE.isDown || this.keys.W.isDown;
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
    this.toppingSequence = [];
    drawToppings(this.stageG, this.required.length, 0);
    this.stageText.setText(`Toppings: tap 1..${this.required.length} in order.`);
  }

  private advanceBroth(): void {
    this.stage = 'noodles';
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
    );
    this.qualities[this.activeIdx] = payout.quality;
    if (payout.failed) {
      this.streak = 0;
      this.statusText
        .setText(`Quality ${payout.quality} — FAILED. Combo reset.`)
        .setColor(PALETTE.chiliRed);
    } else {
      this.streak += 1;
      const gain = ticket.order.price + payout.bonusCoins;
      this.coins += gain;
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
      setBrothHeat: (h: number) => {
        this.brothHeat = Phaser.Math.Clamp(h, 0, 1);
        this.sampleBroth();
      },
      /** DEBUG: set the noodle sweep position directly (before/after stop). */
      setNoodleSweep: (s: number) => {
        this.noodleSweep = s % 1;
      },
    };
    (window as unknown as { __nyanService: typeof api }).__nyanService = api;
  }
}
