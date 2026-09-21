# Route-Planning–Flying Loop ("Drift Captain")

Source of truth for the nav/transit loop vision, distilled from a design grill (2026-09-10).
Current implementation refs: `packages/sim-core/src/world/ship/navTransit.ts`,
`packages/sim-core/src/world/ship/engine.ts`, `apps/web/src/harbor/navConsoleModel.ts`,
`apps/web/src/webgl/ui/UiScreens.ts`.

## 1. Fantasy

You are not a stick-and-rudder pilot. You are a **planner + caretaker**:

- Plot an open, foggy chart for free at the nav console.
- Live inside the ship while it flies itself — babysit heat/tune, watch cargo math, discover things out the windows.
- Getting stranded is content, not game over.

## 2. Today (what exists)

- Four hubs: `hub_a` (MERIDIAN GATE) / `hub_b` (SOLACE YARDS) / `hub_c` (CINDER DOCK) / `hub_d` (VESPER PORT), plus four drift planets and four moons as POI stops.
- Phases: `docked → spooling (SPOOL_S=0s, lights off the tick the drive is ready) → in_transit (guidance-predicted leg times) → docking (DOCKING_S=0s, instant on arrival) → docked`. No dead air around flights.
- Departure gates on the full first-hop fuel cost but subtracts nothing; the bunker drains continuously in flight at `fuelRateForLeg(tier, thrust)` per real second. Mid-leg second half with `effectiveTune < LOW_TUNE_BURN (0.4)` burns a `HEAT_EXTRA_FUEL` lump or sets `flameout` when dry.
- Transit speed scales with `speedFactor = 0.55 + 0.45 * effectiveTune`. Tune decays underway (`TUNE_DECAY_PER_S=0.004`), wear caps tune (`WEAR_TUNE_PENALTY=0.5`, `WEAR_PER_LEG=0.15`).
- Server hard-rejects plot with `no-fuel` / `no-power` / `already-underway` / `same-hub` (`plotCourse` in `navTransit.ts`).
- Client: nav console shows PORT / DEST / ETA / FUEL / COUNTDOWN + FLAMEOUT flag. Plot allowed only when `phase === 'docked'`. Viewport stays interior top-down; transit is a HUD progress countdown.

## 3. Target loop

### 3.1 Plan (at nav console, interior)

- **Open chart**: 3–4 hubs + drift POIs (derelicts, beacons, survey caches). Fixed nodes v1 — no free-click waypoints yet.
- **Fog-of-war chart**: routes start unknown. Discovery = **fly + look** — entering a hop surveys its POI stop (`ShipSystems.surveyed`, per vessel, survives tows and dockings). Bar rumors seed hints; kiosk-bought charts are a later lever, not v1.
- **Full manifest view** (one panel): `CHART n/n KNOWN` or `?? <rumor>` for the first unknown, `HAUL <good> <hereSr><there>` best sell spread from port, `LANE <short IDs with ??>` while a chain flies, plus fuel projection, heat warning, next-hop ETA. Unknown POIs render as `??` + rumor hint, never full stats. Discovery flows over `CHART_STATE` (nodes with known flags, per vessel).
- **Free to plot, pay en route**: plotting costs nothing upfront. Each segment burns fuel as flown. Under-provisioning risks flameout instead of a launch reject. Keeps new players moving, makes veterans gamble.
- **Soft warning, not hard gate (client)**: when projected need exceeds holds, keep PLOT enabled but show a warning line (see §6). Server keeps its authoritative `no-fuel` reject until the pay-en-route migration lands.

### 3.2 Commit (spool)

- Instant light-off: reactor must stay hot/powered, spool ≥ `SPOOL_READY (0.8)` + ≥1 fuel to commit, checked the same tick. CANCEL only here (one-tick window).

### 3.3 Fly (passive, interior + HUD)

- **No steering.** Viewport stays interior; transit = progress ring + route line + next-hop ETA + star streaks in windows only. No exterior cam, no top-down spaceship sprite v1.
- **Leg math = sum of segments.** Each hop adds time/fuel; detours cost you. One plot commits the whole chain (no per-hop re-confirm v1).
- **Pacing: no cap, let it sprawl.** Detours add ~30–60s each; a grand tour may run ~10 min. Survival (rations/water/O2) is expected to pressure long hauls — balance lever, not a timer cap.
- **Mid-leg drama = heat + tune decay only.** Reactor drifts hot, tune sags underway; neglect triggers the existing extra-burn → flameout path. Wear/brownouts, combat/boarding, and power-triage spikes are explicitly out of v1.

### 3.4 Strand or dock

- **Stranded-is-content** (shipped): flameout → drift with three ways back. **Ration**: the world clock keeps running, so waiting costs food/air. **Repair/refuel**: restoring a cell aboard (unpack fuel crates) plus a hot reactor burns the owed cell and resumes the leg immediately, standing the drone down. **Hail**: `HAIL` at the nav console (flamed-out only) starts a 75s rescue-drone countdown that covers the owed cell on arrival; re-hailing no-ops. EVA salvage and co-op rescue tows are later levers.
- Waypoint refuge: limping to the nearest discovered POI/beacon beats auto-tow home.
- DISTRESS tow (flat 25cr) stays as the instant paid fallback: time vs credits.
- Docking stays auto (~10s), port flips, sell, re-plot.

### 3.4b Plot-what-you-click (shipped)

- Throttle is a per-voyage draft setting: the plan view steppers set 10-100% of the static 1g torch band (engine tiers will scale the band later). Leg clocks run brachistochrone time (`1/sqrt`) while each burn drinks near-linear fuel (`fuelPerLeg x throttle`), so full thrust reproduces the legacy game exactly and slowboating trades food, water, and reactor drift for cells. Fractional wallets display whole cells or one decimal; tows, hails, and refuels work unchanged.

- Clicking a chart node drafts exactly that stop — POIs are first-class destinations the ship holds at, never auto-extended with an unasked Kepler leg. Clicks chain into multi-stop drafts (repeats of the tail ignored); `CONFIRM` flies the chain, `CLEAR`/close/re-pick abandons it.
- POI ports behave: arrival holds at site (dock seals and station moves are hub-only and no-op safely), tows always land on a hub dock (nearest hub end, else any hub aboard, else New Anchorage), and the chart screen opens behind a pure starfield (ship interior hidden while plotting).

### 3.5 Why fly (economy)

- **Simple crates + per-hub prices v1**: today's 10-unit seals, buy-low/sell-high, price differs per hub. No mass/power coupling, no perishables, no timed-contract penalties v1.
- Contracts/job-board feed in as price signals only.

## 4. Non-goals (v1)

- Manual helm, exterior/bridge cam, free-click waypoints.
- Mass slows you / overload gambles, perishable/cold-chain goods, smuggling/customs heat.
- Mid-leg combat, boarding, power-demand spikes, wear breakdowns.
- Co-op rescue tows, EVA salvage self-rescue.

## 5. Chart data shape (slice 1a shipped)

Implemented in `packages/sim-core/src/world/ship/chart.ts` (`planVoyage`):

```ts
// One committed voyage = ordered hops. ETA/fuel = sum over hops.
interface ChartHop { fromId: string; toId: string; legS: number; fuel: number; known: boolean }
interface VoyagePlan { hops: ChartHop[]; totalS: number; fuelNeeded: number; unknowns: string[]; heatRisk: boolean; destId: string }
```

- Graph: `hub_a` <-> `hub_b` direct lane (1.0 leg) plus `poi_kestrel` (0.4/0.8) and `poi_vigil` (0.5/0.7) detours; kestrel<->vigil 0.3. Detour via Kestrel totals 1.2 legs (~+30s at T0).
- `legS` per hop = `fraction * legDurationSeconds(tier) / speedFactor`, so direct-hop projection matches the leg machine exactly (150/110/80s).
- `fuelNeeded` = summed per-hop burn-rate cost + `HEAT_EXTRA_FUEL` reserve when `effectiveTune < 0.4` (mirrors the mid-leg extra burn).
- Uncharted pairs fall back to a full-leg cost so free plotting stays projectable later.
- Execution is multi-hop since slice 1b: the leg machine ticks each hop, drains the bunker continuously in flight, and flames out the moment it runs dry (mid-leg or at a hop boundary). A hailed rescue drone refuels the estimated remainder on arrival.
- Discovery state (known/unknown + rumor hints) persists per crew/ship — TBD store; callers pass `knownIds` (hubs known by default).

## 6. Low-fuel soft warning (shipped)

Client-only planning aid. Never blocks plotting; server stays authoritative.

- `fuelNeeded` comes from `planVoyage` single-hop projection (1 cell + 1 reserve when cold) — the web model no longer duplicates sim fuel rules.
  - `systems === null` → assume nominal tune so the panel degrades gracefully.
- Show `LOW FUEL: NEED x HOLD y` on the nav panel only while `phase === 'docked'` and holds < need.
- Copy budget: ≤26 chars, fits the 392px inner panel at 13px monospace (~50-char budget).
- Wording lives in `navConsoleModel.fuelWarning` / `heatWarning` (`HEAT RISK: TUNE LOW`, docked-only like fuel); rendering lives in `UiScreens.navTextsFor` as stacked `warning`-color rows above FLAMEOUT.

Examples:

| holds | tier | tune | need | panel |
| --- | --- | --- | --- | --- |
| 1 | 0 | 1.0 | 1 | no warning |
| 0 | 0 | 1.0 | 1 | `LOW FUEL: NEED 1 HOLD 0` |
| 1 | 0 | 0.2 | 2 | `LOW FUEL: NEED 2 HOLD 1` |

## 7. Open questions

1. Long-haul fill: does survival decay alone carry a 10-min leg, or do we need timed contracts to force hot-vs-safe tune gambles?
2. Soft vs hard gate migration: when pay-en-route lands, does the server drop `no-fuel` entirely or keep a 1-cell departure minimum?
3. Discovery persistence: per-ship, per-crew, or per-account?
4. Stranded economy (answered v1): flat 25cr instant tow vs 75s ration-pressure hail vs refuel self-rescue. Distance-based or haggled pricing stays a later lever.

## 8. Implementation slices

All slices shipped: chart graph + `planVoyage` projection, multi-segment `NavState`
execution, waypoint intents, `CHART_STATE` broadcast + manifest, two-step commit +
big chart screen, physics transfer plot, and stranded triage. Per-step details live
in git history; the sections above describe the shipped loop.