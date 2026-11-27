import type Phaser from 'phaser';
import {
  NO_GREETS,
  greetBudget,
  spendGreet,
  type GreetLedger,
  type ServicePlan,
  type ShopTierId,
} from '@nyan-noodle/sim';
import { TILE_SIZE } from '../config';
import { isTouchDevice, FONT_FAMILY } from '../theme/hud';
import { cellCenterX, cellFeetY } from './CatActor';
import type { ShopDirector } from './director';
import type { ShopLayout } from './layout';
import { worldScreenPoint } from './screen';

/** Beats a coin pop stays tappable after its cat leaves the stool. */
export const POP_BEATS = 16;
const CAT_W = 16;
const CAT_H = 22;
const POP_SIZE = 14;
/** A press that moved further than this was a camera drag, not a tap. */
const TAP_SLOP = 5;

export interface InteractBindings {
  scene: Phaser.Scene;
  layout: ShopLayout;
  tier: ShopTierId;
  director: ShopDirector;
  beat(): number;
  /** Replan with the greet ledger; returns the new plan. */
  replan(byCat: ReadonlyMap<number, number>): ServicePlan;
  /** Customer ids whose visit really earns a tip (coin pops spawn only for these). */
  eligible: ReadonlySet<number>;
  overUi(x: number, y: number): boolean;
  register(o: Phaser.GameObjects.GameObject): void;
}

interface Pop {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly until: number;
  readonly sprite: Phaser.GameObjects.Container;
}

/**
 * Active service: tap a waiting cat to greet it (extra patience, limited per day) and tap
 * a coin pop over a seat to collect its tip bonus. Rules live in the sim; this only maps
 * pointer taps to `spendGreet` / the collected-id list and draws the feedback.
 */
export class ShopInteraction {
  private ledger: GreetLedger = NO_GREETS;
  private plan: ServicePlan;
  readonly collected = new Set<number>();
  private readonly pops: Pop[] = [];
  private readonly bars: Phaser.GameObjects.Graphics;
  private seenEvents = 0;
  private down: { id: number; x: number; y: number } | null = null;
  /** Pointers currently held; a second one means a pinch, never a tap. */
  private readonly held = new Set<number>();
  private readonly onDown = (p: Phaser.Input.Pointer): void => {
    this.held.add(p.id);
    this.down = this.held.size === 1 ? { id: p.id, x: p.x, y: p.y } : null;
  };
  private readonly onOutside = (p: Phaser.Input.Pointer): void => {
    this.held.delete(p.id);
    if (this.down?.id === p.id) this.down = null;
  };
  private readonly onUp = (p: Phaser.Input.Pointer): void => {
    this.held.delete(p.id);
    const d = this.down;
    if (!d || d.id !== p.id) return;
    this.down = null;
    if (Math.hypot(p.x - d.x, p.y - d.y) > TAP_SLOP) return;
    if (this.b.overUi(p.x, p.y)) return;
    const w = this.b.scene.cameras.main.getWorldPoint(p.x, p.y);
    this.tap(w.x, w.y);
  };

  constructor(private readonly b: InteractBindings) {
    // The no-greet replan is the baseline plan the director is already playing.
    this.plan = b.replan(NO_GREETS.byCat);
    this.bars = b.scene.add.graphics().setDepth(9000);
    b.register(this.bars);
    b.scene.input.on('pointerdown', this.onDown);
    b.scene.input.on('pointerup', this.onUp);
    b.scene.input.on('pointerupoutside', this.onOutside);
  }

  get ids(): number[] {
    return [...this.collected];
  }

  get greetsLeft(): number {
    return greetBudget(this.b.tier) - this.ledger.spent;
  }

  hudLine(): string {
    return `Greets ${this.greetsLeft}/${greetBudget(this.b.tier)}  Tips +${this.collected.size}`;
  }

  /** Waiting cats and open pops (page-space centres) plus tallies, for e2e/debug targeting. */
  debug(): {
    cats: { id: number; x: number; y: number; patience: number }[];
    pops: { id: number; x: number; y: number }[];
    collected: number[];
    greetsLeft: number;
  } {
    const toPage = (wx: number, wy: number): { x: number; y: number } =>
      worldScreenPoint(this.b.scene, wx, wy);
    return {
      collected: [...this.collected],
      greetsLeft: this.greetsLeft,
      cats: this.waitingCats().map((c) => ({
        id: c.id,
        ...toPage(c.x, c.y - CAT_H / 2),
        patience: this.visitOf(c.id)?.patienceBeats ?? 0,
      })),
      pops: this.pops.map((p) => ({ id: p.id, ...toPage(p.x, p.y) })),
    };
  }

  update(): void {
    const beat = this.b.beat();
    const events = this.b.director.events;
    for (; this.seenEvents < events.length; this.seenEvents++) {
      const e = events[this.seenEvents]!;
      const v = e.type === 'leave' ? this.visitOf(e.customerId) : undefined;
      if (v && v.outcome === 'served' && v.seatIndex !== null && this.b.eligible.has(v.customerId))
        this.spawnPop(v.customerId, v.seatIndex);
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i]!;
      if (beat < p.until) {
        p.sprite.y = p.y - Math.sin(beat * 0.8) * 1.5;
        continue;
      }
      p.sprite.destroy();
      this.pops.splice(i, 1);
    }
    this.drawBars(beat);
  }

  destroy(): void {
    this.b.scene.input.off('pointerdown', this.onDown);
    this.b.scene.input.off('pointerup', this.onUp);
    this.b.scene.input.off('pointerupoutside', this.onOutside);
    this.bars.destroy();
    for (const p of this.pops) p.sprite.destroy();
    this.pops.length = 0;
  }

  // ---- internals -------------------------------------------------------------

  private visitOf(id: number): ServicePlan['visits'][number] | undefined {
    return this.plan.visits.find((v) => v.customerId === id);
  }

  private waitingCats(): { id: number; x: number; y: number }[] {
    return this.b.director
      .snapshot()
      .filter((c) => c.phase === 'arriving' || c.phase === 'queued')
      .map((c) => ({ id: c.id, x: c.x, y: c.y }));
  }

  private tap(wx: number, wy: number): void {
    const pad = isTouchDevice() ? 4 : 0;
    // Coin pops sit above the cats, so they win a tie.
    const pop = this.pops.find(
      (p) => Math.abs(wx - p.x) <= POP_SIZE / 2 + pad && Math.abs(wy - p.y) <= POP_SIZE / 2 + pad,
    );
    if (pop) return this.collect(pop);
    const cat = this.waitingCats().find(
      (c) => Math.abs(wx - c.x) <= CAT_W / 2 + pad && wy <= c.y + pad && wy >= c.y - CAT_H - pad,
    );
    if (cat) this.greet(cat.id, cat.x, cat.y - CAT_H);
  }

  private greet(id: number, x: number, y: number): void {
    const next = spendGreet(this.ledger, this.b.tier, id);
    if (!next)
      return this.floater(x, y, this.greetsLeft <= 0 ? 'No greets left' : 'Happy!', '#9aa0a6');
    this.ledger = next;
    this.plan = this.b.replan(next.byCat);
    this.b.director.setPlan(this.plan);
    this.floater(x, y, '♥ Welcome!', '#ff7aa8');
  }

  private collect(pop: Pop): void {
    this.collected.add(pop.id);
    this.floater(pop.x, pop.y - 8, `+tip x${this.collected.size}`, '#ffd24a');
    pop.sprite.destroy();
    this.pops.splice(this.pops.indexOf(pop), 1);
  }

  private spawnPop(id: number, seatIndex: number): void {
    const seat = this.b.layout.seats[seatIndex]!;
    const x = cellCenterX(seat.tx);
    const y = cellFeetY(seat.ty) - TILE_SIZE * 1.4;
    const g = this.b.scene.add.graphics();
    g.fillStyle(0x6b4a00, 1).fillCircle(0, 1, 6);
    g.fillStyle(0xffd24a, 1).fillCircle(0, 0, 5.5);
    g.fillStyle(0xfff0a0, 1).fillCircle(-1.5, -1.5, 2);
    const c = this.b.scene.add.container(x, y, [g]).setDepth(9500);
    this.b.register(c);
    this.pops.push({ id, x, y, until: this.b.beat() + POP_BEATS, sprite: c });
  }

  private drawBars(beat: number): void {
    this.bars.clear();
    for (const c of this.waitingCats()) {
      const v = this.visitOf(c.id);
      if (!v || v.patienceBeats <= 0) continue;
      const frac = Math.max(
        0,
        Math.min(1, (v.arriveBeat + v.patienceBeats - beat) / v.patienceBeats),
      );
      const x = Math.round(c.x) - 8;
      const y = Math.round(c.y) - CAT_H - 3;
      this.bars.fillStyle(0x2b1d2e, 1).fillRect(x, y, 16, 3);
      const color = frac > 0.5 ? 0x6bd36b : frac > 0.25 ? 0xffd24a : 0xe5533d;
      this.bars.fillStyle(color, 1).fillRect(x + 1, y + 1, Math.round(14 * frac), 1);
    }
  }

  private floater(x: number, y: number, text: string, color: string): void {
    const t = this.b.scene.add
      .text(x, y, text, {
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        fontSize: '8px',
        color,
        stroke: '#2b1d2e',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(9800);
    this.b.register(t);
    this.b.scene.tweens.add({
      targets: t,
      y: y - 14,
      alpha: 0,
      duration: 900,
      onComplete: () => t.destroy(),
    });
  }
}
