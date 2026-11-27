import type { RecipeId } from './recipes';
import type { Rng } from './rng';
import type { BreedId, TraitId } from './breeds';
import type { CoatId } from './customers';

/**
 * Named "regular" customers: cats who return across days, remember a favourite
 * dish, and build an affection meter that unlocks small perks. Pure and seeded —
 * names come from a small local grammar, not an external lexicon, and every
 * decision reads from the caller's RNG stream so a save is fully reproducible.
 */

/** First-name / surname fragments for the local name grammar. */
const FORENAME_SYLLABLES = [
  'Mochi',
  'Nori',
  'Miso',
  'Sakura',
  'Tama',
  'Kiki',
  'Ponzu',
  'Wasabi',
  'Ume',
  'Yuzu',
] as const;

const SURNAME_SYLLABLES = [
  'Whisker',
  'Paw',
  'Tail',
  'Fur',
  'Bean',
  'Chop',
  'Steam',
  'Noodle',
  'Purr',
  'Mochi',
] as const;

/** Affection thresholds that unlock perks. Values are inclusive. */
export interface AffectionPerk {
  readonly threshold: number;
  readonly name: string;
  /** Flat tip bonus (coins) the regular grants once surpassed. */
  readonly tipBonus: number;
  /** Extra daily demand the regular's word-of-mouth adds once surpassed. */
  readonly wordOfMouth: number;
}

export const AFFECTION_PERKS: readonly AffectionPerk[] = [
  { threshold: 3, name: 'Comfortable', tipBonus: 1, wordOfMouth: 0 },
  { threshold: 6, name: 'Friendly', tipBonus: 2, wordOfMouth: 1 },
  { threshold: 9, name: 'Devoted', tipBonus: 3, wordOfMouth: 2 },
];

/** Maximum affection a regular can reach (caps the meter and perks). */
export const MAX_AFFECTION = 10;

/** Cap on the total word-of-mouth demand the whole roster can add in one day. */
export const MAX_WORD_OF_MOUTH = 6;

/** A persisted regular: name, look, personality, favourite dish, and progress. */
export interface Regular {
  readonly id: number;
  readonly name: string;
  readonly coat: CoatId;
  readonly breed: BreedId;
  readonly trait: TraitId;
  readonly favoriteRecipe: RecipeId;
  /** Days the regular has visited (and been served). */
  readonly visits: number;
  /** Affection meter, 0..MAX_AFFECTION. */
  readonly affection: number;
  /** Last day (1-indexed) the regular appeared; 0 = never. */
  readonly lastSeenDay: number;
}

/** Deterministically generate a name from two syllable lists. */
export function generateName(rng: Rng): string {
  const first = rng.pick(FORENAME_SYLLABLES);
  const second = rng.pick(SURNAME_SYLLABLES);
  // ~1 in 5 cats get a single-syllable name for variety.
  return rng.next() < 0.2 ? first : `${first} ${second}`;
}

/** The perks (tip bonus + word-of-mouth) a regular currently unlocks. */
export function regularPerks(regular: Regular): {
  tipBonus: number;
  wordOfMouth: number;
} {
  let tipBonus = 0;
  let wordOfMouth = 0;
  for (const perk of AFFECTION_PERKS) {
    if (regular.affection >= perk.threshold) {
      tipBonus = perk.tipBonus;
      wordOfMouth = perk.wordOfMouth;
    }
  }
  return { tipBonus, wordOfMouth };
}

/** Cap used when a perk/affection bumps up. */
export function clampAffection(value: number): number {
  return value < 0 ? 0 : value > MAX_AFFECTION ? MAX_AFFECTION : value;
}

/**
 * Advance a regular after a served visit: +1 visit, +1 affection (capped), and
 * update its last-seen day.
 */
export function registerVisit(regular: Regular, day: number): Regular {
  return {
    ...regular,
    visits: regular.visits + 1,
    affection: clampAffection(regular.affection + 1),
    lastSeenDay: day,
  };
}

/**
 * Decide which existing regulars return today, in deterministic order. A regular
 * returns when its favourite dish is on the menu (strongest pull) or by familiarity
 * (a mild draw). Returns the regulars that will visit, and the ids that stay home,
 * keyed as `[{ regular, recipeId } | null]` so the caller maps them onto the day's
 * demand slots without reordering the RNG stream.
 */
export function whoReturns(
  regulars: readonly Regular[],
  menu: readonly RecipeId[],
  rng: Rng,
): { returning: readonly { regular: Regular; recipeId: RecipeId }[] } {
  const returning: { regular: Regular; recipeId: RecipeId }[] = [];
  for (const regular of regulars) {
    const favouriteOnMenu = menu.includes(regular.favoriteRecipe);
    // Devoted regulars reliably come back; newer ones less so. Deterministic per day.
    const pull = favouriteOnMenu
      ? 0.7 + regular.affection * 0.03
      : 0.25 + regular.affection * 0.025;
    const visitsAgain = rng.next() < pull;
    if (!visitsAgain) continue;
    // Favourite dish wins unless it's off-menu, in which case pick the closest on-menu.
    const recipeId = favouriteOnMenu
      ? regular.favoriteRecipe
      : (menu[regular.id % menu.length] ?? menu[0] ?? regular.favoriteRecipe);
    returning.push({ regular, recipeId });
  }
  return { returning };
}
