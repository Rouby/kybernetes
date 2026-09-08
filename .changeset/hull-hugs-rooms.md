---
'@kybernetes/web': patch
---

Tighten ship hull art to the v2 room block

- The v1 armor plate/outline (to x1040/y590) dwarfed the compact v2 rooms
  (x100-880, y200-500), leaving a dead eastern void and a sagging southern
  margin under the lower rooms. The plate now hugs the rooms (70,180 +
  850x350) with an even margin and a west stern wedge.
- Thruster bells remount on the new aft edge with nozzle exits just past
  it; `THRUSTER_BELLS` follows and the placement tests assert bells on the
  plate edge plus every v2 room rect enclosed by the plate.
