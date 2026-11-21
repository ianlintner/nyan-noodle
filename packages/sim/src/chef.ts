import { createRng } from './rng';
import { generateOrder } from './orders';
import type { Order } from './orders';
import type { CoatId } from './customers';
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
      {
        id: visit.customerId,
        coat: visit.coat,
        patience: 0,
        preferences: { recipeOrder: [visit.recipeId], likedToppings: [] },
        isRegular: false,
        visits: 0,
      },
      state.economy.reputation,
      (recipeId) => salePrice(state, recipeId),
      rng,
    );
    out.push({
      visitIndex,
      order,
      doneness: DONENESS_OPTIONS[rng.int(0, 2)]!,
      coat: visit.coat,
      patience: visit.patienceBeats,
    });
  });
  return out;
}
