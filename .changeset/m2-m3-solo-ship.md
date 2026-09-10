---
'@kybernetes/protocol': minor
'@kybernetes/sim-core': minor
'@kybernetes/server': minor
---

Solo-ship trader M2+M3: reactor/engine chores and hub-to-hub transit

- M2 kernel: two-dial reactor sim (rods/coolant trims, seeded flux drift,
  nominal bands per tier, scram ladder with blackout recovery) and engine
  sim (latched spool, shared MW budget with brownouts, tune decay, wear
  caps) ticked per vessel inside tickWorld, plus scram hull damage.
- M2 wire: REACTOR_TUNE / REACTOR_RESTART / ENGINE_TUNE intents (8Hz),
  SHIP_SYSTEMS snapshots on telemetry, console-gated router, tier/fuel
  sync, hull+fuel mirroring, edge NOTICE drain, and reactor/engine/nav
  console fixtures plus matching web panels behind [E].
- M3 kernel: hub port table, hub_b station + dock, station-origin-aware
  dock crossing, port-aware gates, and the full leg machine (plot with
  named rejects, spooling, tune-scaled transit, extra fuel burn, flameout
  freeze, docking arrival, cancel, distress reset) with seal/departure and
  arrival side effects in the world tick.
- M3 wire: NAV_PLOT / NAV_CANCEL / DISTRESS intents (2Hz), NAV_STATE
  snapshots on telemetry, nav-console-gated router, nearest-hub tow with a
  floored fee in SimHost, and the web nav console (destination, ETA,
  countdown, flameout + distress) behind [E].
- Movement stops with no coast: zero drive zeroes pawn velocity the same
  tick on server and prediction.
