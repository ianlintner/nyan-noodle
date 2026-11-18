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

No backend, accounts, ads or IAP.
