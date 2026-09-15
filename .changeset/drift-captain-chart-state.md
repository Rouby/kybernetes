---
'@kybernetes/protocol': minor
'@kybernetes/sim-core': minor
'@kybernetes/server': minor
---

Drift Captain chart slice 3: discovery survey plus CHART_STATE manifest

- Sim tracks surveyed POIs per vessel (flyby on hop entry, survives tows)
  and builds per-vessel CHART_STATE snapshots (nodes with known flags,
  short visor tags, rumor hints); the daemon ships them with nav state.
- Web nav panel shows the docked manifest (?? rumor or survey count, best
  haul spread from port, live LANE with ?? for unknown stops).
