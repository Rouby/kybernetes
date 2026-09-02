---
name: sim-core
description: >-
  Use when modifying or extending @kybernetes/sim-core. Covers deterministic tick runner,
  reactor dynamics, survival vitals math, 2D tilemaps and spatial collisions, and Vitest testing.
---

# Sim-Core Package (`@kybernetes/sim-core`)

The simulation core contains the mathematical heartbeat of Kybernetes. It runs identically on the authoritative server and inside the web client for optimistic prediction.

## Core Rules & Architecture

1. **Zero DOM & Zero Web Dependencies**:
   * Never import `window`, `document`, `HTMLCanvasElement`, or React.
   * Only pure TypeScript math, state transformers, and data structures.
2. **Deterministic State Progression**:
   * All state update functions must take `(state, dtSeconds, ...inputs)` and return a new immutable state object or patch.
   * Avoid unseeded `Math.random()` in core loops where determinism is critical.
3. **Floating Point Rounding**:
   * Always normalize decimal drift on rates (e.g. `Number(newTemp.toFixed(2))`) to avoid IEEE 754 precision issues during delta broadcasts.

## What to Look Out For

* **Fallow Dead Code Warnings**:
  * If you add a method or property to `GameLoop` or any class, ensure it is actually called by consumers (`apps/server` or `apps/web`). Unused class members will fail `yarn quality`.
* **Complexity & CRAP Score**:
  * Keep tick updater functions focused. Avoid deep nested `switch` or `if-else` loops. Break down subsystem calculations into distinct modules (`systems/reactor.ts`, `systems/lifeSupport.ts`).
* **Unit Testing**:
  * Every new formula or decay curve must have a corresponding Vitest test in `src/*.test.ts`.
  * Run `yarn --cwd packages/sim-core test` to verify instantly.
