---
'@kybernetes/protocol': minor
'@kybernetes/sim-core': patch
'@kybernetes/web': patch
---

Rooms-only atmos overlay with drag arrows, dead cell wire cleanup, hull isolation proof

- AtmosOverlayPass renders room rects only: all cell naming, cell buffers, and
  the ATMOS_CELL shaders are gone (renamed ATMOS_ROOM), with no behavior loss.
- Overlay now draws per-room drag arrows from broadcast windX/windY in every
  atmos mode, so vent pull is visible in-game without opening a report.
- Removed the dead atmosDirtyCells cell-grid field from TelemetryDeltaBroadcast.
- Verified ship/station isolation: hull sims share no Room or Portal objects,
  every portal endpoint resolves inside its own hull, stepping a venting ship
  leaves station pressures bit-identical, and vent lists never cross hulls.
