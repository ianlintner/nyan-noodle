import { RECIPES } from './recipes';
import type { RecipeId } from './recipes';
import { createStaff } from './staff';
import type { EquipmentId, SimState } from './state';
import { nextTier } from './shop';

/** Every action returns the next state or a reason; nothing mutates. */
export type ActionResult =
  | { readonly ok: true; readonly state: SimState }
  | { readonly ok: false; readonly reason: ProgressionError };

export type ProgressionError =
  | 'unknown'
  | 'need-stars'
  | 'need-coins'
  | 'maxed'
  | 'already-owned'
  | 'not-owned'
  | 'roster-full'
  | 'last-recipe';

export const RECIPE_UNLOCKS: Readonly<Record<RecipeId, { stars: number; cost: number }>> = {
  shoyu: { stars: 0, cost: 0 },
  miso: { stars: 1, cost: 60 },
  tonkotsu: { stars: 2, cost: 150 },
};

export const MASTERY_MAX = 5;
/** Stars needed to train mastery level N+1 (index = current level). */
export const MASTERY_STARS: readonly number[] = [0, 0.5, 1, 2, 3];
export const MASTERY_QUALITY_PER_LEVEL = 3;
export const MASTERY_PRICE_PER_LEVEL = 0.05;
export function masteryCost(level: number): number {
  return 30 * (level + 1);
}

export interface EquipmentDef {
  readonly id: EquipmentId;
  readonly name: string;
  readonly blurb: string;
  readonly maxLevel: number;
  readonly costs: readonly number[];
  readonly stars: readonly number[];
}

export const EQUIPMENT: readonly EquipmentDef[] = [
  {
    id: 'knives',
    name: 'Sharp Knives',
    blurb: '+3 bowl quality',
    maxLevel: 3,
    costs: [50, 120, 240],
    stars: [0, 1.5, 3],
  },
  {
    id: 'burner',
    name: 'Big Burner',
    blurb: '+2 bowls you cook',
    maxLevel: 3,
    costs: [70, 150, 300],
    stars: [0.5, 2, 3.5],
  },
  {
    id: 'signboard',
    name: 'Neon Signboard',
    blurb: '+8% customers',
    maxLevel: 3,
    costs: [90, 200, 380],
    stars: [1, 2.5, 4],
  },
];

export const STAFF_MAX = 5;
export const STAFF_HIRE_COST = 60;
export const STAFF_HIRE_STARS: readonly number[] = [1, 2.5, 3.5, 4, 5];
export const STAFF_LEVEL_MAX = 5;
export const STAFF_NAMES: readonly string[] = ['Momo', 'Taro', 'Mochi', 'Kiki', 'Pudding'];
export function staffLevelCost(level: number): number {
  return 40 * level;
}

const fail = (reason: ProgressionError): ActionResult => ({ ok: false, reason });

function spend(state: SimState, cost: number): SimState['economy'] {
  return { ...state.economy, fishCoins: state.economy.fishCoins - cost };
}

export function unlockRecipe(state: SimState, id: RecipeId): ActionResult {
  const def = RECIPE_UNLOCKS[id];
  if (!def) return fail('unknown');
  if (state.unlockedRecipes.includes(id)) return fail('already-owned');
  if (state.economy.reputation < def.stars) return fail('need-stars');
  if (state.economy.fishCoins < def.cost) return fail('need-coins');
  return {
    ok: true,
    state: {
      ...state,
      economy: spend(state, def.cost),
      unlockedRecipes: [...state.unlockedRecipes, id],
      menu: [...state.menu, id],
    },
  };
}

export function trainMastery(state: SimState, id: RecipeId): ActionResult {
  if (!state.unlockedRecipes.includes(id)) return fail('not-owned');
  const level = state.mastery[id];
  if (level >= MASTERY_MAX) return fail('maxed');
  if (state.economy.reputation < (MASTERY_STARS[level] ?? 99)) return fail('need-stars');
  const cost = masteryCost(level);
  if (state.economy.fishCoins < cost) return fail('need-coins');
  return {
    ok: true,
    state: {
      ...state,
      economy: spend(state, cost),
      mastery: { ...state.mastery, [id]: level + 1 },
    },
  };
}

export function buyEquipment(state: SimState, id: EquipmentId): ActionResult {
  const def = EQUIPMENT.find((e) => e.id === id);
  if (!def) return fail('unknown');
  const level = state.equipment[id];
  if (level >= def.maxLevel) return fail('maxed');
  if (state.economy.reputation < (def.stars[level] ?? 99)) return fail('need-stars');
  const cost = def.costs[level] ?? 0;
  if (state.economy.fishCoins < cost) return fail('need-coins');
  return {
    ok: true,
    state: {
      ...state,
      economy: spend(state, cost),
      equipment: { ...state.equipment, [id]: level + 1 },
    },
  };
}

export function hireStaff(state: SimState): ActionResult {
  const count = state.staff.roster.length;
  if (count >= STAFF_MAX) return fail('roster-full');
  if (state.economy.reputation < (STAFF_HIRE_STARS[count] ?? 99)) return fail('need-stars');
  if (state.economy.fishCoins < STAFF_HIRE_COST) return fail('need-coins');
  const id = state.staff.roster.reduce((m, s) => Math.max(m, s.id), 0) + 1;
  const hire = createStaff(id, STAFF_NAMES[count] ?? `Cat ${id}`, 1);
  return {
    ok: true,
    state: {
      ...state,
      economy: spend(state, STAFF_HIRE_COST),
      staff: { roster: [...state.staff.roster, hire] },
    },
  };
}

export function levelStaff(state: SimState, staffId: number): ActionResult {
  const member = state.staff.roster.find((s) => s.id === staffId);
  if (!member) return fail('unknown');
  if (member.level >= STAFF_LEVEL_MAX) return fail('maxed');
  const cost = staffLevelCost(member.level);
  if (state.economy.fishCoins < cost) return fail('need-coins');
  const upgraded = createStaff(member.id, member.name, member.level + 1);
  return {
    ok: true,
    state: {
      ...state,
      economy: spend(state, cost),
      staff: { roster: state.staff.roster.map((s) => (s.id === staffId ? upgraded : s)) },
    },
  };
}

export function describeProgressionError(reason: ProgressionError): string {
  switch (reason) {
    case 'need-stars':
      return 'Not enough Reputation Stars yet';
    case 'need-coins':
      return 'Not enough Fish Coins';
    case 'maxed':
      return 'Already at max level';
    case 'already-owned':
      return 'Already owned';
    case 'not-owned':
      return 'Unlock the recipe first';
    case 'roster-full':
      return 'Kitchen is full';
    case 'last-recipe':
      return 'Keep at least one dish on the menu';
    default:
      return 'Cannot do that';
  }
}

/** Things whose Reputation Star gate sits in (before, after]: shown as "unlocks" in the report. */
export function starUnlocks(before: number, after: number, state: SimState): string[] {
  const out: string[] = [];
  const crossed = (stars: number): boolean => stars > before && stars <= after;
  for (const id of Object.keys(RECIPE_UNLOCKS) as RecipeId[]) {
    if (crossed(RECIPE_UNLOCKS[id].stars)) out.push(`${RECIPES[id].name} recipe`);
  }
  for (const def of EQUIPMENT) {
    const stars = def.stars[state.equipment[def.id]];
    if (stars !== undefined && crossed(stars))
      out.push(`${def.name} L${state.equipment[def.id] + 1}`);
  }
  const hireStars = STAFF_HIRE_STARS[state.staff.roster.length];
  if (hireStars !== undefined && crossed(hireStars)) out.push('New staff cat to hire');
  const tier = nextTier(state.tierId);
  if (tier && crossed(tier.unlockReputation)) out.push(`${tier.name} expansion`);
  return out;
}
