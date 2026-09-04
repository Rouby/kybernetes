---
name: web-app
description: >-
  Use when modifying or extending the web frontend (apps/web). Covers React 19, Vite 8,
  StyleX HUD components, 2D HTML5 Canvas rendering, WASD pawn controls, Line of Sight, and Playwright tests.
---

# Web Application (`apps/web`)

`apps/web` combines React 19 HUD screens with the WebGL/Canvas vessel view. It
may predict presentation and movement locally, but the server remains
authoritative for simulation results.

## Core Rules

1. **Keep boundaries clear**: use protocol types for socket messages, sim-core
  for game rules, and web code for input, rendering, and presentation state.
2. **StyleX extraction**: `stylex.create()` contains static values and tokens
  only. Put runtime values in React's `style` prop or an existing supported
  pattern. Import tokens directly from `tokens.stylex`.
3. **Rendering order**: preserve deck, fixtures, pawns, lighting, fog,
  atmospheric effects, then HUD overlays. Changes to compositing or resize
  handling must preserve the viewport's coordinate system.
4. **Input and sockets**: clean up keyboard/listener/socket effects on unmount,
  avoid sending actions before connection readiness, and reconcile prediction
  with authoritative broadcasts.
5. **Accessibility and resilience**: interactive HUD controls need usable
  labels/focus behavior, and rendering/network failures should not crash the
  entire app.
6. **Visor safe areas & text bounds**: Anchor dynamic HUD cards relative to
  `marginY`/`marginX` and top header heights rather than hardcoded pixel offsets.
  Calculate monospace text widths ($\approx 7.2\text{px}$/char at 12px) to
  prevent HUD text overflow.

## Change Workflow

1. Identify whether a change belongs in protocol, sim-core, or the web layer.
2. Update the smallest component/hook and keep effects lifecycle-safe.
3. Add or update a focused Playwright journey in `e2e/` for user-visible
  behavior, especially input, docking, HUD, and audio changes.
4. Run `yarn --cwd apps/web lint`, `typecheck`, `build`, and `test:e2e`.

## Configuration and Review Notes

- Preserve the Vite/StyleX Babel configuration and wildcard token aliases.
- Use `node:path` and other `node:` prefixes for Node built-ins in tooling.
- Keep canvas loops and animation callbacks cancellable; do not leak RAF or
  event listeners.
- Remove unused icon imports and hooks so Biome and Fallow remain clean.
- When writing Playwright E2E tests involving mouse moves or canvas hover states,
  re-navigate (`page.goto`) after `page.setViewportSize()` to guarantee canvas
  buffer and CSS dimensions synchronize before dispatching pointer events.
