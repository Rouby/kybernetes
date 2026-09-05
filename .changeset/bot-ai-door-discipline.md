---
"@kybernetes/sim-core": patch
"@kybernetes/server": patch
---

Improve bot crewmate lifelikeness and door discipline. Bots now wait at closed hatches (open radius 56px) instead of triggering doors across the room, hold position for the door cycle, track hatches they opened, and close them once clear (85px). Server skips closes while a player or bot is still in the hatch. Bots also publish velocity (walk sway + thruster FX), walk at per-role speeds with jitter, pause and glance around while travelling, shuffle and face their station while working, and scan while resting.
