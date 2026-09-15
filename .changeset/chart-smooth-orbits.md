---
'@kybernetes/web': patch
---

Galaxy chart smooth orbits: fix planet pixel-jumping in route planner

- Fixed `smoothSimClock` resetting its wall anchor every frame, which held planets at `tick * FIXED_DT + last frame delta` and jumped ~34-83ms on every ~10Hz broadcast. The clock now accumulates wall deltas in `simSec`/`remainingS` for true 60fps interpolation between ticks.
- Sim time freezes while paused (across tick changes) and the leg clock freezes while paused or flamed out, with frame-delta clamping and drift bounds for tab-switch safety.
- Added consecutive-frame accumulation and pause/resume regression tests for the broadcast clock.
