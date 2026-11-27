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
import { registerVisit, regularPerks } from './regulars';
import type { Regular } from './regulars';
import { traitQualityBar, traitTipBonus } from './breeds';
import { PERFECT_QUALITY, evaluateGoals } from './goals';
import { collectBonus } from './interact';
import type { ComplaintKind, DayReport, SimState } from './state';

/** Bowls the owner cooks alone each day, before equipment and staff. */
import { PLAYER_BOWLS } from './balance';
export { PLAYER_BOWLS };
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
export interface SettleOptions {
  readonly rng?: Rng;
  /**
   * Qualities (0..100) of the bowls the owner cooked by hand in the minigames, applied in
   * order to the owner's first bowls. Null/missing entries fall back to the modelled quality.
   */
  readonly chefQualities?: readonly (number | null)[];
  /**
   * Customer ids whose tip pop the owner tapped during service, IN TAP ORDER. Each collected
   * pop on a paid bowl adds a bonus and builds a `collectStreak` combo that follows this tap
   * order (not arrival order); duplicates and unknown ids are ignored. Omitted = autopilot.
   */
  readonly collected?: readonly number[];
}

/** Customer ids whose visit actually earns a tip (same computation as `settleDay`). */
export function tipEligibleVisits(
  state: SimState,
  plan: ServicePlan,
  chefQualities: readonly (number | null)[] = [],
): ReadonlySet<number> {
  const visitTips = new Map<number, number>();
  settleInternal(state, plan, { chefQualities }, visitTips);
  return new Set(visitTips.keys());
}

export function settleDay(
  state: SimState,
  plan: ServicePlan,
  options: SettleOptions = {},
): DayResult {
  return settleInternal(state, plan, options, new Map());
}

/** Shared settlement; `visitTips` receives each tipped visit's base tip (customerId -> tip). */
function settleInternal(
  state: SimState,
  plan: ServicePlan,
  options: SettleOptions,
  visitTips: Map<number, number>,
): DayResult {
  const r = options.rng ?? createRng(settleSeed(state));
  const chef = options.chefQualities ?? [];
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
  let perfectBowls = 0;
  let revenue = 0;
  let tips = 0;
  let repGain = 0;
  let streak = 0;

  // Build the next roster of regulars: returning ones advance, first-time walk-ins
  // who got a good bowl convert into new regulars (their first dish becomes their favourite).
  const regularMap = new Map(state.regulars.map((reg) => [reg.id, reg]));
  // Never reuse an id just because the roster has a gap; advance from the highest id.
  let nextRegularId = state.regulars.reduce((max, r) => Math.max(max, r.id), -1) + 1;

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
    // Always draw the jitter so hand-cooked bowls never shift later bowls' RNG stream.
    const modelled = cookQuality(state, byStaff, id) + r.int(-8, 8);
    const handCooked = byStaff ? undefined : chef[cooked];
    const quality = Math.max(0, Math.min(100, Math.round(handCooked ?? modelled)));
    const price = salePrice(state, id);
    stock -= 1;
    cooked += 1;
    served += 1;
    revenue += price;
    // Picky regulars hold the bowl to a higher bar before accepting it.
    const acceptBar = visit.isRegular
      ? MIN_ACCEPT_QUALITY + traitQualityBar(visit.trait)
      : MIN_ACCEPT_QUALITY;
    const failed = quality < acceptBar;
    const tipsBefore = tips;
    streak = failed ? 0 : streak + 1;
    if (!failed) {
      if (quality >= PERFECT_QUALITY) perfectBowls += 1;
      tips += Math.round(tipForQuality(quality, price) * comboMultiplier(streak));
      // Generous/picky regulars tip a flat bonus on top of the quality tip.
      if (visit.isRegular) tips += traitTipBonus(visit.trait);
      repGain += reputationDeltaForQuality(quality) * REPUTATION_SCALE;
    }

    // Regulars: a served regular advances affection and grants its tip perk; a
    // served walk-in whose bowl wasn't failed becomes a brand-new regular.
    if (visit.isRegular && visit.regularId !== null) {
      const existing = regularMap.get(visit.regularId);
      if (existing && !failed) {
        const advanced = registerVisit(existing, state.clock.day);
        regularMap.set(existing.id, advanced);
        tips += regularPerks(advanced).tipBonus;
      }
    } else if (!failed && visit.name !== '') {
      const newcomer: Regular = {
        id: nextRegularId,
        name: visit.name,
        coat: visit.coat,
        breed: visit.breed,
        trait: visit.trait,
        favoriteRecipe: visit.recipeId,
        visits: 1,
        affection: 1,
        lastSeenDay: state.clock.day,
      };
      regularMap.set(nextRegularId, newcomer);
      nextRegularId += 1;
    }
    const visitTip = tips - tipsBefore;
    if (visitTip > 0) visitTips.set(visit.customerId, visitTip);
    const adjust = state.priceAdjust[id];
    if (adjust > 0 && r.next() < adjust * PRICEY_COMPLAINT_CHANCE) complaintKinds.pricey += 1;
  }

  // Collect bonuses follow the owner's tap order; the seeded base tips above are untouched.
  const counted = new Set<number>();
  let collectStreak = 0;
  for (const id of options.collected ?? []) {
    const base = visitTips.get(id);
    if (base === undefined || counted.has(id)) continue;
    counted.add(id);
    collectStreak += 1;
    tips += collectBonus(base, collectStreak);
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
    regulars: [...regularMap.values()].sort((a, b) => a.id - b.id),
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
    perfectBowls,
    goalsCompleted: [],
  };
  // Goals read the post-day state (stars, regulars, gear) plus today's stats and pay once.
  const goals = evaluateGoals(next, { served, perfectBowls });
  // Star rewards land after the day's service, so derive the report's reputation from the
  // final saved value: otherwise the Report contradicts the save and a gate crossed by the
  // reward gets no unlock notification until the following day.
  const finalReputation = goals.state.economy.reputation;
  const settled: DayReport = {
    ...report,
    reputation: finalReputation,
    reputationDelta: Math.round((finalReputation - before) * 100) / 100,
    unlocks: starUnlocks(before, finalReputation, state),
    goalsCompleted: goals.completions,
  };
  return { state: { ...goals.state, lastReport: settled }, report: settled };
}
