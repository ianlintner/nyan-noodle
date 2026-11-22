import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import {
  BREED_IDS,
  breedTrait,
  randomBreed,
  TRAIT_IDS,
  traitArrivalOffset,
  traitPatienceModifier,
  traitQualityBar,
  traitTipBonus,
} from './breeds';
import { generateName, regularPerks, registerVisit, whoReturns } from './regulars';
import type { Regular } from './regulars';
import type { CatCustomer } from './customers';
import { createCustomer } from './customers';
import { generateOrder } from './orders';
import type { Order } from './orders';
import { createSimState } from './state';
import { planService } from './service';
import { settleDay } from './day';
import type { SimState } from './state';

/** A minimal regular for direct unit checks. */
const reg = (over: Partial<Regular> = {}): Regular => ({
  id: 0,
  name: 'Mochi Whisker',
  coat: 'tabby',
  breed: 'calico',
  trait: 'neutral',
  favoriteRecipe: 'shoyu',
  visits: 1,
  affection: 0,
  lastSeenDay: 0,
  ...over,
});

describe('breeds & traits', () => {
  it('every breed maps to a valid trait and vice-versa ids are exhaustive', () => {
    for (const breed of BREED_IDS) expect(TRAIT_IDS).toContain(breedTrait(breed));
    expect(new Set(TRAIT_IDS).size).toBe(TRAIT_IDS.length);
    expect(new Set(BREED_IDS).size).toBe(BREED_IDS.length);
  });

  it('randomBreed is deterministic for a given seed', () => {
    const a = randomBreed(createRng(42));
    const b = randomBreed(createRng(42));
    expect(a).toBe(b);
    expect(BREED_IDS).toContain(a);
  });

  it('trait modifiers are non-zero exactly where the trait promises', () => {
    expect(traitPatienceModifier('impatient')).toBeLessThan(1); // higher urgency
    expect(traitPatienceModifier('neutral')).toBe(1);
    expect(traitQualityBar('picky')).toBeGreaterThan(0); // higher accept bar
    expect(traitQualityBar('neutral')).toBe(0);
    expect(traitTipBonus('generous')).toBeGreaterThan(0); // flatter
    expect(traitTipBonus('picky')).toBeGreaterThan(0); // picky pays for the effort
    expect(traitArrivalOffset('night-owl')).toBeGreaterThan(0); // arrives late
  });

  it('impatient customers have a lower patience budget than neutral', () => {
    const base = 20;
    const impatient = createCustomer(
      0,
      'tabby',
      { recipeOrder: ['shoyu'], likedToppings: [] },
      base,
      0,
      {
        trait: 'impatient',
      },
    );
    const neutral = createCustomer(
      1,
      'tabby',
      { recipeOrder: ['shoyu'], likedToppings: [] },
      base,
      0,
      {
        trait: 'neutral',
      },
    );
    expect(impatient.patience).toBeLessThan(neutral.patience);
  });

  it('spice-lover orders its favourite topping as an extra more eagerly', () => {
    // A spice-lover likes chashu; over many draws it should request it as an extra
    // more often than the base 0.15 chance a neutral customer gets. shoyu carries
    // chashu only as an extra (not a default), so it exercises the extras picker.
    const liked: CatCustomer = createCustomer(
      0,
      'tabby',
      { recipeOrder: ['shoyu'], likedToppings: ['chashu'] },
      20,
      0,
      { trait: 'spice-lover' },
    );
    const neutral: CatCustomer = {
      id: 1,
      coat: 'tabby',
      patience: 20,
      preferences: { recipeOrder: ['shoyu'], likedToppings: [] },
      name: '',
      breed: 'ragdoll',
      trait: 'neutral',
      isRegular: false,
      visits: 0,
    };
    const price = (): number => 10;
    let spiceExtras = 0;
    let neutralExtras = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const a: Order = generateOrder(i, liked, 3, price, createRng(i));
      const b: Order = generateOrder(i, neutral, 3, price, createRng(i + 1000));
      if (a.extraToppings.includes('chashu')) spiceExtras += 1;
      if (b.extraToppings.includes('chashu')) neutralExtras += 1;
    }
    expect(spiceExtras).toBeGreaterThan(neutralExtras);
  });
});

describe('regulars', () => {
  it('generates deterministic names from a seed', () => {
    expect(generateName(createRng(7))).toBe(generateName(createRng(7)));
    expect(generateName(createRng(7)).length).toBeGreaterThan(0);
  });

  it('registerVisit increments visits and caps affection', () => {
    const advanced = registerVisit(reg({ affection: 9 }), 3);
    expect(advanced.visits).toBe(2);
    expect(advanced.affection).toBe(10);
    expect(advanced.lastSeenDay).toBe(3);
  });

  it('perks unlock at affection thresholds', () => {
    expect(regularPerks(reg({ affection: 0 }))).toEqual({ tipBonus: 0, wordOfMouth: 0 });
    expect(regularPerks(reg({ affection: 3 }))).toEqual({ tipBonus: 1, wordOfMouth: 0 });
    expect(regularPerks(reg({ affection: 6 }))).toEqual({ tipBonus: 2, wordOfMouth: 1 });
    expect(regularPerks(reg({ affection: 9 }))).toEqual({ tipBonus: 3, wordOfMouth: 2 });
  });

  it('whoReturns prefers favourite dishes and is deterministic per rng', () => {
    const roster = [
      reg({ id: 1, favoriteRecipe: 'miso' }),
      reg({ id: 2, favoriteRecipe: 'tonkotsu' }),
    ];
    const menu = ['shoyu', 'miso'] as const;
    const a = whoReturns(roster, [...menu], createRng(5));
    const b = whoReturns(roster, [...menu], createRng(5));
    expect(a.returning.map((e) => e.regular.id)).toEqual(b.returning.map((e) => e.regular.id));
    for (const entry of a.returning) {
      // A returning regular always orders an on-menu dish.
      expect(menu).toContain(entry.recipeId);
    }
  });
});

describe('service + settle integration', () => {
  it('served walk-ins convert into persistent regulars with a name and favourite dish', () => {
    const state = createSimState(1337, 'cart');
    const plan = planService(state);
    const served = plan.visits.find((v) => v.outcome === 'served');
    expect(served).toBeTruthy();
    const settled = settleDay(state, plan, {});
    // Every served customer should have seeded a regular (first day: all walk-ins).
    expect(settled.state.regulars.length).toBeGreaterThan(0);
    const first = settled.state.regulars[0]!;
    expect(first.name.length).toBeGreaterThan(0);
    expect(first.visits).toBe(1);
    expect(first.affection).toBe(1);
    expect(first.favoriteRecipe).toBe(served!.recipeId);
  });

  it('a regular who returns advances affection and is marked on the plan', () => {
    const state = createSimState(1, 'cart') as SimState;
    // Seed a devoted regular whose favourite dish is on the default menu.
    const seeded: SimState = {
      ...state,
      regulars: [
        {
          id: 0,
          name: 'Tama Noodle',
          coat: 'tabby',
          breed: 'calico',
          trait: 'neutral',
          favoriteRecipe: 'shoyu',
          visits: 5,
          affection: 9,
          lastSeenDay: 1,
        },
      ],
    };
    const plan = planService(seeded);
    expect(plan.visits.some((v) => v.isRegular && v.regularId === 0)).toBe(true);
  });

  it('a night-owl regular arrives later than a neutral regular in the same slot', () => {
    const mk = (trait: 'night-owl' | 'neutral'): SimState => {
      const s = createSimState(7, 'cart');
      return {
        ...s,
        regulars: [
          {
            id: 0,
            name: 'Yuzu Tail',
            coat: 'tabby',
            breed: 'tuxedo',
            trait,
            favoriteRecipe: 'shoyu',
            visits: 9,
            affection: 10,
            lastSeenDay: 1,
          },
        ],
      };
    };
    const night = planService(mk('night-owl'));
    const neutral = planService(mk('neutral'));
    const nightVisit = night.visits.find((v) => v.regularId === 0);
    const neutralVisit = neutral.visits.find((v) => v.regularId === 0);
    expect(nightVisit).toBeTruthy();
    expect(neutralVisit).toBeTruthy();
    expect(nightVisit!.arriveBeat).toBeGreaterThan(neutralVisit!.arriveBeat);
  });

  it('a generous regular tips a flat trait bonus on top of the quality tip', () => {
    // Same plan differs only by trait; the generous regular must earn strictly more
    // tips than the neutral one (trait bonus), all else equal.
    const mk = (trait: 'generous' | 'neutral'): SimState => {
      const s = createSimState(11, 'cart');
      return {
        ...s,
        regulars: [
          {
            id: 0,
            name: 'Sakura Fur',
            coat: 'tabby',
            breed: 'ginger',
            trait,
            favoriteRecipe: 'shoyu',
            visits: 9,
            affection: 10,
            lastSeenDay: 1,
          },
        ],
      };
    };
    const generous = settleDay(mk('generous'), planService(mk('generous')), {}).report;
    const neutral = settleDay(mk('neutral'), planService(mk('neutral')), {}).report;
    expect(generous.tips).toBeGreaterThan(neutral.tips);
  });

  it('planService is deterministic for a given state (same seed + regulars)', () => {
    const mk = (): SimState => createSimState(99, 'cart');
    const a = planService(mk());
    const b = planService(mk());
    expect(a.visits).toEqual(b.visits);
  });
});
