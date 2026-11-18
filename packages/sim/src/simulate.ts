import type { Rng } from './rng';
import type { SimState, DayReport } from './state';
import { tickClock } from './clock';
import type { CatCustomer, CoatId } from './customers';
import { COAT_IDS, createCustomer } from './customers';
import { dailyDemand, generateOrder } from './orders';
import type { Order } from './orders';
import { bowlCost, bowlPrice, reputationGain } from './economy';
import { dailyWages } from './staff';
import { activeSeats, layoutDemandMultiplier } from './layoutRules';
import { RECIPES } from './recipes';
import type { RecipeId, ToppingId } from './recipes';

function randomCoat(rng: Rng): CoatId {
  return rng.pick(COAT_IDS);
}

function randomPreferences(rng: Rng, unlocked: readonly RecipeId[]) {
  const pool = [...unlocked];
  const recipeOrder: RecipeId[] = [];
  while (pool.length > 0) {
    const index = rng.int(0, pool.length - 1);
    recipeOrder.push(pool[index]!);
    pool.splice(index, 1);
  }
  const allToppings = RECIPES[unlocked[0]!]?.availableToppings ?? [];
  const likedToppings: ToppingId[] = allToppings.filter(() => rng.next() < 0.3);
  return { recipeOrder, likedToppings };
}

interface ServiceResult {
  activeOrders: Order[];
  customers: CatCustomer[];
}

/** Spawn a day's customers and generate their orders. Deterministic given `rng`. */
function openService(state: SimState, rng: Rng): ServiceResult {
  const demand = dailyDemand(
    layoutDemandMultiplier(state.tierId, state.items),
    state.economy.reputation,
    rng,
  );
  const basePatience = 20;

  const customers: CatCustomer[] = [];
  const orders: Order[] = [];

  for (let i = 0; i < demand; i++) {
    const customerId = state.regulars.length + i;
    const coat = randomCoat(rng);
    const preferences = randomPreferences(rng, state.unlockedRecipes);
    const customer = createCustomer(customerId, coat, preferences, basePatience);
    customers.push(customer);
    const order = generateOrder(i, customer, state.economy.reputation, bowlPrice, rng);
    orders.push(order);
  }
  return { activeOrders: orders, customers };
}

interface ServiceOutcome {
  served: number;
  lost: number;
  revenue: number;
  costs: number;
  /** Ids of customers whose orders were served (become/track as regulars). */
  servedIds: Set<number>;
}

function resolveService(orders: readonly Order[], tierSeats: number): ServiceOutcome {
  // Deterministic throughput: customers are seated in arrival order up to the
  // tier's seat capacity repeated across service ticks; overflow walks out.
  let served = 0;
  let lost = 0;
  let revenue = 0;
  let costs = 0;
  const servedIds = new Set<number>();

  // Seat capacity limits how many can be served per service window; remaining
  // orders (beyond seats) lose patience and leave.
  const canServe = Math.max(1, tierSeats) >= orders.length;
  for (const order of orders) {
    if (order.patienceRemaining > 0 && (canServe || served < tierSeats)) {
      served += 1;
      revenue += order.price;
      costs += bowlCost(order.recipeId, order.extraToppings);
      servedIds.add(order.customerId);
    } else {
      lost += 1;
    }
  }
  return { served, lost, revenue, costs, servedIds };
}

/**
 * Advance the sim by one full day. Deterministic for a fixed seed because all
 * randomness flows through the supplied `rng`.
 */
export function advanceDay(state: SimState, rng: Rng): SimState {
  const { activeOrders, customers } = openService(state, rng);
  const outcome = resolveService(activeOrders, activeSeats(state.tierId, state.items).length);

  // Update regular registry: bump visit count for served customers, or add new.
  const regularsById = new Map<number, CatCustomer>(state.regulars.map((c) => [c.id, c]));
  for (const customer of customers) {
    if (!outcome.servedIds.has(customer.id)) continue;
    const existing = regularsById.get(customer.id);
    if (existing) {
      regularsById.set(customer.id, { ...existing, visits: existing.visits + 1, isRegular: true });
    } else {
      regularsById.set(customer.id, { ...customer, visits: 1, isRegular: true });
    }
  }
  const regulars = [...regularsById.values()];

  // Settle economy.
  const wages = dailyWages(state.staff);
  const profit = outcome.revenue - outcome.costs - wages;
  const newFishCoins = state.economy.fishCoins + profit;
  const gainedReputation = outcome.served > 0 ? reputationGain(state.economy.reputation) : 0;
  const newReputation = Math.min(
    5,
    Math.round((state.economy.reputation + gainedReputation) * 100) / 100,
  );

  const report: DayReport = {
    day: state.clock.day,
    customersServed: outcome.served,
    customersLost: outcome.lost,
    revenue: outcome.revenue,
    costs: outcome.costs + wages,
    profit,
    reputation: newReputation,
  };

  return {
    ...state,
    economy: {
      fishCoins: newFishCoins,
      lifetimeEarned: state.economy.lifetimeEarned + outcome.revenue,
      reputation: newReputation,
    },
    regulars,
    activeOrders: [],
    lastReport: report,
    revenueHistory: [...state.revenueHistory, outcome.revenue],
    clock: advanceToNextPrep(state.clock),
  };
}

/**
 * Advance the clock from the current phase through close/build to prep of the
 * next day (a full day boundary).
 */
function advanceToNextPrep(clock: SimState['clock']): SimState['clock'] {
  let next = tickClock({ ...clock, phase: 'close', tick: 0 }); // -> build
  next = tickClock(next); // -> prep of next day
  return next;
}

/** Run `days` consecutive days and collect the per-day revenue curve. */
export function runSimulation(initial: SimState, rng: Rng, days: number): SimState {
  let state = initial;
  for (let d = 0; d < days; d++) {
    state = advanceDay(state, rng);
  }
  return state;
}
