---
'@kybernetes/sim-core': minor
'@kybernetes/web': patch
---

Cutover C3: render data rebacked on compiled harbor hulls

- `spatial/deck.ts` + `spatial/doors.ts` keep every export name and shape but
  compile all data from the harbor hull specs: bare room ids in world/local
  frames, namespaced door ids joining live snapshot portals, doors shut by
  default, stations deferred, plus a framed `harborStatic()` view for clients.
- Client prediction dogfoods the server: new `predictStep` (same resolver as
  `collidePawn`) and `withSnapshotStates` (authoritative portal overlay where
  destroyed doors become connecting holes); the harbor client collides
  predictions against live `collidersForFrame` output.
- Frozen-pass data follows the reback (overlay station ids + corridor
  thirds, DeckPass floor-pattern keys); pass logic untouched.
- Adapter tests updated to harbor truth; tests for C4-owned deprecated
  modules deleted with the reback (their old-geometry behavior goes with
  the modules in C4).
