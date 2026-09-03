---
name: ui-tokens
description: >-
  Use when modifying or extending @kybernetes/ui-tokens. Covers StyleX design tokens,
  tactical sci-fi color palettes, CRT effects, and typography.
---

# UI Tokens Package (`@kybernetes/ui-tokens`)

This package is the shared StyleX token layer for the tactical HUD. It should
define visual vocabulary, not component behavior or app-specific layout.

## Core Rules

1. Define StyleX variables only in `*.stylex.ts` files with
  `stylex.defineVars`; keep barrels free of variable definitions.
2. Preserve the package export `./tokens.stylex` in `package.json` and export
  only intentional public APIs.
3. Consumers must import compile-time variables directly:
  `@kybernetes/ui-tokens/tokens.stylex`. Do not hide them behind the barrel,
  because StyleX static extraction depends on the direct module.
4. Prefer semantic names (`alertRed`, `phosphorGreen`) over component names,
  and keep token values consistent across light effects, text, borders, and HUD
  states. Do not add Tailwind or runtime CSS-in-JS.
5. Keep this package independent of React, DOM APIs, and application state.

## Change Workflow

1. Add the smallest semantic token and choose an existing palette role first.
2. Update direct consumers and verify StyleX compilation in the web build.
3. Run `yarn --cwd packages/ui-tokens typecheck` and `lint`, then `yarn build`
  when consumer extraction is affected.

## Palette Roles

- `cyanTelemetry`: subsystem integrity, technical readouts, brand accents.
- `amberTelemetry`: shifts, warnings, nutrition, and thermal output.
- `phosphorGreen`: life support, active connection, nominal health.
- `alertRed`: red alert, fire, boarding, starvation, and critical damage.
- `bgVoid`: the dark space surrounding the vessel.
