---
"@kybernetes/sim-core": patch
---

Add unit-screenshot tests for visibility and line-of-sight:
- New pure `renderVisibilitySvg` snapshot renderer (`spatial/visibilitySvg`) shared by tests and debug views so screenshots and assertions cannot drift apart.
- New `spatial/visibilitySnapshots` Vitest covers empty rooms, wall blocking, doorway open/shut, bullet punctures holding sight, grown breaches opening sight, and a live ship-wall shooting sequence, writing deterministic SVGs to `test-results/visibility/` plus `toMatchSnapshot` regression coverage.
- Run with `yarn --cwd packages/sim-core test visibilitySnapshots`, then open the SVGs in a browser to eyeball walls, hidden areas, and LoS polygons against expectation.
