---
'@kybernetes/sim-core': minor
'@kybernetes/server': minor
---

POI destinations and chart backdrop fidelity

- Sim drops the hub-only destination gate: POI-terminated voyages fly and
  hold at site, with dock seals and station moves safely skipping POIs.
- Server tows always land on a hub dock (nearest hub end of the chain,
  else any hub aboard, else New Anchorage) so POI strandings resolve.
- Web drafts exactly the clicked stops with full-chain preview labels,
  and the chart screen renders over a starfield-only scene.
