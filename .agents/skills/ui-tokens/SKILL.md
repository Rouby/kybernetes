---
name: ui-tokens
description: >-
  Use when modifying or extending @kybernetes/ui-tokens. Covers StyleX design tokens,
  tactical sci-fi color palettes, CRT effects, and typography.
---

# UI Tokens Package (`@kybernetes/ui-tokens`)

This package houses the shared design tokens for Kybernetes' tactical sci-fi HUD using Meta's StyleX (`@stylexjs/stylex`).

## Core Rules & Architecture

1. **Strict File Naming**:
   * Any file defining StyleX theme variables **must** end in `.stylex.ts` (e.g., `tokens.stylex.ts`).
   * Do not define variables in generic `index.ts` files.
2. **`stylex.defineVars` Only**:
   * All variables must be created using `stylex.defineVars({ ... })`.
3. **Exports Map in `package.json`**:
   * Ensure `package.json` explicitly defines exports for the `.stylex` file:
     ```json
     "exports": {
       ".": "./src/index.ts",
       "./tokens.stylex": "./src/tokens.stylex.ts"
     }
     ```

## What to Look Out For

* **The Direct Import Rule**:
  * In consumer apps (like `apps/web`), **always** import directly from the token file:
    ```ts
    import { hudColors } from '@kybernetes/ui-tokens/tokens.stylex';
    ```
  * Never import tokens from a barrel file (`from '@kybernetes/ui-tokens'`), as StyleX's Babel plugin cannot resolve `defineVars` through index re-exports during compile-time static extraction.
* **Tactical Color Identity**:
  * `cyanTelemetry` (`#00e5ff`): Subsystem integrity, tech readout, main brand.
  * `amberTelemetry` (`#ffb000`): Work shifts, warnings, nutrition, thermal output.
  * `phosphorGreen` (`#00ff66`): Life support, active connection, healthy nominal status.
  * `alertRed` (`#ff2244`): Red Alert, fire, boarding breaches, starvation, critical damage.
  * `bgVoid` (`#06080c`): The cold void outside the hull.
