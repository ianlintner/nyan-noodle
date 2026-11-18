# Nyan Noodle

A free-to-play browser cat ramen shop management game: pixel art with voxel-style shading, a cozy Cook/Serve daily loop, and incremental shop growth (Cart -> Stall -> Small Shop and beyond).

See [PLAN.md](PLAN.md) for the stack, art direction, MVP scope and card breakdown, and [ARCHITECTURE.md](ARCHITECTURE.md) for module boundaries and where new code belongs.

## Status

MVP feature-complete on the stacked PR chain (#1-#8 plus this integration pass): sim core, art pipeline, shop scene, cooking minigames, build mode, day loop with saves, and a balanced Cart -> Stall -> Small Shop curve. No backend, accounts, ads or IAP. Not yet: audio, a real bitmap font, tiers beyond Small Shop, mobile/touch polish.

## Play

```sh
npm install
npm run dev          # http://127.0.0.1:5173
```

1. **Title**: _New game_ (or _Continue_ an autosave, _Import_ / _Export_ a save string).
2. **Prep**: choose the menu, nudge prices (±3 steps of 10%), buy stock (3c a bowl). **Open the shop!**
3. **Kitchen**: the ticket rail shows today's first seated cats. Click a ticket and cook it by hand:
   - broth: hold `SPACE`/`W` to keep the needle in the green band,
   - noodles: `SPACE` to stop the timer in the sweet spot for the ordered doneness,
   - toppings: keys `1`–`6` in order, then `SPACE` to serve.

   Good bowls earn bigger tips and more Reputation Stars. **Open doors!** starts the service; any ticket you skipped is cooked at your usual quality.

4. **Service**: cats queue, sit and eat while you and your staff cook. Speed it up or _Skip day_.
5. **Report**: sales, tips, costs, complaints (queue / sold out / kitchen too slow), stars and unlocks. The game **autosaves** here.
6. **Upgrades** (stars + coins): recipes (Miso, Tonkotsu), mastery, knives / burner / signboard, staff cats. **Build** mode places stools, stoves, tables and decor, and buys the next shop tier.

Expected pace: Stall around day 3–4, Small Shop around day 7–8.

## Develop

Phaser 4.2.1 + TypeScript + Vite, npm workspaces, Vitest, ESLint, Prettier, Playwright. Node >= 22.12.

| Path           | Purpose                                                               |
| -------------- | --------------------------------------------------------------------- |
| `packages/sim` | Pure deterministic TS simulation (no Phaser/DOM, seeded RNG)          |
| `apps/game`    | Phaser rendering, UI, input; `src/theme/` holds palette + HUD helpers |
| `e2e`          | Playwright specs (run against the built, previewed bundle)            |
| `scripts`      | Art generation, asset validation, headless sim, architecture tests    |

```sh
npm run check            # typecheck + lint + format:check + test + validate-assets + build
npm run e2e              # Playwright (first: npx playwright install chromium)
npm run sim:headless     # per-day CSV curve of the reference autopilot (SIM_SEED, SIM_DAYS)
npm run assets:generate  # regenerate the sprite atlas, then npm run validate-assets
npm run format           # Prettier write
```

Dev URLs jump straight into a scene: `?scene=boot|title|prep|shop|service|report|upgrades`. The shop takes `seed=`, `tier=cart|stall|small-shop`, `speed=1..16`, `mode=build`, `coins=`, `rep=`; the service sandbox (no save) takes `seed=` and `count=1..8`. The boot scene shows the palette and HUD chrome.

### Balance

Early-game knobs (cook cap, tier coin/star gates, tier price premium, stove cost, autopilot reserve) live in `packages/sim/src/balance.ts`. `balance.test.ts` pins the curve over 8 seeds and `e2e/mvp.spec.ts` plays 8 days in the browser and checks them against the headless sim day for day. Screenshots of that run are in `docs/mvp/`.

### Systems

- **Shop scene** (`apps/game/src/shop/`): the sim's `planService` produces a per-day timeline (arrive, queue, seat, leave); `ShopDirector` plays it back with A\* paths, y-sorted sprites and an integer-zoom camera (`+`/`-`/wheel, arrows/WASD/drag). Screenshots: `docs/shop/`.
- **Build mode** (`apps/game/src/build/`, rules in `catalog.ts`, `layoutRules.ts`, `build.ts`): ghost preview, `R` to rotate, free **Move**, **Sell** at 50%. The doorway and each stove's cook tile stay clear, every stool must be reachable, seats are capped by tier and stoves, decor raises demand. A tier upgrade grows the grid and re-centres the layout. Screenshots: `docs/build/`.
- **Kitchen** (`apps/game/src/service/`): the scene measures input; `measure.ts` turns it into `CookMeasurements` and `packages/sim/src/cooking.ts` scores it (tips, rush, combo, failed bowls). `chef.ts` picks the day's hand-cooked tickets and `settleDay(..., { chefQualities })` applies them.
- **Day loop & saves** (`apps/game/src/meta/`, sim `prep.ts`, `progression.ts`, `day.ts`): every action returns the next state or a typed reason. Saves are a versioned JSON envelope in IndexedDB with a localStorage fallback (`save.ts`, `migrations.ts`, `storage.ts`); damaged or newer saves are reported, never overwritten. Screenshots: `docs/daylog/`.
- **Pixel config**: native 480x270 (16px tiles), `pixelArt: true`, integer-only zoom (`apps/game/src/config.ts`). Palette tokens in `apps/game/src/theme/palette.ts`; the art pipeline reads them. Text uses a monospace stand-in at the 8px base.

## Play

Live build: _URL pending first deploy_ — after the one-time setup below, paste the Static Web App's default hostname here (`https://<name>.azurestaticapps.net`). Every PR into `main` also gets an automatic preview environment (URL is posted as a PR comment by the deploy action).

## Deploy (Azure Static Web Apps)

`.github/workflows/azure-static-web-apps.yml` builds with `npm run build` and uploads the prebuilt `apps/game/dist` (`skip_app_build: true`; no Oryx build, no API). Pushes to `main` go to production; same-repo PRs get a preview that is closed when the PR closes. `apps/game/public/staticwebapp.config.json` is copied into `dist` and provides the SPA fallback, immutable caching for hashed `/assets/*`, `no-cache` for `index.html`, and basic security headers.

One-time setup (not done by the workflow; no Azure resources or secrets are created by this repo):

1. Create a **Free**-plan Static Web App (no Functions, no linked backend) in the Azure portal or with `az staticwebapp create --sku Free`. Choose "Other"/custom deployment source, not GitHub-managed, so Azure does not generate a second workflow.
2. Copy its deployment token (portal -> Static Web App -> Manage deployment token, or `az staticwebapp secrets list --name <name> --query properties.apiKey -o tsv`).
3. Add it as the repository secret `AZURE_STATIC_WEB_APPS_API_TOKEN` (Settings -> Secrets and variables -> Actions).
4. Push to `main` (or re-run the workflow), then put the hostname in "Play" above.

Until the secret exists the upload/close steps are skipped (build still runs), so PRs stay green; `ci.yml` is unaffected. Rotate the token by resetting it in Azure and updating the secret.
