# Nyan Noodle

A free-to-play browser cat ramen shop management game: pixel art with voxel-style shading, a cozy Cook/Serve daily loop, and incremental shop growth (Cart -> Stall -> Small Shop and beyond).

See [PLAN.md](PLAN.md) for the stack, art direction, MVP scope and card breakdown.

## Stack

Phaser 4.2.1 + TypeScript + Vite, npm workspaces, Vitest, ESLint, Prettier, Playwright. Node >= 22.12.

| Path           | Purpose                                                               |
| -------------- | --------------------------------------------------------------------- |
| `packages/sim` | Pure deterministic TS simulation (no Phaser/DOM, seeded RNG)          |
| `apps/game`    | Phaser rendering, UI, input; `src/theme/` holds palette + HUD helpers |
| `e2e`          | Playwright smoke tests (run against the built, previewed bundle)      |

## Scripts

```sh
npm install
npm run dev          # Vite dev server on http://127.0.0.1:5173
npm run check        # typecheck + lint + format:check + test + build
npm run e2e          # Playwright smoke (first: npx playwright install chromium)
npm run format       # Prettier write
```

## Pixel config

Native resolution 480x270 (16px tiles), `pixelArt: true`, integer-only zoom chosen from the viewport (`apps/game/src/config.ts`). No sub-pixel movement.

## Theme

The 24-colour art-direction palette lives in `apps/game/src/theme/palette.ts`. HUD helpers (`pixelText`, `drawPanel`, `createButton`) are in `apps/game/src/theme/hud.ts`. The boot scene renders every swatch and a sample panel. The pixel font is currently a monospace stand-in at the 8px base; a real bitmap font arrives with the art pipeline card.

## Shop scene

`apps/game/src/shop/` renders the shop on a tile grid. The sim (`planService` in `packages/sim`) produces a deterministic per-day timeline (arrivals, queue, seat, leave); `ShopDirector` only plays it back with A\* paths, y-sorted sprites (depth = feet line) and an integer-zoom camera (`+`/`-`/wheel, arrows/WASD/drag to pan). Open it with `?scene=shop` (extras: `seed=`, `tier=cart|stall|small-shop`, `speed=1..16`) or the boot scene's "Open shop" button. The e2e `shop.spec.ts` plays a scripted day for each tier.

## Build mode

The **Build** button (or `?mode=build`, plus `coins=` / `rep=` dev overrides) opens the catalog panel: pick a piece, hover for a green/red ghost, click to buy, `R` to turn, **Move** (free) and **Sell** (50% refund). Rules live in `packages/sim` (`catalog.ts` data, `layoutRules.ts` validity/seats/appeal, `build.ts` actions): the doorway and the cook's tile in front of each stove stay clear, every stool must stay reachable, seats are capped by tier and by stoves, and extra decor raises demand with diminishing returns. **To Stall / Small Shop** spends coins + reputation, grows the grid and re-centres the layout (pieces that no longer fit are refunded). Screenshots: `docs/build/`.

## Service scene

`apps/game/src/service/` hosts the interactive cooking phase. A ticket rail lists the day's orders; click one and run three minigames — a broth heat-hold bar (`SPACE`/`W` to heat, keep the needle in the green band), a noodle boil timer (`SPACE` to stop it on the firm/soft sweet spot), and topping assembly (keys `1`–`6` add each required topping in order). Then press `SPACE` to serve; bowl quality drives tip, rush (fast serve) and combo (consecutive good serves) bonuses, and a failed bowl (quality below `MIN_ACCEPT_QUALITY`) resets the combo. Open it with `?scene=service` (extras: `seed=`, `count=1..8`) or the boot scene.

The scoring rules are pure and deterministic in `packages/sim/src/cooking.ts` (`scoreBowl`, `settleBowl`, `tipForQuality`, etc.); the scene only measures input and plays the sim's payout back. The measurement bridge (`apps/game/src/service/measure.ts`) converts raw minigame readings into the sim's `CookMeasurements`. `e2e/service.spec.ts` drives one scripted order through all three minigames via the `window.__nyanService` debug API and asserts the payout.

No backend, accounts, ads or IAP.
