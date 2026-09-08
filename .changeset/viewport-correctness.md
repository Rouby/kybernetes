---
'@kybernetes/sim-core': patch
'@kybernetes/web': minor
---

Viewport correctness: true coordinates, mouse aim, and fire feedback

- Fixed a C3 coordinate regression: ship walls and door segments are
  frame-local again (frozen consumers offset them), ending double-offset
  bulkheads and doors. Harbor fixtures (helm, lockers, winch, galley,
  consoles, job board) render aboard and in the lobby with frame-aware
  offsets, and breach lookups accept namespaced ids.
- Client prediction runs the server accel/damping model with per-snapshot
  velocity seeding, and the mouse owns aim (with lookahead camera) after
  the first move. Click fires through the HUD hit-tester; muzzle flashes
  follow server-confirmed heat and notices surface on the visor.
