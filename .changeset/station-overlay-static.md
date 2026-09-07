---
'@kybernetes/web': patch
---

Station atmos overlay no longer moves with the ship

The whole overlay layer was translated by the ship docking offset, dragging
station rooms along with the vessel. Room rects are now tagged ship/station and
only ship-side geometry takes the hull offset; station rooms render in fixed
world coordinates, as do their drag arrows.
