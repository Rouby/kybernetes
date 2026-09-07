---
'@kybernetes/protocol': minor
'@kybernetes/web': patch
---

Rooms-only atmos overlay with verifiable drag arrows

- Removed the last cell-grid rendering references: AtmosOverlayPass programs,
  buffers, and builders are room-based, ATMOS_CELL shaders renamed to
  ATMOS_ROOM, and the dead atmosDirtyCells broadcast field is gone.
- Overlay drag arrows moved into a pure, unit-tested geometry module
  (atmosOverlayGeometry): per-room quads plus shaft-plus-head arrows from
  broadcast wind, covered for calm air, threshold, direction, station rooms,
  and off-mode transparency.
- New atmos-wind e2e journey: venting a hull airlock produces solver wind on
  the live broadcast with station summaries attached.
