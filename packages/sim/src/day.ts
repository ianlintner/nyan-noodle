import { createRng } from './rng';
import type { Rng } from './rng';
import { tickClock } from './clock';
import type { DayClock } from './clock';
import { dailyWages } from './staff';
import { effectiveMenu, salePrice } from './prep';
import { MASTERY_QUALITY_PER_LEVEL, starUnlocks } from './progression';
import {
  reputationDeltaForQuality,
  tipForQuality,
  comboMultiplier,
  MIN_ACCEPT_QUALITY,
} from './cooking';
import { MAX_REPUTATION } from './economy';
import { planService } from './service';
import type { ServicePlan } from './service';
import type { ComplaintKind, DayReport, SimState } from './state';

/** Bowls the owner cooks alone each day, before equipment and staff. */
export const PLAYER_BOWLS = 8;
export const BURNER_BOWLS_PER_LEVEL = 2;
export const STAFF_BOWLS_PER_STATION = 5;
/** Player bowl quality before mastery, equipment and jitter; staff cook worse. */
export const PLAYER_BASE_QUALITY = 78;
export const KNIVES_QUALITY_PER_LEVEL = 3;
export const STAFF_BASE_QUALITY = 50;
export const STAFF_QUALITY_PER_LEVEL = 5;
export const STAFF_QUALITY_PER_MASTERY = 2;
/** Stretches the per-bowl reputation deltas so tiers open in roughly 5-8 days. */
export const REPUTATION_SCALE = 2.5;
export const COMPLAINT_REP_PENALTY = 0.04;
export const PRICEY_COMPLAINT_CHANCE = 0.08;

export function playerCapacity(state: SimState): number {
  return PLAYER_BOWLS + state.equipment.burner * BURNER_BOWLS_PER_LEVEL;
}

export function staffCapacity(state: SimState): number {
  return state.staff.roster.reduce((sum, s) => sum + s.stations, 0) * STAFF_BOWLS_PER_STATION;
}

function averageStaffLevel(state: SimState): number {
  const roster = state.staff.roster;
  return roster.length === 0 ? 0 : roster.reduce((sum, s) => sum + s.level, 0) / roster.length;
}

/** Mean quality the owner / staff cooks reach (before per-bowl jitter), for UI hints. */
export function cookQuality(
  state: SimState,
  byStaff: boolean,
  recipe: keyof SimState['mastery'],
): number {
  const mastery = state.mastery[recipe];
  if (byStaff) {
    return Math.round(
      STAFF_BASE_QUALITY +
        averageStaffLevel(state) * STAFF_QUALITY_PER_LEVEL +
        mastery * STAFF_QUALITY_PER_MASTERY,
    );
  }
  return (
    PLAYER_BASE_QUALITY +
    mastery * MASTERY_QUALITY_PER_LEVEL +
    state.equipment.knives * KNIVES_QUALITY_PER_LEVEL
  );
}

/** The clock after close + build, i.e. the start of the next day's prep. */
export function nextPrepClock(clock: DayClock): DayClock {
  let next = tickClock({ ...clock, phase: 'close', tick: 0 });
  next = tickClock(next);
  return next;
}

const settleSeed = (state: SimState): number =>
  (state.seed * 1597334677 + state.clock.day * 31337 + 7) >>> 0;

/** The plan for today's service (menu-aware). Same value planService returns. */
export function planDay(state: SimState): ServicePlan {
  return planService(state);
}

export interface DayResult {
  readonly state: SimState;
  readonly report: DayReport;
}

/**
 * Settle a planned service into coins, tips, complaints and reputation, then roll the
 * clock to the next day's prep. Deterministic: its own RNG stream is seeded from seed+day.
 */
export function settleDay(state: SimState, plan: ServicePlan, rng?: Rng): DayResult {
  const r = rng ?? createRng(settleSeed(state));
  const menu = effectiveMenu(state);
  const complaintKinds: Record<ComplaintKind, number> = {
    queue: 0,
    'sold-out': 0,
    'too-slow': 0,
    pricey: 0,
  };
  const playerCap = playerCapacity(state);
  const totalCap = playerCap + staffCapacity(state);

  let stock = state.stock;
  let cooked = 0;
  let served = 0;
  let revenue = 0;
  let tips = 0;
  let repGain = 0;
  let streak = 0;

  for (const visit of plan.visits) {
    if (visit.outcome === 'lost') {
      complaintKinds.queue += 1;
      streak = 0;
      continue;
    }
    if (stock <= 0) {
      complaintKinds['sold-out'] += 1;
      streak = 0;
      continue;
    }
    if (cooked >= totalCap) {
      complaintKinds['too-slow'] += 1;
      streak = 0;
      continue;
    }
    const id = menu.includes(visit.recipeId) ? visit.recipeId : (menu[0] ?? visit.recipeId);
    const byStaff = cooked >= playerCap;
    const quality = Math.max(0, Math.min(100, cookQuality(state, byStaff, id) + r.int(-8, 8)));
    const price = salePrice(state, id);
    stock -= 1;
    cooked += 1;
    served += 1;
    revenue += price;
    const failed = quality < MIN_ACCEPT_QUALITY;
    streak = failed ? 0 : streak + 1;
    if (!failed) {
      tips += Math.round(tipForQuality(quality, price) * comboMultiplier(streak));
      repGain += reputationDeltaForQuality(quality) * REPUTATION_SCALE;
    }
    const adjust = state.priceAdjust[id];
    if (adjust > 0 && r.next() < adjust * PRICEY_COMPLAINT_CHANCE) complaintKinds.pricey += 1;
  }

  const complaints = Object.values(complaintKinds).reduce((a, b) => a + b, 0);
  const before = state.economy.reputation;
  const after = Math.min(
    MAX_REPUTATION,
    Math.max(0, Math.round((before + repGain - complaints * COMPLAINT_REP_PENALTY) * 100) / 100),
  );

  const wages = dailyWages(state.staff);
  const costs = wages + state.stockSpent;
  const profit = revenue + tips - costs;
  const next: SimState = {
    ...state,
    economy: {
      fishCoins: state.economy.fishCoins + revenue + tips - wages,
      lifetimeEarned: state.economy.lifetimeEarned + revenue + tips,
      reputation: after,
    },
    stock,
    stockSpent: 0,
    clock: nextPrepClock(state.clock),
    revenueHistory: [...state.revenueHistory, revenue + tips],
    activeOrders: [],
  };
  const report: DayReport = {
    day: state.clock.day,
    customersServed: served,
    customersLost: plan.visits.length - served,
    revenue,
    tips,
    costs,
    profit,
    complaints,
    complaintKinds,
    reputation: after,
    reputationDelta: Math.round((after - before) * 100) / 100,
    unlocks: starUnlocks(before, after, state),
    stockLeft: stock,
  };
  return { state: { ...next, lastReport: report }, report };
}
