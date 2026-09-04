---
"@kybernetes/web": patch
---

Fix aiming cursor drift during movement and vertical locomotion stop behavior:
- VesselCanvas: Continuously project resting cursor screen coordinates to world space each frame relative to the updated camera, keeping aiming reticle and projectile trajectories locked to cursor position during movement.
- usePawnMovement: Fix zero-velocity release condition to check both vx and vy so vertical locomotion immediately stops footstep audio and walking animation, and preserve mouse aim facing angle during locomotion.
