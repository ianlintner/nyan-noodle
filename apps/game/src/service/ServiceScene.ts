import Phaser from 'phaser';
import {
  RECIPES,
  bowlPrice,
  createRng,
  createSimState,
  generateOrder,
  settleBowl,
  type CookMeasurements,
  type Order,
  type ToppingId,
} from '@nyan-noodle/sim';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { PALETTE, color } from '../theme/palette';
import { createButton, drawPanel, pixelText, type ButtonHandle } from '../theme/hud';
import { emptyBrothHold, requiredToppings, sampleBroth, toMeasurements } from './measure';

export const SERVICE_SCENE_KEY = 'ServiceScene';

/** The three cooking minigames, run in order for each selected ticket. */
type Stage = 'broth' | 'noodles' | 'toppings' | 'serve';
type Doneness = 'soft' | 'firm' | 'default';

const BROTH_LO = 0.4;
const BROTH_HI = 0.8;
const BROTH_SAMPLES = 60;
const NOODLE_TARGETS: Record<Doneness, number> = { soft: 0.55, firm: 0.7, default: 0.62 };
const RUSH_THRESHOLD_BEATS = 30;
const DONENESS_OPTIONS: readonly Doneness[] = ['soft', 'firm', 'default'];

/** Cooking-panel geometry, shared by all three minigame renderers. */
const STAGE_BAR = { x: 10, y: 78, w: 140, h: 14 };

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
 */
export class ServiceScene extends Phaser.Scene {
  private params: ServiceParams = { seed: 2026, count: 4 };
  private tickets: Ticket[] = [];
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

  private railGraphics!: Phaser.GameObjects.Graphics;
  private railButtons: ButtonHandle[] = [];
  private stageG!: Phaser.GameObjects.Graphics;
  private stageText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private keys!: {
    SPACE: Phaser.Input.Keyboard.Key;
    W: Phaser.Input.Keyboard.Key;
    ONE: Phaser.Input.Keyboard.Key;
    TWO: Phaser.Input.Keyboard.Key;
    THREE: Phaser.Input.Keyboard.Key;
    FOUR: Phaser.Input.Keyboard.Key;
    FIVE: Phaser.Input.Keyboard.Key;
    SIX: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super(SERVICE_SCENE_KEY);
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
  }

  // --- setup ---------------------------------------------------------------

  private buildTickets(): void {
    const state = createSimState(this.params.seed, 'cart');
    const rng = createRng((this.params.seed * 31 + 7) >>> 0);
    for (let i = 0; i < this.params.count; i++) {
      const recipeId = state.unlockedRecipes[rng.int(0, state.unlockedRecipes.length - 1)]!;
      const order = generateOrder(
        i,
        {
          id: i,
          coat: 'tabby',
          patience: 0,
          preferences: { recipeOrder: [recipeId], likedToppings: [] },
          isRegular: false,
          visits: 0,
        },
        state.economy.reputation,
        bowlPrice,
        rng,
      );
      this.tickets.push({ order, doneness: DONENESS_OPTIONS[rng.int(0, 2)]! });
    }
  }

  private buildUi(): void {
    drawPanel(this, 4, 4, NATIVE_WIDTH - 8, 26, { title: 'Ticket rail' });
    this.railGraphics = this.add.graphics();

    const { content } = drawPanel(this, 4, 34, 156, 186, { title: 'Cooking' });
    this.stageG = this.add.graphics();
    this.stageText = pixelText(this, content.x + 2, content.y + 4, 'Click a ticket on the rail.');
    this.statusText = pixelText(this, content.x + 2, content.y + 150, '', {
      token: 'lanternYellow',
    });
    this.drawRail();

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
    this.railGraphics.clear();
    this.railButtons.forEach((b) => b.container.destroy());
    this.railButtons = [];
    this.tickets.forEach((t, i) => {
      const x = 8 + i * 58;
      const y = 9;
      const label = this.completed.has(i)
        ? 'done'
        : `${i + 1}.${RECIPES[t.order.recipeId].name.slice(0, 6)}`;
      const btn = createButton(this, x, y, 54, 16, label, () => this.select(i));
      if (i === this.activeIdx) btn.container.setAlpha(1);
      else btn.container.setAlpha(this.completed.has(i) ? 0.5 : 0.85);
      this.railButtons.push(btn);
    });
  }

  // --- ticket selection & stage machine ------------------------------------

  private select(i: number): void {
    if (i < 0 || i >= this.tickets.length) return;
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
  }

  // --- per-frame update ----------------------------------------------------

  override update(_time: number, deltaMs: number): void {
    if (this.activeIdx < 0) return;
    this.beats += deltaMs / 250;
    for (const key of [
      [Phaser.Input.Keyboard.JustDown(this.keys.ONE), 0],
      [Phaser.Input.Keyboard.JustDown(this.keys.TWO), 1],
      [Phaser.Input.Keyboard.JustDown(this.keys.THREE), 2],
      [Phaser.Input.Keyboard.JustDown(this.keys.FOUR), 3],
      [Phaser.Input.Keyboard.JustDown(this.keys.FIVE), 4],
      [Phaser.Input.Keyboard.JustDown(this.keys.SIX), 5],
    ] as const) {
      if (key[0]) this.addToppingByIndex(key[1]);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
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
    this.brothHold = sampleBroth(this.brothHold, this.brothHeat, BROTH_LO, BROTH_HI);
    if (this.brothHold.samples >= BROTH_SAMPLES) this.advanceBroth();
    this.drawBroth();
  }

  private updateNoodles(deltaMs: number): void {
    if (!this.noodleStopped) this.noodleSweep = (this.noodleSweep + deltaMs / 1000 / 2.4) % 1;
    this.drawNoodles();
  }

  // --- input handlers (mouse + keyboard + e2e share these) -----------------

  private addToppingByIndex(index: number): void {
    if (index < 0 || index >= this.required.length) return;
    this.addTopping(this.required[index]!);
  }

  addTopping(id: ToppingId): void {
    if (this.stage !== 'toppings') return;
    this.toppingSequence = [...this.toppingSequence, id];
    this.drawToppings();
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
    this.drawToppings();
  }

  private advanceBroth(): void {
    this.stage = 'noodles';
    this.noodleSweep = 0;
    this.noodleStopped = false;
    this.stageText.setText('Noodles: press SPACE when the\nbar hits the thick band.');
    this.drawNoodles();
  }

  serve(): void {
    const ticket = this.tickets[this.activeIdx];
    if (!ticket || (this.stage !== 'serve' && this.toppingSequence.length < this.required.length)) {
      return;
    }
    const measurements = this.metrics();
    const payout = settleBowl(
      ticket.order.recipeId,
      ticket.order.extraToppings,
      ticket.order.price,
      measurements,
      this.streak,
      Math.floor(this.beats),
      RUSH_THRESHOLD_BEATS,
    );
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
    this.stageText.setText(`Quality ${payout.quality}/100. Pick another ticket.`);
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

  // --- drawing -------------------------------------------------------------

  private drawBroth(): void {
    const { x, y, w, h } = STAGE_BAR;
    this.stageG.clear();
    this.stageG.fillStyle(color('noriGreen'), 1);
    this.stageG.fillRect(x + w * BROTH_LO, y, w * (BROTH_HI - BROTH_LO), h);
    this.stageG.fillStyle(color('chiliRed'), 1);
    this.stageG.fillRect(x + w * this.brothHeat - 1, y - 3, 2, h + 6);
    this.stageG.lineStyle(1, color('steamWhite'), 0.4);
    this.stageG.strokeRect(x, y - 1, w, h + 2);
    this.stageG.fillStyle(color('cream'), 1);
    this.stageG.fillRect(x, y + h + 3, w * (this.brothHold.samples / BROTH_SAMPLES), 3);
  }

  private drawNoodles(): void {
    const { x, y, w, h } = STAGE_BAR;
    const target = NOODLE_TARGETS[this.tickets[this.activeIdx]!.doneness];
    this.stageG.clear();
    this.stageG.fillStyle(color('noriGreen'), 1);
    this.stageG.fillRect(x + w * (target - 0.08), y, w * 0.16, h);
    this.stageG.fillStyle(color('brothGold'), 1);
    this.stageG.fillRect(x + w * this.noodleSweep - 1, y - 3, 2, h + 6);
    this.stageG.lineStyle(1, color('steamWhite'), 0.4);
    this.stageG.strokeRect(x, y - 1, w, h + 2);
  }

  private drawToppings(): void {
    const { x, w } = STAGE_BAR;
    this.stageG.clear();
    this.required.forEach((_t, i) => {
      const cx = x + 6 + i * ((w - 12) / Math.max(1, this.required.length - 1));
      const done = this.toppingSequence.length > i;
      this.stageG.fillStyle(color(done ? 'noriGreen' : 'slate'), 1);
      this.stageG.fillRect(cx, STAGE_BAR.y + 4, 8, 8);
    });
    this.stageText.setText(`Toppings: tap 1..${this.required.length} in order.`);
  }

  private exposeDebugApi(): void {
    const api = {
      stage: () => this.stage,
      activeIdx: () => this.activeIdx,
      streak: () => this.streak,
      coins: () => this.coins,
      completed: () => [...this.completed],
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
      /** DEBUG: drive the broth needle directly, one sample per call. */
      setBrothHeat: (h: number) => {
        this.brothHeat = Phaser.Math.Clamp(h, 0, 1);
        this.brothHold = sampleBroth(this.brothHold, this.brothHeat, BROTH_LO, BROTH_HI);
        if (this.brothHold.samples >= BROTH_SAMPLES) this.advanceBroth();
      },
      /** DEBUG: set the noodle sweep position directly (before/after stop). */
      setNoodleSweep: (s: number) => {
        this.noodleSweep = s % 1;
      },
    };
    (window as unknown as { __nyanService: typeof api }).__nyanService = api;
  }
}
