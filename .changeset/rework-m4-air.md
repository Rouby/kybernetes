---
'@kybernetes/sim-core': minor
'@kybernetes/web': patch
---

M4 air authority cutover: one air-sim simulation per frame bound to the portal table

- New world air authority owns an air-sim sim per frame: room volumes from hull
  specs at standard breathable air, portal areas synced from door/hole/open state
  every tick (windows and sealed doors pass nothing, destroyed doors vent),
  fixed 25ms substeps, and plain per-room readings (pressure, temp, O2, CO2,
  ECS repressurizing) attached to the world for snapshots.
- Portal wind vectors from sim momentum, room wind averages, air density, hull
  punctures for damage-driven venting, vented-room mapping, and Newtonian drag
  forces complete the probe surface the HUD and boarding slices will consume.
- Legacy `spatial/shipAtmosphere.ts` compartment model deprecated and frozen;
  deletion lands with `state.ts` in M5 once the server migrates hosts.
- Playable preview gains the authority loop: pressure tinting, wind arrows, VENT
  badges, puncture key, and live per-room telemetry with Playwright coverage.
