---
'@kybernetes/protocol': minor
'@kybernetes/server': minor
---

Drift Captain waypoints slice 2: NAV_PLOT carries waypointIds

- Wire: `NAV_PLOT` gains `waypointIds` (max 4, short-id entries, absent
  defaults to direct); the server commits `[...waypointIds, destHubId]`
  through `plotChartVoyage` so POI detours fly the multi-hop machine.
  New chart rejects surface as `NAV_<reject>` notices.
- Console: the docked nav panel swaps cancel/distress for one VIA button
  per chart POI; underway panels are unchanged.
