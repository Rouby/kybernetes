---
"@kybernetes/sim-core": patch
"@kybernetes/web": patch
"@kybernetes/server": patch
---

Fix helmet UI button hit-testing, early audio unlock, FoW occlusion, and bot pathfinding:
- sim-core: Implement findNavigationPath with collision-free portal waypoints, sequential bot progression, and isImpactVisible helper.
- server: Wire door toggling for bot pathfinding transit.
- web: Correct visor barrel distortion inverse mapping and DPR scaling for helmet UI buttons, initialize audio gesture unlock early, and accurately occlude FoW combat impacts and lights.
