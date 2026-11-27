import {
  CHEF_TICKETS,
  COAT_IDS,
  DONENESS_OPTIONS,
  bowlPrice,
  chefTickets,
  createRng,
  createSimState,
  createCustomer,
  randomBreed,
  breedTrait,
  generateOrder,
  generateName,
  planService,
  type BreedId,
  type Doneness,
  type Order,
  type TraitId,
} from '@nyan-noodle/sim';
import type { SimState } from '@nyan-noodle/sim';
import { session } from '../meta/session';

/** A rail ticket: the order plus the render-only coat, persona and patience fields. */
export interface ServiceTicket {
  readonly order: Order;
  readonly doneness: Doneness;
  readonly coat: string;
  /** Customer name (`` for a sandbox walk-in that has no provider). */
  readonly name: string;
  readonly breed: BreedId;
  readonly trait: TraitId;
  readonly isRegular: boolean;
  /** Affection of the regular (0 for walk-ins); shown as a heart meter on the ticket. */
  readonly affection: number;
  readonly patience: number;
}

/**
 * Builds `count` seeded sandbox tickets (`?scene=service&seed=...`) from a fresh sim
 * state. Pure: no session or scene access, so it lives outside the scene class.
 */
export function seededServiceTickets(seed: number, count: number): ServiceTicket[] {
  const state: SimState = createSimState(seed, 'cart');
  const rng = createRng((seed * 31 + 7) >>> 0);
  const tickets: ServiceTicket[] = [];
  for (let i = 0; i < count; i++) {
    const coat = COAT_IDS[i % COAT_IDS.length]!;
    const recipeId = state.unlockedRecipes[rng.int(0, state.unlockedRecipes.length - 1)]!;
    const breed = randomBreed(rng);
    const trait = breedTrait(breed);
    const name = generateName(rng);
    const isRegular = i === 0;
    const cat = createCustomer(
      i,
      coat,
      { recipeOrder: [recipeId], likedToppings: [] },
      20 + (i % 3) * 4,
      0,
      { name, breed, trait },
    );
    const order = generateOrder(i, cat, state.economy.reputation, bowlPrice, rng);
    tickets.push({
      order,
      doneness: DONENESS_OPTIONS[rng.int(0, 2)]!,
      coat,
      name,
      breed,
      trait,
      isRegular,
      // Sandbox only: the first ticket stands in for a returning regular so the
      // ticket rail's name → trait → ♥ affection meter is visible for screenshots.
      affection: isRegular ? 4 : 0,
      // Match the session path's patience units (beats = patience * 3), so the rail
      // patience bar is on the same 50–80 scale as `chefTickets`/`visit.patienceBeats`.
      patience: order.patienceRemaining * 3,
    });
  }
  return tickets;
}

/**
 * Build the rail for the current day (session) or its seeded sandbox. Kept out of
 * the scene so the 400-line ceiling leaves room for the touch UI wiring.
 */
export function serviceRail(
  inSession: boolean,
  seed: number,
  count: number,
): { tickets: ServiceTicket[]; todayLines: string[] } {
  if (!inSession) return { tickets: seededServiceTickets(seed, count), todayLines: [] };
  const state = session.state;
  const plan = planService(state);
  const tickets: ServiceTicket[] = chefTickets(state, plan, CHEF_TICKETS).map((t) => ({
    order: t.order,
    doneness: t.doneness,
    coat: t.coat,
    name: t.name,
    breed: t.breed,
    trait: t.trait,
    isRegular: t.isRegular,
    affection: t.affection,
    patience: t.patience,
  }));
  const coming = plan.visits.filter((v) => v.outcome === 'served').length;
  return {
    tickets,
    todayLines: [
      `${coming} cats will get a seat (${plan.seats} seats)`,
      `Stock: ${state.stock} bowls`,
      `Hand-cook up to ${tickets.length} bowls first.`,
      'Better bowls = bigger tips + more stars.',
      'Skipped tickets cook at your usual quality.',
    ],
  };
}
