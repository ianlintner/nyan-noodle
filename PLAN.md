# Nyan Noodle — PLAN

Working title: **Nyan Noodle**. A free-to-play browser cat ramen shop management game: pixel art with voxel-style shading, cozy Cook/Serve daily loop plus incremental shop growth.

## Pitch / core loop
Day cycle: **Prep** (menu, stock, prices) -> **Service** (cat customers arrive, order, you and staff cook/serve; patience, combos, tips) -> **Close** (report: earnings, reputation, complaints, unlocks) -> **Build/Upgrade** (furniture, staff, recipes, bigger shop). Repeat with rising demand, new cat species/regulars, and bigger venues.

Incremental layer: Fish Coins (soft currency), Reputation Stars (gate for shop tiers / districts), Recipe Mastery (per-dish levels), Staff levels, Shop tiers: Cart -> Stall -> Small Shop -> Ramen Bar -> Grand Ramen Hall (each = bigger build grid). Prestige ("Open a new branch") is LATER.

## Stack (assumptions)
- Phaser 4.2.1 (latest) + TypeScript + Vite; npm workspaces: `packages/sim` (pure deterministic TS sim, zero Phaser imports, seeded RNG, fully unit-tested) and `apps/game` (Phaser rendering/UI/input).
- Vitest, ESLint, Prettier, Playwright smoke e2e; same toolchain as `monster-league-arcade`.
- Rendering: 2D pixel art, 3/4 top-down view on a 16x16 grid (tile 16px, native 480x270, integer scaling, `pixelArt: true`). "Voxel look" = hard 3-tone cube shading (top light / left mid / right dark) baked into furniture sprites.
- Art pipeline: procedural/scripted sprite generation (`scripts/generate-art.mjs`, like monster-league-arcade) -> atlas + validator. No paid asset APIs.
- Saves: versioned JSON in IndexedDB (localStorage fallback), migration hook, export/import string. No backend.
- Hosting: static build on Azure Static Web Apps (matches existing games). Free to play, no accounts, no ads/IAP in MVP.

## Art Direction & UI Design System (built in Card 1 as theme tokens)
- Palette (24 colours, tokens in `apps/game/src/theme/palette.ts`): ink #2b1d2e, outline #3d2b3f, cream #fff3d6, broth-gold #f2b84b, miso-orange #e8833a, chili-red #d6453d, nori-green #3f7a52, scallion #8fc66b, steam-white #f4f7f8, wood-light #c98f5a, wood-mid #9a6340, wood-dark #6b3f2e, noren-indigo #3b4a8c, night-blue #232a4d, paper-pink #f4b6c2, sakura #ec8fa7, slate #5b6475, stone #8b93a1, tatami #d9c98a, lantern-yellow #ffd86b, tabby-orange #e39a4f, cat-grey #9aa3b2, cat-black #2d2a33, cat-white #f2efe9.
- 1px dark outline (outline token) on all sprites; no pure black/white; 3-tone cube shading with fixed top-left light; no anti-aliasing; no sub-pixel movement.
- Sprites: tiles 16x16; furniture 16xN multiples; cat characters 16x24, 4 directions x (idle 2f, walk 4f), customers vary by coat palette swap + accessory overlay; UI icons 16x16; food 16x16.
- Typography: one pixel font (bitmap, 8px base, 2x/3x scale), ink on cream panels. HUD chrome: cream panel, 2px outline, 1px inner highlight, noren-indigo header band, rounded 2px corners, buttons with pressed state (1px shift).
- Mood: warm lantern-lit izakaya at dusk, steam particles, cozy not hectic. Audio: lo-fi loop + SFX (later card).

## MVP scope (must-haves)
1. Seeded deterministic sim: day clock, customers (patience, orders), recipes, economy, reputation.
2. Shop scene on grid: seats, counter, stove, cat customers pathing in/out, staff.
3. Cook/Serve service loop with 3 active cooking minigames (broth heat timing, noodle boil timer, topping assembly) + ticket rail + serve.
4. Build mode: place/move/sell furniture from catalog, seat/stove capacity effects, decor appeal.
5. Progression: end-of-day report, upgrades, hire staff, unlock recipes, shop tier expansions (Cart -> Stall -> Small Shop at MVP).
6. Save/load + deployable static build.

Non-goals for the MVP (moved to Phase 2/3 below): cosmetics shop, prestige branches, cloud saves, events/seasons, mobile touch polish. Still out of scope: monetization, accounts, ads, multiplayer/visiting shops, localization.

## Milestones / cards
| # | Title | Depends | Assignee | Route | Acceptance |
|---|---|---|---|---|---|
| 1 | Scaffold: toolchain, CI, theme tokens, README, empty Phaser boot scene | - | coder-claude | smart-v2 | `npm run check` green; `npm run dev` shows boot scene w/ palette swatches |
| 2 | Sim core: clock, RNG, recipes, customers, orders, economy, reputation (pure TS) | 1 | coder-claude | smart-frontier-v2 (complex) | `vitest` sim suite; 30-day headless sim deterministic by seed |
| 3 | Art generation pipeline: tiles, furniture, cats, food, icons + validator | 1 | coder-claude | smart-v2 | `npm run assets:generate && npm run validate-assets`; contact-sheet PNG inspected |
| 4 | Shop scene: grid renderer, camera, pathfinding, seated cat customers, staff | 2,3 | coder-claude | smart-v2 | Playwright smoke: customers enter, sit, leave; screenshot reviewed |
| 5 | Service loop: ticket rail + 3 cooking minigames + serve/score/tips | 4 | coder-claude | smart-frontier-v2 | sim-backed tests + e2e plays a scripted service |
| 6 | Build mode: catalog, place/move/sell, validity, capacity & appeal effects, shop tier expansion | 4 | coder-claude | smart-v2 | unit + e2e build-and-serve |
| 7 | Day loop meta: prep menu, end-of-day report, upgrades, staff hiring, recipe unlocks, save/load (IndexedDB, versioned) | 5,6 | coder-claude | smart-v2 | save round-trip tests; reload keeps state |
| 8 | Deploy: Azure Static Web Apps workflow + preview, README play link | 1 | coder-claude | smart-v2 | CI deploy workflow (local file if Workflows perm denied) |
| 9 | MVP integration check, balance pass (7-day playthrough), architecture consolidation, README | all | planner-claude | smart-planner | headless 7-day sim shows growth curve; ARCHITECTURE.md |

Cards 2 and 3 run in parallel after 1. Release in waves. PRs: Copilot review -> Ian approval -> guarded squash merge.

MVP: **done** (#9, #10, #11).

## Phase 2 — done
| Item | PR | Notes |
|---|---|---|
| Hosting: Pages mirror + Cat Herding Games hub under `/nyan-noodle/` | #14, #15, #16 | subpath e2e in CI |
| Procedural audio, settings panel, gameplay SFX | #13 | settings persist outside saves |
| Cat regulars, breeds and traits | #12 | `regulars.ts`, `breeds.ts`, Regulars scene |
| Ramen Bar and Grand Ramen Hall tiers | #17 | 5 tiers total |
| Touch input and responsive layout | #18 | iPhone/Pixel e2e projects |
| Integration: playtest, 5-tier balance, docs | this pass | per-tier pantry fixes the Grand Hall sell-out; report in `docs/playtest/` |

30-day curve (8 seeds): Stall day 3, Small Shop 6-8, Ramen Bar 12-13, Grand Hall 22-23; every tier earns >=1.3x the last.

## Phase 3 — proposed
Still no backend-dependent gameplay, accounts, ads or paid currency. Order is by player value.

| # | Title | Depends | Scope / acceptance |
|---|---|---|---|
| 3.1 | Events and seasons | - | sim `events.ts`: seeded calendar (festival days, rainy days, seasonal dish), demand/price modifiers, one limited recipe per season. Fixes the Ramen Bar plateau (playtest F2). Balance test pins event days. |
| 3.2 | Prestige branches ("Open a new branch") | 3.1 | after Grand Hall, reset to Cart with a permanent branch perk (recipe start, staff level, decor); stars past 5.0 feed branch rank (F3). Save migration + 30/60-day curve test. |
| 3.3 | Cosmetic-only shop | 3.2 | noren, lanterns, cat outfits bought with earned Fish Coins / branch tokens only. No real money, no gameplay stats. Atlas frames + build-mode catalog tab. |
| 3.4 | Delivery / catering | 3.1 | second order channel: delivery tickets with travel time and a courier staff cat; capacity shared with the dining room. |
| 3.5 | Cloud saves (opt-in, export-first) | - | keep IndexedDB as source of truth; optional sync via the user's own file/storage (e.g. a save-file download/upload or a third-party storage picker). No Nyan Noodle accounts or server. Conflict = newest-wins with backup. |
| 3.6 | Polish carry-overs | - | phone landscape scaling decision (F4), deterministic kitchen e2e (F5), real bitmap font. |

## Later
Multiplayer/visiting shops, localization, lexiconlang-generated cat names, music beyond the procedural loop.
