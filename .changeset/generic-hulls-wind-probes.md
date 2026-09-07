---
'@kybernetes/sim-core': minor
'@kybernetes/server': patch
'@kybernetes/web': patch
'@kybernetes/air-sim': patch
---

Generic multi-hull air simulation and wind probe debugging

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
