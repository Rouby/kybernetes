---
'@kybernetes/protocol': minor
'@kybernetes/sim-core': minor
'@kybernetes/server': minor
---

Solo-ship trader M0+M1: owned-ship spawn and persistence slice

- M0 additive scaffold: new `world/ship` seams (`reactor`, `engine`,
  `navTransit`, `cargo`, `market` tier tables/helpers) plus `shipRecord`
  ownership (starter skiff, serialize/restore, hard-loss wipe, restart).
- Protocol v2 additive wire: `SPAWN_ABOARD` intent with validator, dispatch,
  and 2Hz rate limit plus versioned `SHIP_STATUS` / `SHIP_LOST` snapshots.
- Server `shipRegistry` (one persistent ship per userId, restart after loss)
  and `SimHost.spawnAboardOwnShip` / `shipStatusFor` / `loseShipFor` with
  `SPAWN_ABOARD` routing; hire/watch loop untouched and frozen.
- Web M1 shell: solo intro card and ship-loss panel backed by pinned copy.
- M1 correction: the daemon now boots `buildSoloShipWorld` (same hulls and
  fixtures, zero captains/crew/crowd/bots/offers), the web handshake sends
  `SPAWN_ABOARD` so players spawn aboard the vessel instead of the station,
  and the daemon welcomes/evicts solo spawns like beacon joins.
