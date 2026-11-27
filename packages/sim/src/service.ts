import { createRng } from './rng';
import type { Rng } from './rng';
import type { SimState } from './state';
import { COAT_IDS, createCustomer } from './customers';
import type { CoatId } from './customers';
import { randomBreed, breedTrait, type BreedId, type TraitId } from './breeds';
import { FAVOURITE_TOPPING, traitArrivalOffset } from './breeds';
import { generateName, whoReturns, regularPerks, MAX_WORD_OF_MOUTH } from './regulars';
import type { Regular } from './regulars';
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
  /** Customer name (walk-ins also get a seeded name so they can become regulars). */
  readonly name: string;
  /** Body/personality type. */
  readonly breed: BreedId;
  /** Personality trait this visit carries. */
  readonly trait: TraitId;
  /** True when this visit is a returning regular. */
  readonly isRegular: boolean;
  /** Persistent regular id (null for a first-time walk-in). */
  readonly regularId: number | null;
  /** Affection of the returning regular (0 for walk-ins). */
  readonly affection: number;
  /** Beat the cat reaches the shop entrance. */
  readonly arriveBeat: number;
  /** Beat a seat is assigned (null if the cat gave up while queuing). */
  readonly seatBeat: number | null;
  readonly seatIndex: number | null;
  /** Total patience budget in beats (0 when unavailable / sandbox). */
  readonly patienceBeats: number;
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

interface DraftVisit {
  customerId: number;
  coat: CoatId;
  recipeId: RecipeId;
  name: string;
  breed: BreedId;
  trait: TraitId;
  isRegular: boolean;
  regularId: number | null;
  affection: number;
  arriveBeat: number;
  patienceBeats: number;
  dwell: number;
}

/** A stack of persona fields (name/breed/trait/regular) carried by every visit. */
interface Persona {
  name: string;
  breed: BreedId;
  trait: TraitId;
  isRegular: boolean;
  affection: number;
}

/**
 * Deterministic seat-by-seat timeline of one service window for a sim state.
 * All rules (queueing, patience, seat capacity, dwell time) live here so the
 * render layer only has to play the plan back. Uses its own RNG stream derived
 * from seed+day, so it never perturbs `advanceDay`'s draws. A second persona
 * stream assigns breeds/traits/names and picks returning regulars, also seeded,
 * so the demand/coat/menu draws (and thus the balance curve) stay byte-identical.
 */
export function planService(state: SimState, rng?: Rng): ServicePlan {
  const seatCount = activeSeats(state.tierId, state.items).length;
  const r = rng ?? createRng((state.seed * 2654435761 + state.clock.day * 97) >>> 0);
  const personRng = createRng((state.seed * 2246822519 + state.clock.day * 31 + 5) >>> 0);
  // Devoted regulars pull a little extra footfall into the shop, capped so a large
  // roster cannot inflate demand without bound.
  const wordOfMouth = Math.min(
    state.regulars.reduce((sum, reg) => sum + regularPerks(reg).wordOfMouth, 0),
    MAX_WORD_OF_MOUTH,
  );
  const demand =
    dailyDemand(
      layoutDemandMultiplier(state.tierId, state.items) *
        (1 + SIGNBOARD_DEMAND * state.equipment.signboard),
      state.economy.reputation,
      r,
    ) + wordOfMouth;
  const menu = effectiveMenu(state);
  const span = Math.floor(SERVICE_BEATS * ARRIVAL_WINDOW);

  // Returning regulars fill the earliest slots (each keeps its coat + favourite dish).
  const { returning } = whoReturns(state.regulars, menu, personRng);
  const regulars = new Map<number, { regular: Regular; recipeId: RecipeId }>();
  returning.forEach((entry, slot) => regulars.set(slot, entry));

  const draft: DraftVisit[] = Array.from({ length: demand }, (_, i) => {
    const coat = r.pick(COAT_IDS);
    const recipeId = r.pick(menu);
    const returningEntry = regulars.get(i);
    // A regular keeps its own coat and orders its favourite; walk-ins get a random
    // breed whose trait is pure flavour (its numeric economy effects below are
    // gated to regulars), so the balance curve stays identical to baseline.
    const walkBreed = randomBreed(personRng);
    const persona: Persona = returningEntry
      ? {
          name: returningEntry.regular.name,
          breed: returningEntry.regular.breed,
          trait: returningEntry.regular.trait,
          isRegular: true,
          affection: returningEntry.regular.affection,
        }
      : {
          name: generateName(personRng),
          breed: walkBreed,
          trait: breedTrait(walkBreed),
          isRegular: false,
          affection: 0,
        };
    // A trait's favourite topping becomes a "liked" topping, which makes the rail's
    // extras picker offer it more often (feeds order generation without touching the
    // headless settleDay revenue, which prices on the recipe alone).
    const likedToppings = FAVOURITE_TOPPING[persona.trait]
      ? [FAVOURITE_TOPPING[persona.trait]!]
      : [];
    const customer = createCustomer(
      i,
      returningEntry ? returningEntry.regular.coat : coat,
      { recipeOrder: [recipeId], likedToppings },
      20,
      returningEntry ? returningEntry.regular.visits : 0,
      { name: persona.name, breed: persona.breed, trait: persona.trait },
    );
    return {
      customerId: i,
      coat: returningEntry ? returningEntry.regular.coat : coat,
      recipeId: returningEntry ? returningEntry.recipeId : recipeId,
      name: persona.name,
      breed: persona.breed,
      trait: persona.trait,
      isRegular: persona.isRegular,
      regularId: returningEntry ? returningEntry.regular.id : null,
      affection: persona.affection,
      // Night-owls (and any late-arrival trait) slide into the back of the window.
      arriveBeat:
        Math.floor((i * span) / demand) +
        r.int(0, 2) +
        Math.round(span * traitArrivalOffset(persona.trait)),
      patienceBeats: customer.patience * BEATS_PER_PATIENCE_TICK,
      dwell: r.int(16, 26),
    };
  });

  const seatFreeAt = Array.from({ length: seatCount }, () => 0);
  const visits: ServiceVisit[] = [];
  const queue: Waiting[] = [];
  let next = 0;
  const lastBeat = SERVICE_BEATS;

  // Night-owl arrivals (and the 0..2 beat jitter) can push a later index ahead of an
  // earlier one, so sort the draft by arrival time before seating; otherwise a late
  // night-owl at a low index blocks earlier arrivals behind it in the index order.
  draft.sort((a, b) => a.arriveBeat - b.arriveBeat || a.customerId - b.customerId);

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
          patienceBeats: d.patienceBeats,
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
      visits.push({
        ...pick(d),
        seatBeat: beat,
        seatIndex: seat,
        patienceBeats: d.patienceBeats,
        leaveBeat,
        outcome: 'served',
      });
    }
  }
  visits.sort((a, b) => a.arriveBeat - b.arriveBeat || a.customerId - b.customerId);
  return { day: state.clock.day, beats: SERVICE_BEATS, seats: seatCount, visits };
}

function pick(
  d: DraftVisit,
): Pick<
  ServiceVisit,
  | 'customerId'
  | 'coat'
  | 'recipeId'
  | 'name'
  | 'breed'
  | 'trait'
  | 'isRegular'
  | 'regularId'
  | 'affection'
  | 'arriveBeat'
> {
  return {
    customerId: d.customerId,
    coat: d.coat,
    recipeId: d.recipeId,
    name: d.name,
    breed: d.breed,
    trait: d.trait,
    isRegular: d.isRegular,
    regularId: d.regularId,
    affection: d.affection,
    arriveBeat: d.arriveBeat,
  };
}
