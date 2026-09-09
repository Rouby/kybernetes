---
"@kybernetes/protocol": minor
"@kybernetes/sim-core": minor
"@kybernetes/server": patch
"@kybernetes/web": patch
---

Screenshot bugfix pass across LoS, impacts, bots, and docking:
- LoS edge spikes: widen ray edge epsilon to 0.0003, sanitize fans (sub-pixel merge, near-eye collapse, wrap-duplicate drop), skip sub-0.5px fan triangles in the FOW builder, and close cone fans across the mouth chord.
- Impacts: shrink decal craters to scuffs, batch decal layers per frame, stamp room pressure kPa on impacts, and scale spark throw by hole area times pressure differential.
- Bots: route cross-room legs through portal-graph door midpoints and skip waypoints with no progress after 60 ticks; posted crew never drifts through dock volumes and the station crowd patrols off the gauntlet tube.
- Docking: stern boarding ramp on the corridor west wall mates with the gauntlet at the docked origin, vessels fly phase-driven approach/departure/transit legs, the debug overview pins on the harbor with an in-transit bearing, and all ship-layer render offsets go full 2D.
