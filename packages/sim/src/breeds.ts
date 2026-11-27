import type { ToppingId } from './recipes';
import type { Rng } from './rng';

/**
 * Breeds and personality traits: the memorable-customers layer of the sim.
 * A breed is the customer's look/theme (distinct from the paint "coat" that
 * drives the atlas art), and each breed carries a trait that changes how the
 * customer orders, how patient it is, and how it pays. Pure and seeded — no
 * Math.random, no framework imports.
 */

export type BreedId = 'calico' | 'siamese' | 'ginger' | 'tuxedo' | 'ragdoll';

export type TraitId = 'neutral' | 'picky' | 'impatient' | 'generous' | 'night-owl' | 'spice-lover';

export interface Breed {
  readonly id: BreedId;
  readonly name: string;
  /** The personality trait this breed always carries. */
  readonly trait: TraitId;
}

export interface Trait {
  readonly id: TraitId;
  readonly name: string;
  /** Short glyph/icon key shown on the ticket and seat (single token). */
  readonly icon: string;
  /** Multiplier on the customer's base patience budget. */
  readonly patienceModifier: number;
  /** Bonus added to the acceptance quality bar (picky raises it, others 0). */
  readonly qualityBar: number;
  /** Flat tip bonus (rounded coins) on an accepted bowl; generous raises it. */
  readonly tipBonus: number;
  /** Extra favourite toppings the customer requests beyond preferences. */
  readonly toppingBias: number;
  /** Late-arrival offset applied to the service beat timeline. */
  readonly arrivalOffset: number;
}

export const BREEDS: Readonly<Record<BreedId, Breed>> = {
  calico: { id: 'calico', name: 'Calico', trait: 'picky' },
  siamese: { id: 'siamese', name: 'Siamese', trait: 'impatient' },
  ginger: { id: 'ginger', name: 'Ginger', trait: 'generous' },
  tuxedo: { id: 'tuxedo', name: 'Tuxedo', trait: 'night-owl' },
  ragdoll: { id: 'ragdoll', name: 'Ragdoll', trait: 'spice-lover' },
};

export const BREED_IDS: readonly BreedId[] = ['calico', 'siamese', 'ginger', 'tuxedo', 'ragdoll'];

export const TRAITS: Readonly<Record<TraitId, Trait>> = {
  neutral: {
    id: 'neutral',
    name: 'Easygoing',
    icon: 'dot',
    patienceModifier: 1.0,
    qualityBar: 0,
    tipBonus: 0,
    toppingBias: 0,
    arrivalOffset: 0,
  },
  picky: {
    id: 'picky',
    name: 'Picky',
    icon: 'eye',
    patienceModifier: 1.0,
    qualityBar: 12,
    tipBonus: 3,
    toppingBias: 0,
    arrivalOffset: 0,
  },
  impatient: {
    id: 'impatient',
    name: 'Impatient',
    icon: 'clock',
    patienceModifier: 0.75,
    qualityBar: 0,
    tipBonus: 0,
    toppingBias: 0,
    arrivalOffset: 0,
  },
  generous: {
    id: 'generous',
    name: 'Generous',
    icon: 'heart',
    patienceModifier: 1.0,
    qualityBar: 0,
    tipBonus: 4,
    toppingBias: 0,
    arrivalOffset: 0,
  },
  'night-owl': {
    id: 'night-owl',
    name: 'Night-owl',
    icon: 'moon',
    patienceModifier: 1.05,
    qualityBar: 0,
    tipBonus: 0,
    toppingBias: 0,
    arrivalOffset: 0.4,
  },
  'spice-lover': {
    id: 'spice-lover',
    name: 'Spice-lover',
    icon: 'pepper',
    patienceModifier: 1.0,
    qualityBar: 0,
    tipBonus: 0,
    toppingBias: 0.5,
    arrivalOffset: 0,
  },
};

export const TRAIT_IDS: readonly TraitId[] = [
  'neutral',
  'picky',
  'impatient',
  'generous',
  'night-owl',
  'spice-lover',
];

export const FAVOURITE_TOPPING: Readonly<Partial<Record<TraitId, ToppingId>>> = {
  picky: 'egg',
  impatient: 'nori',
  generous: 'chashu',
  'night-owl': 'corn',
  'spice-lover': 'chashu',
};

/** Trait modifier applied to a customer's patience budget. */
export function traitPatienceModifier(trait: TraitId): number {
  return TRAITS[trait]?.patienceModifier ?? 1;
}

/** Extra quality a picky customer demands before it accepts a bowl. */
export function traitQualityBar(trait: TraitId): number {
  return TRAITS[trait]?.qualityBar ?? 0;
}

/** Flat tip bonus an accepted bowl earns from this trait. */
export function traitTipBonus(trait: TraitId): number {
  return TRAITS[trait]?.tipBonus ?? 0;
}

/** Chance a spice-lover (or similar) requests an extra topping. */
export function traitToppingBias(trait: TraitId): number {
  return TRAITS[trait]?.toppingBias ?? 0;
}

/** Fraction of the service arrival window a night-owl is delayed into. */
export function traitArrivalOffset(trait: TraitId): number {
  return TRAITS[trait]?.arrivalOffset ?? 0;
}

/** Pick a breed deterministically from an RNG stream. */
export function randomBreed(rng: Rng): BreedId {
  return rng.pick(BREED_IDS);
}

/** Pick a trait deterministically (the five personality traits) from an RNG stream. */
export function randomTrait(rng: Rng): TraitId {
  return rng.pick(['picky', 'impatient', 'generous', 'night-owl', 'spice-lover'] as const);
}

/** The trait for a breed. */
export function breedTrait(breed: BreedId): TraitId {
  return BREEDS[breed]!.trait;
}
