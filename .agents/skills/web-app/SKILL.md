---
name: web-app
description: >-
  Use when modifying or extending the web frontend (apps/web). Covers React 19, Vite 8,
  StyleX HUD components, 2D HTML5 Canvas rendering, WASD pawn controls, Line of Sight, and Playwright tests.
---

# Web Application (`apps/web`)

The frontend application renders both the diegetic tactical bridge/crew HUD and the hardware-accelerated 2D Canvas starship viewport.

## Core Rules & Architecture

1. **StyleX Compile-Time Constraints**:
   * **Only static values are allowed in `stylex.create()`**.
   * ❌ *Broken*: `progressBarFill: (val) => ({ width: `${val}%` })`
   * ✅ *Correct*: Define static styles in StyleX, and pass dynamic widths via React `style`:
     ```tsx
     <div {...stylex.props(styles.progressBarFill)} style={{ width: `${pct}%`, backgroundColor: color }} />
     ```
2. **Vite 8 Configuration**:
   * `@vitejs/plugin-react` is configured with `disableOxcRecommendation: true` to prevent deprecation warnings while ensuring Babel is active for `vite-plugin-stylex`.
   * Aliases for `@kybernetes/ui-tokens/*` must include the wildcard `*` in `vite-plugin-stylex`.
3. **2D Canvas Layering Order**:
   When rendering `VesselCanvas`, follow strict visual z-ordering:
   1. *Deck Layer*: Floor tiles, hazards, blood/spills.
   2. *Fixtures Layer*: Consoles, reactors, bunks, hydroponic pods, blast door frames.
   3. *Pawn Layer*: Player avatar, crewmates, enemy boarding squads.
   4. *Light & Shadow Pass*: 2D Visibility Polygon raycast from the player position.
   5. *Fog of War Mask*: `destination-out` compositing revealing active LoS and dimming explored memory.
   6. *Atmospheric Hazards*: Smoke particles, coolant steam, sparks.
   7. *StyleX HUD Overlays*: React UI elements positioned above the canvas.

## What to Look Out For

* **Biome Import Linting**:
  * Node built-ins in Vite config must use `node:path`.
  * Clean unused imports (`lucide-react`, React hooks) to keep `yarn lint` passing.
* **Playwright E2E Tests**:
  * Tests live in `apps/web/e2e/`.
  * When adding new HUD panels or stations, update `e2e/smoke.spec.ts` or add dedicated feature specs.
  * Run tests locally via `yarn test:e2e`.
