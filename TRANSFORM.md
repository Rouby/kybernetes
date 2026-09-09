# Solo Ship Trader — Milestone Transformation Plan

Shift from `station start → hire onto ship → watch rotation` to `start on own solo ship → chores → hub-to-hub trading → supplies → upgrades`.

Locked decisions (from Q&A 2026-09-09):

- **Ownership:** persistent ship per player (ship + cargo + credits + upgrades saved).
- **Transit:** interior + abstract transit. Plot at nav console, transit runs on a timer while you keep doing chores inside.
- **Economy MVP:** small fixed catalog (3–6 goods).
- **Upgrades MVP:** reactor + engine tiers only. Buildable space / new rooms later.
- **Scope cuts:** delete hire / watch / co-op / bots now. Keep survival vitals (`hunger/thirst/fatigue/health/hypoxia` + suit) as chore pressure.
- **Failure:** hard. Neglect/destruction = lose ship / game over → restart in a starter skiff.

This plan follows `AGENTS.md §2` per milestone: protocol → simulation packages + Vitest → server → web → Vitest → 5-gate (`lint, quality, typecheck, test, build`) → changeset. Playwright on demand for human verification only.

---

## What stays, what goes

### KEEP / freeze (adapt, don't rewrite)

- `packages/sim-core/src/world/`: `types.ts`, `frames.ts`, `movement.ts`, `doors.ts`, `hullCompiler.ts`, `airAuthority.ts`, `tickWorld.ts` movement/door/air slices, `los.ts`, `fogOfWar.ts`, `survival.ts`, `content/HesperiaV2.hull.ts`, `content/StationHub.hull.ts`, `assemble.ts`.
- `packages/air-sim/src/` solver — still the only air truth.
- `apps/web/src/webgl/` passes/shaders/models, HUD structure, LOS/fog rendering.
- `packages/protocol/src/envelope.ts`, `seq.ts`, `validate.ts` pattern, `ServerSnapshot` ticked-channel idea (`SNAPSHOT 10Hz / TELEMETRY 2Hz / VITALS 5Hz`).
- `apps/server/src/SimHost.ts` accumulator/fixed-step (`20Hz`, accumulator, drop-count), `validatePipe.ts` rate-limit idea, WS teardown / `SIGINT` discipline.

### REBUILD / new

- Ownership + spawn: `sessions.ts` beacon→vessel hire registry becomes a **ship registry** (`userId → VesselFrame`). No `JOIN_BEACON` to someone else's ship, no crew cap 8, no `HIRE_OFFER` / `TALK` / `MANIFEST` crew.
- Loop logic: `world/watch.ts`, `world/crew.ts`, `world/bots.ts`, `world/schedule.ts` hire legs, `intro.ts`, `duties/quests` → archived. Replaced by `world/ship/{reactor,engine,navTransit,cargo,market,shipRecord}.ts`.
- Wire: `intents.ts` `HIRE/TALK/WATCH` intents and `snapshots.ts` `WATCH/MANIFEST/HIRE_OFFER` deleted. New `NAV/CARGO/MARKET/SHIPYARD` intents + snapshots (see M1).
- Content: one small **solo skiff hull** (not full Hesperia) + 2–3 **trade-hub variants** from `StationHub.hull.ts` with `cargo_bay + market_stall + shipyard` fixtures. `living.ts` already has `market_stall` — reuse it.
- Web loop UI: hire modal, checklist, watch timer, grade/debrief, dual/collab cards deleted. New: reactor/engine gauges with actions, nav console, market + shipyard panels, carry/crate prompt, game-over/restart.

> Note: this pivots `REWORK_PLAN.md` M5 (hire/watch). M0–M4 of that rework (protocol v2, hull compiler, frames/movement/doors, air authority) are still valid — do not throw them away. Archive, don't patch, the hire/watch layers.

---

## M0 — Pivot + archive (0.5–1d)

**Status: ✅ DONE** (implemented as an additive slice: new `world/ship` seams + `shipRecord`, protocol ship wire, `shipRegistry`, SimHost solo methods; hire/watch frozen in place, physical deletion deferred; all 5 gates green).

**Goal:** stop building hire/watch, make the cut line explicit.

1. Move to `_legacy/`: `world/watch.ts`, `world/crew.ts`, `world/bots.ts`, `world/schedule.ts` hire helpers, `intro.ts`, `duties/quests`, `protocol/intro.ts`, `protocol/actions.ts` v1 hire/duty actions, server hire/dual/collab handlers. Break imports on purpose; keep history.
2. Freeze list check: renderers, air-sim, hull compiler untouched.
3. Add stub shells (compile-green, no logic): `sim-core/src/world/ship/{reactor,engine,navTransit,cargo,market,shipRecord}.ts`, `protocol/src/shipIntents.ts`, `protocol/src/shipSnapshots.ts`, server `shipRegistry.ts`.
4. Document mapping: old `StartingRole/HireableJob → deleted`, `WATCH → NAV_STATE`, `duty → chore`, `supplies macro → ship stores`.

**Done when:** `yarn typecheck` green with stubs; no hire/watch import remains in the live path.

---

## M1 — Solo spawn + persistent owned ship (2–3d)

**Status: ✅ DONE** (daemon boots `buildSoloShipWorld` with zero NPCs/bots and no auto-transit; web handshake sends `SPAWN_ABOARD`; pawns spawn aboard the vessel, one persistent ship per `userId`; follow-ups: RESTART still lands on-station and Playwright still drives the hire journey — both owned by M6/M7).

**Goal:** launch → you are already aboard your ship, alone, saved.

- **Protocol:** `HELLO(callsign,color,clientVersion) → SPAWN_ABOARD` (no `JOIN_BEACON` to others). New `SHIP_STATUS` snapshot: `shipId, hullId, reactorTier, engineTier, credits, stores, condition`. `NOTICE` reuse for `SHIP_LOST`. Delete `HIRE/TALK/WATCH/MANIFEST-crew`.
- **sim-core `ship/shipRecord.ts`:** `ShipRecord { ownerId, shipId, hullId, reactorTier, engineTier, credits, cargo[], stores {rations,water,o2Cells,fuelCells}, condition, locationHubId, alive }`. Pure `createStarterSkiff(ownerId)`, `serialize/restore`, `wipeOnLoss()`. Vitest: round-trip, wipe, starter loadout (bare skiff, 2 rations, 1 fuel, near-empty wallet).
- **Server `shipRegistry.ts` (replaces `sessions.ts` beacon caps):** `userId → ShipRecord + VesselFrame + pawnId`. 1 pawn per ship, no NPC fill. Reconnect resumes position/ship/credits — never client-supplied. Join cooldown kept as anti-spam, beacon caps deleted.
- **`SimHost.ts`:** spawn pawn in owned vessel frame (`station_hub` spawn deleted). Per-ship world or single world with N solo vessels — decide in M1 and lock it (recommendation: one `World`, N vessel frames + N hub frames; renderer already handles frames).
- **Web:** delete `CharacterCreationModal → hire` path and schedule board / hire modal. New first-run: `Customize → Spawn aboard → ship intro card (This is your ship)`. Game-over screen shell (wired fully in M6).

**Done when:** reload resumes same ship/cargo/credits; second player gets a *different* solo ship, never the same bunk.

---

## M2 — Ship chores: reactor + engine tuning (3–4d)

**Goal:** the ship needs you. Neglect has visible, then fatal, consequences.

- **sim-core `ship/reactor.ts` (pure):**
  - State: `outputMW, tempK, stability 0–1, rodPos, coolantFlow, tier`.
  - Tick: heat ∝ output, cooling ∝ flow × tier efficiency, drift + noise (seeded). Out-of-band temp → `OVERHEAT_WARNING → scram/blackout → hull damage` (feeds M6 loss).
  - Action: `tuneReactor(rods±, coolant±)` at reactor fixture. Higher tiers: more headroom, slower drift.
  - Vitest: cold start, nominal band hold, full-rods overheat timing, scram recovery, zero-dt/no-NaN.
- **sim-core `ship/engine.ts`:**
  - State: `spool 0–1, tune 0–1, wear, tier`. Requires reactor power. `preflightSpool()` + `tuneEngine()` at engine fixture. Detuned/worn engine: slower transit (M3), higher fuel burn, misjump risk.
  - Vitest: no-power no-spool, tuned vs detuned transit-time modifier, wear accumulation.
- **Protocol:** `INTERACT(fixtureId)` extended with `REACTOR_TUNE {rodsDelta, coolantDelta}` and `ENGINE_TUNE {spoolCmd, tuneAdj}`. Rate-limit `8Hz` in `validatePipe.ts` (existing pattern).
- **Server `intentRouter.ts`:** thin map to kernel `tuneReactor/tuneEngine`. No math in router.
- **Web:** reactor + engine fixtures get `[E]` prompt + small panel (temp bar, output, spool). Keep StyleX static-create discipline; dynamic widths via inline `style`. Reuse visor gauge slots freed by watch deletion. Audio: reuse `ReactorDroneSynth` pitch tied to new telemetry (adapter only).

**Done when:** you can cold-start, stabilize, and *feel* drift — leave it alone for a full transit leg and it punishes you.

---

## M3 — Nav course + abstract hub-to-hub transit (2–3d)

**Goal:** `plot course → spool → depart → do chores → arrive → dock`.

- **Content:** 2 hub frames minimum (e.g. `HUB_A/B`) compiled from `StationHub.hull.ts` variants + one **Skiff hull** (`bridge/nav + reactor + engine nook + 4–6 cargo racks + bunk + airlock`). No hand walls — `compileHull` + airtightness/connectivity tests.
- **sim-core `ship/navTransit.ts`:**
  - `plotCourse(destHubId)`: range check vs `engineTier`, power check vs `reactorTier`, fuel check. Returns `NAV_STATE {phase: docked|spooling|in_transit|docking, destHubId, remainingS, legId}`.
  - Transit tick at fixed `dt`: `remainingS -= dt × engineSpeed(tier,tune)`. Interior sim (movement/doors/air/vitals/reactor/engine) keeps ticking — this is the chore window. Gauntlet/dock contract: `sealedUnlessDocked`; on arrival auto-dock + unseal bay mouth.
  - Vitest: plot rejects (out-of-range, underpowered, no fuel), tuned vs detuned ETA, reactor scram mid-transit extends/risks leg (no teleport), double-plot idempotency, re-dock opens bay.
- **Protocol:** `NAV_PLOT {destHubId}`, `NAV_STATE` snapshot at `2Hz` (on `TELEMETRY` channel). `SNAPSHOT.portals` already carries dock seal state.
- **Server:** schedule legs per vessel, not one global Kestrel script. `snapshotter.ts` exposes `NAV_STATE` per player.
- **Web:** nav console panel: destination list with range/fuel/ETA, `Plot → Spool → Depart` buttons, in-transit countdown + `arrival` notice. Keep player inside — no flyable ship in MVP.

**Done when:** docked → plot → depart → survive the leg doing chores → dock at the other hub, twice in a row.

---

## M4 — Physical crates: bay ↔ ship hauling (2–3d)

**Goal:** cargo is bodies in space, not just numbers.

- **sim-core `ship/cargo.ts`:**
  - `Crate { id, goodId, qty, where: bayFloor | carriedBy | rackId, pos }`. One carried crate per pawn (slows movement ~25%), N rack slots per hull (starter skiff: 4–6). `pickup/drop/deposit/withdraw` pure functions with room/fixture adjacency + LOS-agnostic range check.
  - Movement integration: carrying modifies `speed` in `movement.ts`; drop on death/incap.
  - Vitest: pickup→carry→rack→withdraw→bay round-trip, double-pickup reject, full-rack reject, carry speed penalty, drop-on-death.
- **Protocol:** `CARGO_PICKUP {crateId}`, `CARGO_DROP {}`, `CARGO_RACK {rackId}` (+ `seq`). `CARGO_STATE` in `SNAPSHOT` (crate pos/rack occupancy) at `10Hz` so renderer interpolates.
- **Server:** server-side adjacency + ownership check (can't grab another player's crate — trivially true in solo, but enforce it for future multi-ship).
- **Web:** `[E] Pick up / Set down / Stow` prompts via existing `interactTarget.ts` + `fixtureAction.ts`; carried crate rendered from `Clutter.ts` crate bit promoted to real entity (visual reuse, logic new). Rack occupancy UI in cargo nook.

**Done when:** every unit bought/sold (M5) must be physically carried at least once to count as secured/delivered.

---

## M5 — Trade + supplies economy (2–3d)

**Goal:** buy low, haul, sell high, eat/drink/breathe.

- **sim-core `ship/market.ts`:**
  - Fixed catalog v1: e.g. `rations, water, o2_cells, fuel_cells, scrap, meds` with per-hub `buyPrice/sellPrice/stock`. No dynamic pricing in MVP (tune after loop is fun).
  - Transaction model (two-layer): `BUY → crate spawns on hub bay floor + credits decrement + logical reserve`; `haul to rack → secured`; `haul back to bay + SELL → credits increment`. Unsecured crates don't count as wealth (prevents buy-sell teleport profit).
  - `stores` consumption: `fuel_cells` per leg, `rations/water/o2` per transit-minute + vitals drain (`survival.ts` already ticks hunger/thirst/hypoxia — feed it from `stores`, don't fork it).
  - Vitest: buy without funds reject, out-of-stock reject, sell requires physical bay presence, fuel-short blocks `plotCourse`, starvation path still kills via existing vitals.
- **Protocol:** `MARKET_BUY {hubId, goodId, qty}`, `MARKET_SELL {hubId, crateId}`, `MARKET_STATE {listings[]}` at `2Hz` when docked. Reuse `VITALS` channel for `credits/stores`.
- **Server:** per-hub stock ledger (in-memory; persist with ship record later). Validate funds/stock server-side.
- **Web:** market panel at `market_stall` fixture (buy/sell buttons, prices, stock, credits), stores readout in visor vitals block. No charts in MVP.

**Done when:** full loop pays: `buy → haul → transit → haul → sell` nets profit after fuel + food, twice, without debug intents.

---

## M6 — Upgrades + ship loss / game over (2d)

**Goal:** progression and stakes.

- **sim-core tiers (pure tables + `applyUpgrade`):**
  - Reactor T0→T2: `+output, +cooling efficiency, +stability`. Gates longer legs.
  - Engine T0→T2: `+speed, +range, −fuel burn, −misjump risk`. Wear rate per tier.
  - Vitest: T0 can't plot farthest hub, T1 can; upgrade cost deduction; downgrade impossible; tier affects M2/M3 modifiers.
- **Protocol:** `SHIPYARD_BUY {upgradeId}` + `SHIPYARD_STATE {offers[], installed}` at `2Hz` when docked at shipyard fixture.
- **Loss model (hard-fail):** `condition 0` (overheat fire / vacuum neglect / vitals death aboard) → `SHIP_LOST → wipe ShipRecord → NOTICE + game-over screen → Restart creates fresh T0 skiff`. No rescue in MVP. Keep `death.ts`/`bleedout` but route solo death to ship loss (no medic revive without crew).
- **Server/Web:** shipyard panel, condition gauge, overheat/fire warnings via `NOTICE`, game-over + `Restart as new captain` button. Shelve naval/boarding combat damage — air-sim breach + reactor fire is the only damage source in MVP.

**Done when:** earn → buy T1 reactor → unlock farther hub; deliberately cook the reactor → lose everything → restart clean.

---

## M7 — HUD parity + tutorial + hardening (2d)

**Goal:** every visor element fed by new channels; a new player can finish one loop unaided.

- Map every PRD visor slot: `header/beacon→shipId+hub, crew→SOLO, clearance→deleted, credits, vitals+suit, reactor/engine gauges, atmos+ECS, nav state+ETA, cargo manifest, E prompt, notices, sensor legend, dossier, room summary`. `snapshotter` coverage test: no HUD element on mock data.
- Onboarding: docked-first-leg checklist card (`1 Power → 2 Spool → 3 Plot → 4 Haul → 5 Sell`) + contextual hints. Not the old watch checklist — single solo flow.
- Tick budget: measure `20Hz` sim + `10/5/2Hz` broadcasts with 2 hubs + solo vessel + air sub-steps. No client-trusted positions, ever.
- Human pass: `yarn --cwd apps/web build` + `playwright test harbor-scenes.spec.ts` for screenshots of skiff interior, nav panel, market, in-transit chores, game-over.

**Final gate:** `yarn lint && yarn quality && yarn typecheck && yarn test && yarn build` + `yarn changeset` for touched `@kybernetes/*`.

---

## Later (explicitly out of MVP)

- **Build more space:** hull-expansion builder (new room via `hullCompiler` recompile + cost + docked-only). Needs rack-slot growth + air-room rewiring — do after tiers feel right.
- Dynamic supply/demand pricing, contracts/smuggling, fuel scooping.
- Multi-crew / passengers as optional paid help (not hire-loop roles).
- Naval/boarding combat return as a risk layer on rich legs.
- Persistent universe DB (MVP: JSON-file/in-memory `ShipRecord` store is enough).

---

## Risks / early decisions

1. **One `World` with N solo vessels** vs one world per player — lock in M1; renderer wants world-space geometry either way.
2. **Physical-crate strictness** can annoy — if hauling every unit is tedious, keep the rule but raise `qty per crate` before adding teleport shortcuts.
3. **Reactor tedium** — drift/noise constants need playtesting; chores should demand attention every ~60–90s in transit, not every 5s.
4. **Old rework collision** — freeze any further hire/watch work immediately; every new PR references this plan, not `REWORK_PLAN.md §5`.

Total: ~13–19d agent-time. First shippable slice = M1–M3 (live aboard, keep reactor alive, complete one transit), then M4–M5 makes it a trader.
