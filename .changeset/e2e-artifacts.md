---
'@kybernetes/web': patch
---

Test strategy: Playwright leaves the agent gates, mapping moves to Vitest

- AGENTS.md no longer lists Playwright in the commit gates: agents prove
  behavior with Vitest (unit plus host/daemon integration) while the
  browser suite stays on CI as the human signal. Added a `test:e2e:scenes`
  script and failure-video retention for on-demand artifact runs.
- Extracted the viewport v2-to-render-state mapping to a pure,
  unit-tested `harbor/renderState` module (origins, pawns, doors, atmos,
  vitals, telemetry) instead of covering it only through the browser.
