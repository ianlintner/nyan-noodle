import { createRng } from './rng';
import { generateOrder } from './orders';
import type { Order } from './orders';
import { createCustomer } from './customers';
import type { CoatId } from './customers';
import { FAVOURITE_TOPPING } from './breeds';
import type { BreedId, TraitId } from './breeds';
import { salePrice } from './prep';
import type { ServicePlan } from './service';
import type { SimState } from './state';

/** Bowls the owner cooks by hand (the three minigames) at the start of each service. */
export const CHEF_TICKETS = 3;

export type Doneness = 'soft' | 'firm' | 'default';
export const DONENESS_OPTIONS: readonly Doneness[] = ['soft', 'firm', 'default'];

export interface ChefTicket {
  /** Index of the visit in `plan.visits` this ticket belongs to. */
  readonly visitIndex: number;
  readonly order: Order;
  readonly doneness: Doneness;
  /** Coat of the customer this ticket cooks for (for the rail portrait). */
  readonly coat: CoatId;
  /** Customer name (regulars; seeded for walk-ins). */
  readonly name: string;
  /** Body/personality type. */
  readonly breed: BreedId;
  /** Personality trait this ticket carries. */
  readonly trait: TraitId;
  /** True when the ticket is for a returning regular. */
  readonly isRegular: boolean;
  /** Affection of the regular (0 for walk-ins). */
  readonly affection: number;
  /** Patience budget in beats (for the rail patience indicator). */
  readonly patience: number;
}

/**
 * Today's hand-cooked tickets: the first `max` cats that get a seat. Prices are the day's
 * real sale prices so the ticket rail matches the end-of-day report. Deterministic by
 * seed + day (own RNG stream; does not perturb planService or settleDay).
 */
export function chefTickets(
  state: SimState,
  plan: ServicePlan,
  max: number = CHEF_TICKETS,
): ChefTicket[] {
  const rng = createRng((state.seed * 40503 + plan.day * 7919 + 11) >>> 0);
  const out: ChefTicket[] = [];
  plan.visits.forEach((visit, visitIndex) => {
    if (out.length >= max || visit.outcome !== 'served') return;
    const order = generateOrder(
      out.length,
      createCustomer(
        visit.customerId,
        visit.coat,
        {
          recipeOrder: [visit.recipeId],
          likedToppings: FAVOURITE_TOPPING[visit.trait] ? [FAVOURITE_TOPPING[visit.trait]!] : [],
        },
        20,
        visit.isRegular ? 1 : 0,
        { name: visit.name, breed: visit.breed, trait: visit.trait },
      ),
      state.economy.reputation,
      (recipeId) => salePrice(state, recipeId),
      rng,
    );
    out.push({
      visitIndex,
      order,
      doneness: DONENESS_OPTIONS[rng.int(0, 2)]!,
      coat: visit.coat,
      name: visit.name,
      breed: visit.breed,
      trait: visit.trait,
      isRegular: visit.isRegular,
      affection: visit.affection,
      patience: visit.patienceBeats,
    });
  });
  return out;
}
