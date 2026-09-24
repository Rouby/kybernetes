---
"@kybernetes/sim-core": patch
---

Dock-to-dock flights no longer cut through station plates. Every hub now shares one abstract berth at the origin, so departure and arrival use the same coordinates and each leg just swaps which station frame is loaded: undocking pushes east off the dock, the hull holds there for the whole leg while the chart owns the trip, and docking glides back into the berth. Transit visibility loads at most one station (arrival takes precedence on short legs) so co-located plates never double-render.
