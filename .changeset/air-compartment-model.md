---
'@kybernetes/protocol': minor
'@kybernetes/sim-core': minor
---

Replace tuned air-loss constants with a mass-conserving compartment decompression model

Air loss is now driven by compressible-flow physics instead of tuned decay rates:

- New `spatial/atmosPhysics` core: 13 control volumes with real cubic-metre sizes,
  isentropic orifice flow (choked below pressure ratio 0.528, subsonic above), exact
  mole/energy bookkeeping, and per-opening areas (blast door 3 m2, purge vent 4 m2,
  full rupture 1 m2, kinetic puncture 40 mm reference, partition holes 40 mm).
- Open doors vent a compartment in seconds; kinetic punctures leak over minutes.
  Sealed rooms hold pressure exactly; patching or closing stops loss.
- `tickCellularAtmos` keeps its signature: the cell grid is now a view layer over
  compartment means, so HUD overlays, drag vectors, ECS repressurisation, fire,
  and server vitals all behave as before.
- Suit hypoxia keys on oxygen partial pressure instead of separate pressure/O2 gates.
- Hull weld time scales with breach size (puncture 3 s, rupture 8 s).
- Fire spread is deterministic (position-hashed, no `Math.random` in the tick).
- Protocol adds `BreachDescriptor` and `CompartmentAtmosphere` wire types;
  `hull.breaches` string ids stay wire-compatible.
- Airflow drag follows the full vent path past already-reached doorways and pushes
  along the opening normal on top of the vent, so the pull no longer stalls to zero
  for pawns standing inside doors or on hatches.
