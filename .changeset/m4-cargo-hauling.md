---
'@kybernetes/protocol': minor
'@kybernetes/sim-core': minor
'@kybernetes/server': minor
---

Solo-ship trader M4: physical crate hauling (bay floor, hands, ship floor)

- M4 kernel: crate hauling sim (bayFloor / carriedBy / shipFloor bodies
  with frame-local positions, pickup/drop with fixture-nudge, unpack to
  secured counts, repack to a fresh crate) plus the free-place packing
  puzzle geometry (AABB overlap reject, greedy auto-pack fallback, crate
  estimates). Carried crates follow their pawn, slow movement 25%, and
  auto-drop on death/incapacity inside the world tick.
- M4 wire: CARGO_PICKUP / CARGO_DROP / CARGO_UNPACK / CARGO_REPACK
  intents (8Hz), crate tables inside SNAPSHOT at 10Hz, CARGO_STATE
  (secured counts + carried mapping) on telemetry, hands-full fixture
  gate in the router (carriers must set the crate down first), and two
  seeded bay crates so the haul loop runs without the market.
- M4 fixes: mouse aim now steers `MovementController` facing (shots used to fly straight right while the render aim tracked the cursor), and carried crates ride at the pawn's hands with `G` dropping exactly where the crate visually is.
- M4 carry feel: carried crates glue to the carrier's predicted pose client-side (no 10Hz lag) and draw above pawns; floor piles stay underfoot. Fixed `tickCargo` discarding the synced hold (drops landed at the pickup spot) and added crate rotation (orthogonal grab, live facing tracking while carried, free-angle drop, rotated GL markers).
- M4 web: crate [E] targeting with pickup prompts, G set-down, U
  unpack-all and C hold panel (carried/floor/secured, seal-per-good),
  world-space crate markers in the viewport, and hands-full prompt
  warnings. Drag-to-pack lands with the M5 checkout screen; the panel
  seals via auto-pack until then.
