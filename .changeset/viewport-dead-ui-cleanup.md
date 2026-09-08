---
'@kybernetes/web': patch
---

Remove the dead welder-thermal HUD branch and slim the viewport render path

The arc-welder HEAT readout lost its only data feed when weapon heat was removed and the branch is unreachable in the harbor flow, so it now shows standby status from the live arc state instead. The viewport render path moves projectile, remote-pawn, ammo, aim, and ship-offset mapping into pure unit-tested `renderState` helpers alongside small session helpers, with no visual change.
