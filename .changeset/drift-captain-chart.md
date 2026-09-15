---
'@kybernetes/sim-core': minor
---

Drift Captain chart slice 1a: fixed-node voyage graph plus pure projection

- New pure module `world/ship/chart.ts`: hubs (NEW ANCHORAGE, KEPLER YARD)
  plus drift POIs (DERELICT "KESTREL", BEACON "VIGIL") with rumor hints,
  fractional-lane edges, and `planVoyage` ETA/fuel/unknowns/heat-risk
  projection that matches the leg machine on direct hops.
- Web nav panel sources `fuelNeeded` from the chart projection instead of
  duplicating sim fuel rules, and adds a docked-only HEAT RISK: TUNE LOW
  soft warning next to LOW FUEL. Execution (leg machine, NAV_PLOT, server
  rejects) is intentionally untouched until slice 1b.
