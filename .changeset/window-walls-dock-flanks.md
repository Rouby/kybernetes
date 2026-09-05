---
"@kybernetes/protocol": minor
"@kybernetes/sim-core": minor
"@kybernetes/web": minor
---

Windows as transparent wall segments flanking the dock:
- New `WallSegment.isWindow` flag; four lobby windows (two per side) block movement and airflow but stay invisible to vision and lighting.
- Removed the viewport fixture boxes and glass-ship rendering; the real moving ship shows through the glass.
- Bulkhead pass renders glass panes with frame ticks; traversal and occlusion unit coverage updated.
