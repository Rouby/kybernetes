# @kybernetes/air-sim

## 0.3.1

### Patch Changes

- 01e5e60: Fix vent overcooling: room outflow now integrates exactly along (1-F)^γ for the tick's total outflow fraction, with each donor credited pro-rata so energy is conserved and portal order still does not matter. Small punctures already tracked the adiabatic curve; large breaches on small rooms no longer overshoot it by several kelvin or pin near the 1K floor. Fast cooldown itself is real physics (half pressure → ≈−32 °C) — rooms still have no wall thermal mass or heaters to rewarm them.
- 222ec04: Split `AtmosphereSimulation.calculateRoomDragForce` (cognitive 30) into pure, unit-tested helpers — `dragGasProperties`, `portalWindAt` (sink/source wind with Mach-1 cap), and `dragForceFromWind` — leaving a thin orchestration method. No physics changes; resolves the Fallow complexity target. Covered by 9 new tests including an end-to-end vent-room drag direction check.
- 90448c2: Clamp transfers against the thermal crossing point, not just mole equalization
  
  The pairwise capacity clamp allowed 90% of mole-level equalization per tick, but the outflow energy debit cools the source while heating the target, so pressures crossed on the first violent tick. The clamp is now the tighter of the mole bound and a bisection-solved thermal crossing point using the exact outflow-energy formulas, which also calms filling transients in chained rooms. The solver step is carved into single-purpose stages with no behavior change. Also delete the unused `Room.predictPressure`/`predictMoles` helpers and make the ship-atmosphere frame lookup tolerant to recorder float dust.
- 27c46b0: Vent widened breaches at their live size and prove the wall breach end to end
  
  Combat widens a live breach in place, but the air authority froze each linked throat at its birth size, so every widened hole kept venting like a fresh puncture. Air-sim `Portal` gains a height-preserving `resizeThroat`, and the per-tick area sync follows hole `areaM2` growth, so sustained fire actually tears walls open faster. Covered by a widen-sync unit test. The harbor wall-breach journey fires a sealed-suited close-range burst (muzzles past the collider never touch it; lone punctures cannot vent the bay+lobby complex on a sane timeout) and asserts vent, spend, and reload.
- e33f4ed: Generic multi-hull air simulation and wind probe debugging
  
  Ship and station air were two hardcoded fields; the game can now own any number
  of independent hulls:
  
  - New HullTopology registry (hesperia vessel + station, extensible): rooms,
    aggregates, door-link overrides, and static portals as data. Builders, breach
    parsing, partition holes, vent flood, and summaries all resolve through the
    owning hull, with boundary-tolerant door mapping.
  - VesselSimulationState carries hulls: Record<string, ShipAirState>; each tick
    routes hull-local doors, breaches, fires, and partition holes per hull and
    merges summaries. Cross-hull gauntlet doors stay out of every sim.
  - Server routes each pawn to its hull for atmosphere sampling and vent wind.
  - Wind debugging: air-sim exports DragTarget/DragResult, the test recorder
    gains addProbe/refreshLayout with per-frame entity wind/force capture, and the
    HTML report renders probe arrows, values, and metric cards. sim-core runs the
    reporter too and adds a Hesperia breach debug recording plus live addWindProbe
    readings through the hull tick.
- c3725db: Fix atmospheric flow rates and stabilize gas transport across connected rooms.
  
  - Include mixture molar mass in compressible flow and keep the choked/subsonic transition continuous.
  - Limit aggregate pressure response at both portal endpoints to avoid overshoot and negative inventories.
  - Apply gas species and thermal-content transfers simultaneously, independent of portal order.
  - Ignore nonpositive and nonfinite timesteps and add regression coverage for stability and conservation.
  - Add visual playback scenarios for empty-airlock repressurization and hot/cold gas mixing, with pressure and conservation assertions.
  - Schedule deterministic door opening/closing events at exact simulation times, record door states, and show event timelines during playback.
  - Add staged vacuum-cascade and bulkhead-isolation/repressurization scenarios, plus scheduler and portal-layout regression tests.
