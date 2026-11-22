import type Phaser from 'phaser';
import type { ServicePlan, ServiceVisit } from '@nyan-noodle/sim';
import { TILE_SIZE } from '../config';
import { ATLAS_KEY, CatActor, cellCenterX, cellFeetY } from './CatActor';
import type { Accessory, CoatFrame } from './CatActor';
import type { Cell, ShopLayout } from './layout';
import { findPath } from './pathfinding';

export type CustomerPhase = 'arriving' | 'queued' | 'toSeat' | 'seated' | 'leaving' | 'gone';

export type ShopEventType = 'spawn' | 'queue' | 'enter' | 'sit' | 'leave' | 'gone';
export interface ShopEvent {
  readonly beat: number;
  readonly customerId: number;
  readonly type: ShopEventType;
}

interface Runtime {
  readonly visit: ServiceVisit;
  readonly actor: CatActor;
  phase: CustomerPhase;
  slot: number;
  entered: boolean;
  bowl: Phaser.GameObjects.Image | null;
}

/** Sim coats beyond the atlas get a base coat plus a bow overlay. */
function appearance(visit: ServiceVisit): { coat: CoatFrame; accessory: Accessory | null } {
  if (visit.coat === 'sakura') return { coat: 'white', accessory: 'bow' };
  return { coat: visit.coat, accessory: visit.customerId % 3 === 0 ? 'scarf' : null };
}

/**
 * Plays a sim `ServicePlan` back as cat movement. Holds no rules: arrival,
 * seat, patience and leave decisions all come from the plan's beats.
 */
export class ShopDirector {
  readonly events: ShopEvent[] = [];
  private readonly runtimes = new Map<number, Runtime>();
  private pending: ServiceVisit[];
  private now = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: ShopLayout,
    plan: ServicePlan,
    private readonly register: (o: Phaser.GameObjects.GameObject) => void,
  ) {
    this.pending = [...plan.visits];
  }

  get done(): boolean {
    return (
      this.pending.length === 0 && [...this.runtimes.values()].every((r) => r.phase === 'gone')
    );
  }

  counts(): { present: number; queued: number; seated: number; served: number; lost: number } {
    let queued = 0;
    let seated = 0;
    let present = 0;
    for (const r of this.runtimes.values()) {
      if (r.phase === 'gone') continue;
      present += 1;
      if (r.phase === 'queued' || r.phase === 'arriving') queued += 1;
      if (r.phase === 'seated') seated += 1;
    }
    const gone = [...this.runtimes.values()].filter((r) => r.phase === 'gone');
    return {
      present,
      queued,
      seated,
      served: gone.filter((r) => r.visit.outcome === 'served').length,
      lost: gone.filter((r) => r.visit.outcome === 'lost').length,
    };
  }

  /** Seated cats whose draw depth is not above their stool's (debug/e2e check). */
  sortViolations(): number {
    let bad = 0;
    for (const r of this.runtimes.values()) {
      if (r.phase !== 'seated') continue;
      const seat = this.layout.seats[r.visit.seatIndex!]!;
      if (r.actor.sprite.depth <= (seat.ty + 1) * TILE_SIZE + 0.3) bad += 1;
    }
    return bad;
  }

  snapshot(): { id: number; phase: CustomerPhase; x: number; y: number; seat: number | null }[] {
    return [...this.runtimes.values()]
      .filter((r) => r.phase !== 'gone')
      .map((r) => ({
        id: r.visit.customerId,
        phase: r.phase,
        x: r.actor.x,
        y: r.actor.y,
        seat: r.visit.seatIndex,
      }));
  }

  /** Remove every cat and bowl (leaving the shop for build mode). */
  destroy(): void {
    for (const r of this.runtimes.values()) {
      r.bowl?.destroy();
      if (r.phase !== 'gone') r.actor.destroy();
    }
    this.runtimes.clear();
    this.pending = [];
  }

  update(beat: number, deltaMs: number, speed: number): void {
    this.now = beat;
    while (this.pending.length > 0 && this.pending[0]!.arriveBeat <= beat) {
      this.spawn(this.pending.shift()!, beat, speed);
    }
    this.assignQueueSlots();
    for (const r of this.runtimes.values()) {
      if (r.phase === 'gone') continue;
      r.actor.speedScale = speed;
      r.actor.update(deltaMs);
      this.advance(r, beat);
    }
  }

  private spawn(visit: ServiceVisit, beat: number, speed: number): void {
    const { coat, accessory } = appearance(visit);
    const from = this.layout.spawns[visit.customerId % 2]!;
    const actor = new CatActor(this.scene, coat, accessory, from, this.register);
    actor.speedScale = speed;
    this.runtimes.set(visit.customerId, {
      visit,
      actor,
      phase: 'arriving',
      slot: -1,
      entered: false,
      bowl: null,
    });
    this.log(beat, visit.customerId, 'spawn');
  }

  private waiting(): Runtime[] {
    return [...this.runtimes.values()]
      .filter((r) => r.phase === 'arriving' || r.phase === 'queued')
      .sort(
        (a, b) =>
          a.visit.arriveBeat - b.visit.arriveBeat || a.visit.customerId - b.visit.customerId,
      );
  }

  /** Queue order is arrival order; each waiter walks to its slot outside the door. */
  private assignQueueSlots(): void {
    const spots = this.layout.queue;
    this.waiting().forEach((r, i) => {
      const slot = Math.min(i, spots.length - 1);
      if (slot === r.slot) return;
      r.slot = slot;
      this.send(r, spots[slot]!, () => {
        if (r.phase === 'arriving') r.phase = 'queued';
        r.actor.face('up');
      });
    });
  }

  private send(r: Runtime, goal: Cell, done?: () => void): void {
    const path = findPath(this.layout.blocked, r.actor.cell, goal);
    if (path) r.actor.walkTo(path, done);
  }

  private advance(r: Runtime, beat: number): void {
    const { visit, actor } = r;
    if (r.phase === 'arriving' || r.phase === 'queued') {
      if (visit.seatBeat !== null && beat >= visit.seatBeat) {
        const seat = this.layout.seats[visit.seatIndex!]!;
        r.phase = 'toSeat';
        r.slot = -1;
        this.send(r, seat, () => {
          actor.sit(seat, seat.face);
          r.phase = 'seated';
          this.log(this.now, visit.customerId, 'sit');
        });
      } else if (visit.seatBeat === null && beat >= visit.leaveBeat) {
        this.leave(r, beat);
      }
    } else if (r.phase === 'toSeat') {
      if (!r.entered && actor.cell.ty <= this.layout.door.ty) {
        r.entered = true;
        this.log(beat, visit.customerId, 'enter');
      }
    } else if (r.phase === 'seated') {
      if (!r.bowl && beat >= visit.seatBeat! + 14) this.serveBowl(r);
      if (beat >= visit.leaveBeat) this.leave(r, beat);
    }
  }

  private serveBowl(r: Runtime): void {
    const seat = this.layout.seats[r.visit.seatIndex!]!;
    const ahead =
      seat.face === 'up'
        ? { tx: seat.tx, ty: seat.ty - 1 }
        : { tx: seat.tx + (seat.face === 'right' ? 1 : -1), ty: seat.ty };
    const bowl = this.scene.add
      .image(
        cellCenterX(ahead.tx),
        cellFeetY(ahead.ty) - 8,
        ATLAS_KEY,
        `food/bowl_${r.visit.recipeId}`,
      )
      .setOrigin(0.5, 1)
      .setDepth(cellFeetY(seat.ty) + 4);
    this.register(bowl);
    r.bowl = bowl;
  }

  private leave(r: Runtime, beat: number): void {
    r.phase = 'leaving';
    r.bowl?.destroy();
    r.bowl = null;
    this.log(beat, r.visit.customerId, 'leave');
    const exit = this.layout.spawns[r.visit.customerId % 2]!;
    const path = findPath(this.layout.blocked, r.actor.cell, exit);
    const finish = (): void => {
      r.phase = 'gone';
      r.actor.destroy();
      this.log(this.now, r.visit.customerId, 'gone');
    };
    if (path) r.actor.walkTo(path, finish);
    else finish();
  }

  private log(beat: number, customerId: number, type: ShopEventType): void {
    this.events.push({ beat: Math.floor(beat), customerId, type });
  }
}
