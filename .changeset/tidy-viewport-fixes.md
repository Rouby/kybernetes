---
'@kybernetes/sim-core': patch
'@kybernetes/web': minor
---

Viewport fixes: true coordinates, aim, gunfire feedback, and test isolation

- Fixed a coordinate regression that double-offset ship bulkheads and doors:
  walls and door segments are frame-local again, fixtures render aboard and
  in the lobby, and breach lookups accept namespaced ids.
- The canvas is the only element and fills the screen; the debug panel hides
  behind `?debug=1`. Camera zoom with mouse lookahead, adaptive settle, and
  close-snap reconcile remove the stop-trail.
- Mouse aims after the first move, clicks fire through the HUD hit-tester,
  shots draw muzzle flashes plus tracer beams, and notices surface on the
  visor. Prediction runs the server accel/damping model.
- Each e2e file owns a private daemon (no cross-file world leakage), the
  journey tolerates ambient door state, and scene captures record the lobby,
  doorway, and ship corridor.
