---
'@kybernetes/web': patch
---

Screenshot testing for the visibility snapshot SVGs (on-demand human signal):
- New `e2e/visibility-snapshots.spec.ts` renders each deterministic SVG from `packages/sim-core/test-results/visibility/` in Chromium and saves per-scenario PNGs to `apps/web/test-results/visibility/` via element screenshots.
- New `test:e2e:visibility` script (`playwright test visibility-snapshots.spec.ts`) plus a root `test:visibility` one-command pipeline (Vitest SVGs, then Chromium PNGs); no daemon needed. Deliberately artifact screenshots, not pixel assertions, so it stays a human-verification aid and never a commit gate.
