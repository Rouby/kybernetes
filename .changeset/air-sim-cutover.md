---
'@kybernetes/sim-core': minor
'@kybernetes/server': patch
'@kybernetes/web': patch
---

Replace the legacy cellular air solver with air-sim as the single authoritative model

 sim-core now owns one air-sim AtmosphereSimulation per hull (vessel + station)
instead of the Float32 cell grid, compartment orifice solver, and airVenting map:

- New spatial/shipAtmosphere owner module: 13 room-uniform compartments built from
  real cubic-metre volumes, static Door portals from createInitialDoors, and breach
  / puncture / partition holes added and removed as ordinary Puncture portals.
- One sim per vessel / station: VesselSimulationState carries atmos + stationAtmos,
  ticked every frame with substepped dt, door-ratio sync, room-level fire burn and
  ECS repressurisation with life-support reserve drain.
- Room-uniform O2: summaries, vitals sampling, and boarding AI read per-room means;
  corridor keeps fwd / mid / aft thirds plus an aggregate corridor view.
- Boarding takes an authoritative air snapshot (vented rooms, 100-scale O2 health,
  suctions); direct unit-test ticks keep a door-based fallback vent model.
- Server samples ship / station / vacuum atmospheres from the owned sims and pushes
  pawns with sim-derived vent wind; web overlay renders room rects from wire
  summaries and drag uses summary-based decompression sources.
- Deletes spatial/atmosGrid, spatial/atmosPhysics, and systems/airVenting with
  their cell-based tests; adds spatial/shipAtmosphere coverage (conservation,
  determinism, breach-vs-puncture ordering, cascade isolation, portal lifecycle,
  fire starvation, ECS drain, sampling, wind).
