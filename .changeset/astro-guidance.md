---
'@kybernetes/sim-core': minor
'@kybernetes/protocol': minor
---

Shared n-body guidance core

- New `astro` module: star-dominated system ephemeris (one mu, Kepler
  periods, exact circular kinematics) plus critically-damped rendezvous
  guidance (PD law with exact gravity cancellation) integrated by
  deterministic fixed-step RK4.
- Arrival time emerges from closed-loop integration instead of being
  imposed: vessels keep momentum, never park, and meet with matched
  velocity. Display and sim share the identical code path.
- Sim leg timers are flown, not tabled: voyage preview and hop transitions
  integrate each leg at the voyage torch setting (tier-widened band) with
  lane-table fallback; the live total rides the wire as `legTotalS`.
- Planned flights route slingshot gates around the star (dip-triggered
  tangential sidesteps, verified clear, emergent detour time).
