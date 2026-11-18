import type { RecipeId, ToppingId } from './recipes';
import { RECIPES } from './recipes';

/**
 * Cooking-scoring rules for the service minigames. Pure and deterministic:
 * the render layer measures the player's input (timing, sequence) and feeds it
 * into these functions, which return a quality score and its payout effects.
 * No Phaser imports and no randomness — identical measurands score identically.
 */

/** The three active cooking minigames, in the order the player runs them. */
export type CookStepId = 'broth' | 'noodles' | 'toppings';

/** Raw measurements produced by one run of a minigame. */
export interface BrothResult {
  /**
   * Fraction of the hold window (0..1) the heat stayed inside the safe band.
   * Steady holds score higher regardless of overshoot.
   */
  readonly inBandFraction: number;
  /** Whether the heat ever spiked above the safe band (scorching risk). */
  readonly overheated: boolean;
}

export interface NoodleResult {
  /**
   * Doneness the customer ordered: 'firm', 'soft', or the default between.
   * Maps to a target point inside the boil window.
   */
  readonly requested: 'soft' | 'firm' | 'default';
  /**
   * Where the player stopped the boil timer, 0..1 across the whole window
   * (0 = raw, 1 = mushy). Perfect play lands on the requested target.
   */
  readonly stoppedAt: number;
}

export interface ToppingResult {
  /** Toppings the player applied, in application order. */
  readonly applied: readonly ToppingId[];
}

/** All minigame measurements for one bowl, keyed by step. */
export interface CookMeasurements {
  readonly broth: BrothResult;
  readonly noodles: NoodleResult;
  readonly toppings: ToppingResult;
}

export type StepScore<T> = { readonly fraction: number; readonly detail: T };

/** Per-step quality (0..1) plus a machine-readable verdict for UI feedback. */
export type BrothVerdict = 'raw' | 'lukewarm' | 'perfect' | 'scorched';
export type NoodleVerdict = 'raw' | 'undercooked' | 'perfect' | 'overcooked';
export type ToppingVerdict = 'missing' | 'wrong-order' | 'complete';

export interface CookScore {
  /** Overall bowl quality, 0..100, weighting the three steps. */
  readonly quality: number;
  readonly broth: StepScore<BrothVerdict>;
  readonly noodles: StepScore<NoodleVerdict>;
  readonly toppings: StepScore<ToppingVerdict>;
}

/** Weights (must sum to 1) for each step's contribution to overall quality. */
const BROTH_WEIGHT = 0.3;
const NOODLE_WEIGHT = 0.45;
const TOPPING_WEIGHT = 0.25;

/** Noodle window sweet-spot centres by requested doneness (0..1 on the timer). */
const NOODLE_TARGETS: Readonly<Record<NoodleResult['requested'], number>> = {
  soft: 0.55,
  firm: 0.7,
  default: 0.62,
};

/** Score the broth hold: steadiness (in-band fraction) with an overheat cap. */
export function scoreBroth(result: BrothResult): StepScore<BrothVerdict> {
  const f = clamp01(result.inBandFraction);
  const base = f < 0.25 ? 0 : f < 0.55 ? 0.4 : f < 0.8 ? 0.7 : f < 0.95 ? 0.9 : 1;
  // Overheating scorches the broth: it caps the score below a flawless hold.
  const fraction = result.overheated ? Math.min(base, 0.6) : base;
  const verdict: BrothVerdict =
    result.overheated && base > 0.6
      ? 'scorched'
      : f < 0.4
        ? 'raw'
        : f < 0.8
          ? 'lukewarm'
          : 'perfect';
  return { fraction, detail: verdict };
}

/** Score the noodle boil: distance from the requested doneness target. */
export function scoreNoodles(result: NoodleResult): StepScore<NoodleVerdict> {
  const target = NOODLE_TARGETS[result.requested];
  const delta = Math.abs(clamp01(result.stoppedAt) - target);
  // Triangle falloff: dead-on is 1, ~0.25 window off is still decent.
  const fraction = Math.max(0, 1 - delta / 0.3);
  const verdict: NoodleVerdict =
    result.stoppedAt < target - 0.25
      ? 'raw'
      : result.stoppedAt > target + 0.25
        ? 'overcooked'
        : delta <= 0.08
          ? 'perfect'
          : result.stoppedAt < target
            ? 'undercooked'
            : 'overcooked';
  return { fraction, detail: verdict };
}

/** Score topping assembly: all required present, bonus for the correct order. */
export function scoreToppings(
  recipeId: RecipeId,
  orderExtras: readonly ToppingId[],
  result: ToppingResult,
): StepScore<ToppingVerdict> {
  const required = [...RECIPES[recipeId].defaultToppings, ...orderExtras];
  const applied = result.applied ?? [];
  const missing = required.length - required.filter((t) => applied.includes(t)).length;
  const extra = applied.filter((t) => !required.includes(t)).length;
  // Sequence fidelity: how much of the required order the applied list preserves.
  let orderPenalty = 0;
  let reqIdx = 0;
  for (const t of applied) {
    if (t === required[reqIdx]) reqIdx += 1;
    else if (required.slice(reqIdx + 1).includes(t)) orderPenalty += 0.1;
  }
  const completeness = required.length === 0 ? 1 : (required.length - missing) / required.length;
  const fraction = clamp01(completeness - orderPenalty - extra * 0.05);
  const verdict: ToppingVerdict =
    missing === 0 && orderPenalty === 0 && extra === 0
      ? 'complete'
      : missing > 0
        ? 'missing'
        : 'wrong-order';
  return { fraction, detail: verdict };
}

/** Combine all steps into an overall 0..100 quality and per-step verdicts. */
export function scoreBowl(
  recipeId: RecipeId,
  orderExtras: readonly ToppingId[],
  m: CookMeasurements,
): CookScore {
  const broth = scoreBroth(m.broth);
  const noodles = scoreNoodles(m.noodles);
  const toppings = scoreToppings(recipeId, orderExtras, m.toppings);
  const quality = Math.round(
    100 *
      (broth.fraction * BROTH_WEIGHT +
        noodles.fraction * NOODLE_WEIGHT +
        toppings.fraction * TOPPING_WEIGHT),
  );
  return { quality: clampInt(quality, 0, 100), broth, noodles, toppings };
}

/** Minimum quality for the bowl to be accepted at all (below = failed order). */
export const MIN_ACCEPT_QUALITY = 40;

/**
 * Tip (Fish Coins) from a bowl's quality, scaled by the bowl's base price.
 * Perfect play tips aggressively; a merely-acceptable bowl tips little.
 */
export function tipForQuality(quality: number, basePrice: number): number {
  if (quality < MIN_ACCEPT_QUALITY) return 0;
  const band = Math.floor((quality - MIN_ACCEPT_QUALITY) / 10); // 0..6
  const rate = [0.04, 0.07, 0.12, 0.18, 0.25, 0.32, 0.4][band] ?? 0.4;
  return Math.round(basePrice * rate);
}

/** Rush bonus: extra tip granted when the whole order is finished fast. */
export function rushBonus(
  quality: number,
  completedBeats: number,
  rushThresholdBeats: number,
): number {
  if (quality < MIN_ACCEPT_QUALITY) return 0;
  if (completedBeats >= rushThresholdBeats) return 0;
  return Math.round((1 - completedBeats / rushThresholdBeats) * 3);
}

/** Combo multiplier for a streak of N consecutive accepted bowls. */
export function comboMultiplier(streak: number): number {
  // 1x, 1.05x, 1.1x, ... capped at 1.5x.
  return Math.min(1.5, 1 + Math.max(0, streak - 1) * 0.05);
}

/** Reputation delta from serving a bowl of the given quality. */
export function reputationDeltaForQuality(quality: number): number {
  if (quality >= 90) return 0.05;
  if (quality >= 70) return 0.02;
  return 0;
}

/** Whether a bowl at this quality is a failed/sent-back order. */
export function isFailedOrder(quality: number): boolean {
  return quality < MIN_ACCEPT_QUALITY;
}

/** Settle one served bowl: quality, tip, reputation and payout summary. */
export interface BowlPayout {
  readonly quality: number;
  readonly basePrice: number;
  readonly tip: number;
  readonly rush: number;
  readonly comboMultiplier: number;
  /** Total coins the customer pays on top of the base, before combo scaling. */
  readonly bonusCoins: number;
  readonly reputationDelta: number;
  readonly failed: boolean;
}

export function settleBowl(
  recipeId: RecipeId,
  orderExtras: readonly ToppingId[],
  basePrice: number,
  m: CookMeasurements,
  streak: number,
  completedBeats: number,
  rushThresholdBeats: number,
): BowlPayout {
  const score = scoreBowl(recipeId, orderExtras, m);
  const failed = isFailedOrder(score.quality);
  const tip = failed ? 0 : tipForQuality(score.quality, basePrice);
  const rush = failed ? 0 : rushBonus(score.quality, completedBeats, rushThresholdBeats);
  const mult = failed ? 0 : comboMultiplier(streak);
  const bonusCoins = failed ? 0 : Math.round((tip + rush) * mult);
  return {
    quality: score.quality,
    basePrice,
    tip,
    rush,
    comboMultiplier: mult,
    bonusCoins,
    reputationDelta: failed ? 0 : reputationDeltaForQuality(score.quality),
    failed,
  };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function clampInt(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}
