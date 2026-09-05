---
"@kybernetes/sim-core": patch
"@kybernetes/server": patch
"@kybernetes/web": patch
---

Fix projectile and welder AOE collisions across moving ship frames:
- Unify projectile wall and door collision checks in world space by translating ship geometry via `applyShipOffsetToWalls` and `getWorldDoors`.
- Project kinetic outer-hull hits to ship-local space (`worldHit - offset`) solely for `findRoomAtHullImpact` breach room mapping.
- Update `tickProjectiles` outer boundary check to allow projectiles within both ship and station bounds.
- Remove ship room bounding-box restriction from `applyWelderAoeDamage`, evaluating welder raycasts against world-space walls and doors.
- Propagate docking offset to `tickVesselState`, `tickBoardingCombat`, `tickProjectiles`, `applyWelderAoeDamage`, and client predictive weapons/projectiles hooks (`usePredictiveProjectiles`, `useCanvasWeapons`, `VesselCanvas`).
- Carry aboard active projectiles when ship translates during docking phases.
