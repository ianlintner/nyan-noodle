import { createRng } from './rng';
import type { Rng } from './rng';
import type { SimState } from './state';
import { COAT_IDS, createCustomer } from './customers';
import type { CoatId } from './customers';
import { dailyDemand } from './orders';
import { activeSeats, layoutDemandMultiplier } from './layoutRules';
import type { RecipeId } from './recipes';
import { effectiveMenu } from './prep';

/** Length of the service window on the finer "beat" timeline used for presentation. */
export const SERVICE_BEATS = 120;
/** Beats a seat stays unavailable after its guest decides to leave (walk-out buffer). */
export const SEAT_TURNOVER_BEATS = 4;
/** Beats allowed for walking from the queue to the stool before the meal clock runs. */
const WALK_IN_BEATS = 12;
const BEATS_PER_PATIENCE_TICK = 3;
const ARRIVAL_WINDOW = 0.7;
/** Extra customers per Neon Signboard level. */
export const SIGNBOARD_DEMAND = 0.08;

export interface ServiceVisit {
  readonly customerId: number;
  readonly coat: CoatId;
  readonly recipeId: RecipeId;
  /** Beat the cat reaches the shop entrance. */
  readonly arriveBeat: number;
  /** Beat a seat is assigned (null if the cat gave up while queuing). */
  readonly seatBeat: number | null;
  readonly seatIndex: number | null;
  /** Beat the cat stands up and heads out (finished eating, or lost patience). */
  readonly leaveBeat: number;
  readonly outcome: 'served' | 'lost';
}

export interface ServicePlan {
  readonly day: number;
  readonly beats: number;
  readonly seats: number;
  readonly visits: readonly ServiceVisit[];
}

interface Waiting {
  readonly index: number;
  readonly deadline: number;
}

/**
 * Deterministic seat-by-seat timeline of one service window for a sim state.
 * All rules (queueing, patience, seat capacity, dwell time) live here so the
 * render layer only has to play the plan back. Uses its own RNG stream derived
 * from seed+day, so it never perturbs `advanceDay`'s draws.
 */
export function planService(state: SimState, rng?: Rng): ServicePlan {
  const seatCount = activeSeats(state.tierId, state.items).length;
  const r = rng ?? createRng((state.seed * 2654435761 + state.clock.day * 97) >>> 0);
  const demand = dailyDemand(
    layoutDemandMultiplier(state.tierId, state.items) *
      (1 + SIGNBOARD_DEMAND * state.equipment.signboard),
    state.economy.reputation,
    r,
  );
  const menu = effectiveMenu(state);
  const span = Math.floor(SERVICE_BEATS * ARRIVAL_WINDOW);

  const draft = Array.from({ length: demand }, (_, i) => {
    const coat = r.pick(COAT_IDS);
    const recipeId = r.pick(menu);
    const customer = createCustomer(i, coat, { recipeOrder: [recipeId], likedToppings: [] }, 20);
    return {
      customerId: i,
      coat,
      recipeId,
      arriveBeat: Math.floor((i * span) / demand) + r.int(0, 2),
      patienceBeats: customer.patience * BEATS_PER_PATIENCE_TICK,
      dwell: r.int(16, 26),
    };
  });

  const seatFreeAt = Array.from({ length: seatCount }, () => 0);
  const visits: ServiceVisit[] = [];
  const queue: Waiting[] = [];
  let next = 0;
  const lastBeat = SERVICE_BEATS;

  for (let beat = 0; beat <= lastBeat; beat++) {
    while (next < draft.length && draft[next]!.arriveBeat <= beat) {
      queue.push({ index: next, deadline: draft[next]!.arriveBeat + draft[next]!.patienceBeats });
      next += 1;
    }
    // Impatient cats leave the queue (scan so a mid-queue cat can walk out).
    for (let q = queue.length - 1; q >= 0; q--) {
      const w = queue[q]!;
      if (beat >= w.deadline || beat === lastBeat) {
        const d = draft[w.index]!;
        visits.push({
          ...pick(d),
          seatBeat: null,
          seatIndex: null,
          leaveBeat: beat,
          outcome: 'lost',
        });
        queue.splice(q, 1);
      }
    }
    for (let seat = 0; seat < seatFreeAt.length && queue.length > 0; seat++) {
      if (seatFreeAt[seat]! > beat) continue;
      const w = queue.shift()!;
      const d = draft[w.index]!;
      const leaveBeat = beat + WALK_IN_BEATS + d.dwell;
      seatFreeAt[seat] = leaveBeat + SEAT_TURNOVER_BEATS;
      visits.push({ ...pick(d), seatBeat: beat, seatIndex: seat, leaveBeat, outcome: 'served' });
    }
  }
  visits.sort((a, b) => a.arriveBeat - b.arriveBeat || a.customerId - b.customerId);
  return { day: state.clock.day, beats: SERVICE_BEATS, seats: seatCount, visits };
}

function pick(d: {
  customerId: number;
  coat: CoatId;
  recipeId: RecipeId;
  arriveBeat: number;
}): Pick<ServiceVisit, 'customerId' | 'coat' | 'recipeId' | 'arriveBeat'> {
  return {
    customerId: d.customerId,
    coat: d.coat,
    recipeId: d.recipeId,
    arriveBeat: d.arriveBeat,
  };
}
