---
'@kybernetes/sim-core': patch
'@kybernetes/web': patch
---

Screenshot diff testing moves to vitest/browser canvas shots:
- Removed the interim SVG string snapshots, SVG renderer, and Playwright SVG spec; shared scenario geometry now lives in pure `spatial/visibilityScenarios` with canvas rendering and sight-invariant assertions in `spatial/visibilityShots.browser.test.ts`.
- Added complex S7 three-room door chain and S8 aligned/staggered twin-breach scenarios proving sight passes open doorways and paired gaps but stops at shut walls and offset cuts.
- New `test:browser` script (plus root `test:visibility` shortcut) diffs 12 canvas shots against `__screenshots__` goldens via `toMatchScreenshot`; the node unit gate stays browser-free.
