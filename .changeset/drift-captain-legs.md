---
'@kybernetes/protocol': minor
'@kybernetes/sim-core': minor
---

Drift Captain legs slice 1b: multi-hop voyage execution

- Sim leg machine ticks committed stop chains: one fuel cell burned per hop
  entry, lane-fraction hop clocks, per-hop extra-burn threshold, flameout
  between stops when the next hop runs dry, and cleared stops on arrival.
  Single-hop legs behave exactly as before.
- New commit path `plotChartCourse`/`plotChartVoyage` with named rejects
  (empty-voyage, unknown-node, same-stop, no-dock); the legacy single-hub
  wrapper remaps chart names so existing clients are unaffected.
- `NAV_STATE` snapshots carry `stops`/`legIndex`; the web nav panel shows
  the live `HOP <label> n/total` row on multi-stop chains.
