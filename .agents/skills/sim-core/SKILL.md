---
name: sim-core
description: >-
  Use when modifying or extending @kybernetes/sim-core. Covers deterministic tick runner,
  reactor dynamics, survival vitals math, 2D tilemaps and spatial collisions, and Vitest testing.
---

# Sim-Core Package (`@kybernetes/sim-core`)

`sim-core` is the deterministic, zero-DOM rules engine shared by the
authoritative server and the client's prediction layer. It owns game math,
state transitions, navigation, collisions, survival, reactor behavior, and
combat systems.

## Core Rules

1. **Portable purity**: use pure TypeScript only. Do not import React, browser
  globals, Web APIs, Node APIs, timers, or rendering code.
2. **Deterministic updates**: make inputs explicit (`state`, `dtSeconds`, and
  actions), avoid unseeded randomness, and return new state/patch values instead
  of mutating caller-owned state.
3. **Numerical safety**: clamp values to domain limits, handle zero/negative
  `dtSeconds` deliberately, and normalize externally visible precision where
  the existing subsystem contract requires it.
4. **Single ownership**: place shared rules in `src/` and keep server/UI
  orchestration out of the package. Reuse existing spatial and system helpers
  instead of duplicating formulas.

## Change Workflow

1. Identify the state invariant and boundary cases before changing a system.
2. Implement the smallest pure transition in the appropriate subsystem module.
3. Add or update adjacent Vitest coverage, including lower/upper bounds and
  repeated ticks.
4. Run `yarn --cwd packages/sim-core test`, `typecheck`, and `lint`.
5. Run workspace typecheck/build when protocol or consumer behavior changes.

## Review Checklist

- The same inputs produce the same outputs across repeated runs.
- State is not mutated through nested objects or arrays.
- New public APIs are exported from `src/index.ts` and are used by a consumer.
- Tick work remains bounded and helpers stay small enough for the Fallow quality
  gate.
