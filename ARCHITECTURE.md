# Architecture

Nyan Noodle is two workspaces and a thin test/tooling layer. The rule that shapes everything is that the **sim decides, the game shows**.

```
packages/sim   pure deterministic TypeScript: rules, numbers, RNG, saves
apps/game      Phaser 4 scenes: render the sim's state, measure player input
e2e            Playwright against the built bundle (vite preview)
scripts        art generation, asset validation, headless sim, repo-rule tests
```

## Module boundaries

1. **`packages/sim` has no Phaser, DOM or app imports.** No `window`, `document`, `localStorage`, timers or `Math.random`. Every random draw comes from a seeded `Rng` (`rng.ts`), so a seed plus a list of player actions reproduces a game byte for byte. `scripts/architecture.test.mjs` enforces the import rule.
2. **Every sim action is a pure function** `(state, ...args) -> ActionResult` (`{ ok: true, state } | { ok: false, reason }`). Nothing mutates `SimState`; scenes swap in the returned state.
3. **The game never computes rules.** Scenes turn input into sim calls, play back what the sim returns, and render it. If a scene needs a number that affects coins, stars, quality or capacity, that number belongs in the sim.
4. **Input measurement is the only game-side logic.** The service minigames sample raw input (heat samples, a stop position, topping taps); `apps/game/src/service/measure.ts` converts it into the sim's `CookMeasurements`, and `packages/sim/src/cooking.ts` scores it.
5. **Persistence is split.** The sim owns the save format, versions and migrations (`save.ts`, `migrations.ts`). The game owns storage (`apps/game/src/meta/storage.ts`, IndexedDB with a localStorage fallback) and the live session (`session.ts`).

## The day loop end to end

```
Title -> Prep -> Kitchen (ServiceScene) -> Shop service (ShopScene) -> Report -> Prep ...
                                                      \-> Build mode     Upgrades
```

| Step     | Scene (`apps/game/src`) | Sim calls                                                        |
| -------- | ----------------------- | ---------------------------------------------------------------- |
| Prep     | `meta/PrepScene`        | `toggleMenu`, `adjustPrice`, `buyStock`                          |
| Kitchen  | `service/ServiceScene`  | `planService` + `chefTickets` (rail), `settleBowl` (per bowl)    |
| Service  | `shop/ShopScene`        | `planService` (timeline), `settleDay(..., { chefQualities })`    |
| Report   | `meta/ReportScene`      | reads `state.lastReport`; the session autosaves                  |
| Regulars | `meta/RegularsScene`    | reads `state.regulars` (`regulars.ts`, `breeds.ts`)              |
| Upgrade  | `meta/UpgradeScene`     | `unlockRecipe`, `trainMastery`, `buyEquipment`, `hireStaff`, ... |
| Build    | `build/*` in ShopScene  | `placeItem`, `moveItem`, `rotateItem`, `sellItem`, `upgradeTier` |

The kitchen hands the qualities of the bowls the player hand-cooked to the shop; `settleDay` uses them for the owner's first bowls and models the rest. Skipping the kitchen (`Open doors!` straight away) uses the modelled quality for every bowl, which is exactly what the headless autopilot does, so `e2e/mvp.spec.ts` can check the browser run against `autopilotRun` day for day.

## Where new things belong

| You are adding...                                | Put it in                                                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| A tuning number for the early curve              | `packages/sim/src/balance.ts`, then rerun `npm run sim:headless` and `balance.test.ts`                           |
| A recipe, topping or ingredient                  | `packages/sim/src/recipes.ts` (data) + atlas frames in `scripts/art/`                                            |
| A furniture piece                                | `packages/sim/src/catalog.ts` + `layoutRules.ts` if it has placement rules                                       |
| A shop tier                                      | `packages/sim/src/shop.ts` + `balance.ts` gates, premium and `STOCK_CAP_BY_TIER`; layout migration in `build.ts` |
| A cat breed, trait or regular                    | `packages/sim/src/breeds.ts` / `regulars.ts`; trait icons in `apps/game/src/theme/traits.ts`                     |
| Touch or pointer handling                        | `apps/game/src/service/touch.ts` (kitchen), `shop/touch.ts` (pinch/drag); hit areas via `theme/hitArea.ts`       |
| A sound or audio setting                         | `apps/game/src/audio/` (`synth.ts` voices, `manager.ts` buses, `settings.ts` persistence)                        |
| An upgrade, staff or star-gated unlock           | `packages/sim/src/progression.ts`                                                                                |
| A change to how a day settles (tips, complaints) | `packages/sim/src/day.ts`                                                                                        |
| A cooking minigame rule or score                 | `packages/sim/src/cooking.ts`; input sampling in `apps/game/src/service/measure.ts`                              |
| A new field in `SimState`                        | `state.ts`, bump `SIM_VERSION`, add a `MIGRATIONS[n]` step and a save test                                       |
| A new screen                                     | `apps/game/src/meta/` (menus) or its own folder; register it in `main.ts`                                        |
| Drawing helpers shared by scenes                 | `apps/game/src/theme/hud.ts` (chrome) or a `*View.ts` next to the scene                                          |
| Colours                                          | `apps/game/src/theme/palette.ts` only; the art pipeline reads it                                                 |
| A sprite                                         | `scripts/art/*.mjs`, regenerate with `npm run assets:generate`                                                   |
| Reference-player behaviour for balancing         | `packages/sim/src/autopilot.ts` / `furnish.ts`                                                                   |

## File size

Keep every source file at or under **~400 lines** (`scripts/architecture.test.mjs` fails above 400). When a scene approaches the limit, split out a view (`service/stageView.ts`), a controller (`build/BuildController.ts`) or a director (`shop/director.ts`) rather than growing the scene class. When a sim module approaches it, split by concept, not by layer.

## Determinism and testing

- **Unit (Vitest):** every sim module has tests next to it. Balance is a test too: `balance.test.ts` runs the autopilot over 8 seeds and pins the tier-up days for all five tiers over 30 days, a >=1.3x takings step per tier, and no sell-outs at Ramen Bar / Grand Hall.
- **Headless:** `npm run sim:headless` (`SIM_SEED`, `SIM_DAYS`) prints the per-day CSV curve.
- **E2E (Playwright):** scenes expose a `window.__nyan*` debug API that calls the same handlers as real input. Specs use it to script play and to capture screenshots into `docs/`. The `chromium` project runs desktop specs; `iphone-touch` and `pixel-touch` run `mobile.spec.ts` with real touch events. `e2e:subpath` replays the hosting smoke under `/nyan-noodle/`.
- **Playtests:** integration passes record their exploratory sessions, findings and the 30-day balance table in `docs/playtest/`.
- **Dev URLs:** `?scene=boot|title|prep|shop|service|report|upgrades|regulars` starts straight in a scene; `shop` takes `seed`, `tier` (any of the five tier ids), `speed`, `mode=build`, `coins`, `rep`; `service` (sandbox, no session) takes `seed`, `count`.

## Economy flow (one day)

```
prep: buyStock (<= stockCap(tier)) -> planService (demand x tier, seats) -> settleDay
      revenue = bowls x price x tier premium; costs = stock + wages; stars from quality
```

Capacity has three ceilings and the binding one moves as the shop grows: owner + staff bowls (`day.ts`), seats (`shop.ts` x stoves, `layoutRules.ts`), and the pantry (`STOCK_CAP_BY_TIER`). A new tier must raise all three, or the cheapest one silently caps it (the Phase 2 playtest found Grand Hall capped by a flat 40-bowl pantry).
