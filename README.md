# Nyan Noodle

A free-to-play browser cat ramen shop management game: pixel art with voxel-style shading, a cozy Cook/Serve daily loop, and incremental shop growth (Cart -> Stall -> Small Shop and beyond).

See [PLAN.md](PLAN.md) for the stack, art direction, MVP scope and card breakdown, and [ARCHITECTURE.md](ARCHITECTURE.md) for module boundaries and where new code belongs.

## Status

MVP feature-complete on the stacked PR chain (#1-#8 plus this integration pass): sim core, art pipeline, shop scene, cooking minigames, build mode, day loop with saves, and a balanced Cart -> Stall -> Small Shop curve. No backend, accounts, ads or IAP. Not yet: audio, a real bitmap font, tiers beyond Small Shop, mobile/touch polish.

## Play

- **GitHub Pages:** https://ianlintner.github.io/nyan-noodle/
- **Azure Static Web Apps:** https://green-plant-0c71c9f10.3.azurestaticapps.net/
- **Local dev:** `npm install && npm run dev` → http://127.0.0.1:5173

Saves live in IndexedDB with a localStorage fallback, both scoped to the browser origin. Pages (`ianlintner.github.io`) and the SWA hostname are different origins, so **each site has its own separate saves** — a game started on one does not appear on the other. Use _Export_ / _Import_ on the title screen to move a save between them.

To play from source:

```sh
npm install
npm run dev
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

## Hosting

Two production hosts serve the same prebuilt Vite bundle:

| Host                  | URL                                                  | Automated by                                                                          |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| GitHub Pages          | https://ianlintner.github.io/nyan-noodle/            | `.github/workflows/pages.yml` (push to `main` / `workflow_dispatch`)                  |
| Azure Static Web Apps | https://green-plant-0c71c9f10.3.azurestaticapps.net/ | `.github/workflows/azure-static-web-apps.yml` (push to `main`, same-repo PR previews) |

Pages builds with `VITE_BASE=/nyan-noodle/` so all URLs (including the runtime-loaded sprite atlas) resolve under the project subpath; SWA and local dev use the default `/` base. The Pages site requires repository Settings → Pages → Source = **GitHub Actions** (one-time setup). To preview that subpath locally:

```sh
VITE_BASE=/nyan-noodle/ npm run build
npm run preview -- --base /nyan-noodle/   # http://127.0.0.1:4173/nyan-noodle/
npm run e2e:subpath                     # Playwright: title → game → service, zero failed requests
```

### Deploy (Azure Static Web Apps, manual)

`scripts/deploy.sh [review|production]` deploys the checked-in build via the SWA CLI, reading the deployment token from Azure at runtime (`az staticwebapp secrets list -n nyan-noodle -g nekoc`) and passing it only to the `swa` child process with `--no-use-keychain`. It requires `az` and a logged-in account, installs the pinned CLI from `npm ci` before reading any token, runs `npm run check` plus a clean-tree gate, and allows `production` only from local `main` aligned with `origin/main`. After upload it fetches the served `index.html`, every emitted JS chunk (including the separate Phaser bundle) and both atlas files, compares their sha256 hashes with `apps/game/dist`, and checks the SWA security headers — a stale CDN, stale art or partial upload fails loudly. It forces `VITE_BASE=/` for its build, so a Pages base left in the caller's environment cannot produce broken root-hosted SWA URLs.

```sh
scripts/deploy.sh review       # review environment (default)
scripts/deploy.sh production   # main only
```

The GitHub Actions SWA workflow keeps its graceful skip when `AZURE_STATIC_WEB_APPS_API_TOKEN` is unset: the build still runs and PRs stay green, but no upload happens. Configure that secret (Settings → Secrets and variables → Actions) to enable CI deploys; `ci.yml` is unaffected either way. Rotate the token by resetting it in Azure and updating the secret.
