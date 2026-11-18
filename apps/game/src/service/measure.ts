import { RECIPES } from '@nyan-noodle/sim';
import type { CookMeasurements, RecipeId, ToppingId } from '@nyan-noodle/sim';

/**
 * Pure (Phaser-free) bridge between minigame UI state and the sim's scoring
 * inputs. The scene accumulates raw readings here; `toMeasurements` converts
 * them into the `CookMeasurements` the sim scores. Kept separate so the
 * measurement math is unit-testable without a Phaser runtime.
 */

/** Timed heat-hold reading: the UI samples the needle over a fixed window. */
export interface BrothHoldState {
  /** Number of samples recorded so far. */
  readonly samples: number;
  /** Samples whose heat was inside the safe band. */
  readonly inBand: number;
  /** The heat ever crossed the top of the safe band. */
  readonly overheated: boolean;
}

export const emptyBrothHold: BrothHoldState = { samples: 0, inBand: 0, overheated: false };

/** Record one heat sample (heat in 0..1, band [lo, hi]). Returns the next state. */
export function sampleBroth(
  state: BrothHoldState,
  heat: number,
  bandLo: number,
  bandHi: number,
): BrothHoldState {
  const inBand = heat >= bandLo && heat <= bandHi;
  return {
    samples: state.samples + 1,
    inBand: state.inBand + (inBand ? 1 : 0),
    overheated: state.overheated || heat > bandHi,
  };
}

/** Noodle boil reading: the timer sweep position when the player stopped it. */
export interface NoodleBoilState {
  /** Set once the player stops the timer, storing the 0..1 sweep position. */
  readonly stoppedAt: number | null;
}

export const emptyNoodleBoil: NoodleBoilState = { stoppedAt: null };

/** Topping assembly reading: the sequence the player applied, in order. */
export interface ToppingAssemblyState {
  readonly applied: readonly ToppingId[];
}

export const emptyToppingAssembly: ToppingAssemblyState = { applied: [] };

/** Aggregate all three minigame readings into sim measurements. */
export function toMeasurements(
  broth: BrothHoldState,
  noodles: NoodleBoilState,
  toppings: ToppingAssemblyState,
  requestedDoneness: 'soft' | 'firm' | 'default',
): CookMeasurements {
  const inBandFraction = broth.samples > 0 ? broth.inBand / broth.samples : 0;
  return {
    broth: { inBandFraction, overheated: broth.overheated },
    noodles: { requested: requestedDoneness, stoppedAt: noodles.stoppedAt ?? 0 },
    toppings: { applied: [...toppings.applied] },
  };
}

/** Toppings the UI must ask the player to add for a given recipe + extras. */
export function requiredToppings(
  recipeId: RecipeId,
  extras: readonly ToppingId[],
): readonly ToppingId[] {
  return [...RECIPES[recipeId].defaultToppings, ...extras];
}
