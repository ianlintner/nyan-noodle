/**
 * Early-game balance knobs (Cart -> Stall -> Small Shop), in one place.
 *
 * Target curve, checked by `balance.test.ts` over 8 seeds with the reference autopilot
 * and reproduced by `npm run sim:headless`:
 *   - Stall by day 3-4, Small Shop on day 6-8, revenue rising every tier.
 *
 * Levers, roughly in order of impact:
 *   - `PLAYER_BOWLS`: the owner's daily cook cap. This, not seats, is the early bottleneck.
 *   - `TIER_UNLOCK`: coin + star gates per tier. Stars come from quality, so the star gate
 *     paces the curve and the coin gate stops a lucky day from skipping a tier.
 *   - `TIER_PRICE_PREMIUM`: bigger venue, pricier bowl, so a tier-up raises income per bowl
 *     and not only volume.
 *   - `STOVE_COST`: a second/third stove is the first purchase after every tier-up.
 * Anything not here (recipe prices, quality model, demand) lives with its module.
 */

/** Bowls the owner can cook per day before staff/burners. */
export const PLAYER_BOWLS = 10;

/** Coin and Reputation Star gates to buy each shop tier (Cart is free). */
export const TIER_UNLOCK = {
  cart: { cost: 0, reputation: 0 },
  stall: { cost: 80, reputation: 0.5 },
  'small-shop': { cost: 180, reputation: 2 },
} as const;

/** Bowl price multiplier per tier. */
export const TIER_PRICE_PREMIUM = { cart: 1, stall: 1.25, 'small-shop': 1.5 } as const;

/** Catalog price of one stove. */
export const STOVE_COST = 60;

/** Reference autopilot: coins it never spends below, so it can always restock. */
export const AUTOPILOT_RESERVE = 40;
/** Reference autopilot: start saving for the next tier this many stars before its gate. */
export const SAVE_AHEAD_STARS = 1;
