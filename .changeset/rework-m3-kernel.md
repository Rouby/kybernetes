---
'@kybernetes/sim-core': minor
'@kybernetes/server': patch
'@kybernetes/web': patch
---

M3 world kernel depth: server-side collision, frame carry, LOS, playable slice

- Movement is now authoritative: input accel integrates against compiled walls
  plus shut-portal colliders (closed doors block, open and destroyed-to-hole
  portals cross) via the shared wall-slide resolver with tunneling checks;
  pawns aboard moving vessels inherit frame velocity with zero drift; NaN and
  non-positive timesteps leave state untouched.
- New LOS module: geometric segment sight over opaque walls and shut doors
  (window panes never block), one-hop room visibility through open and window
  portals, and per-pawn remembered fog stored on the world and advanced by the
  tick. New assembler builds namespaced multi-frame worlds plus pawn spawns.
- Server intent router applies DOOR intents through the portal kernel
  (cooldown/clearance/not-found notices); clearance stays 0 until roles land.
- Playable preview (`?hull=station|hesperia&play=1`) runs the same kernel tick
  in-browser: WASD walk, E door toggle with cooldown, live visibility and fog,
  with Playwright coverage for open/cooldown/cross, wall stops, and memory.
