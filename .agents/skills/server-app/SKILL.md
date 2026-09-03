---
name: server-app
description: >-
  Use when modifying or extending the backend daemon (apps/server). Covers Node 24,
  WebSocket server (ws), tick loop broadcast, client session lifecycle, and port teardown.
---

# Server Application (`apps/server`)

`apps/server` is the authoritative session host. It owns simulation state,
validates untrusted client actions, advances the fixed-step loop, and broadcasts
typed state updates over `ws`.

## Core Rules

1. **Authority boundary**: route incoming packets through the action router and
  validate every field before passing it to `@kybernetes/sim-core`. Never accept
  client coordinates, vitals, inventory, or combat results as truth.
2. **Fixed-step loop**: use `GameLoop` for deterministic advancement and keep
  tick work bounded. Broadcast only protocol-defined snapshots/deltas.
3. **Connection lifecycle**: register and remove clients symmetrically, handle
  malformed/disconnected sockets without crashing the process, and avoid
  broadcasting to sockets that are not open.
4. **Clean shutdown**: preserve `SIGINT` and `SIGTERM` handling in `src/index.ts`.
  `server.stop()` must terminate active clients before closing the
  `WebSocketServer`, and must be safe to call more than once.
5. **Maintainability**: keep handlers focused; extract validation, state
  transitions, termination, and broadcast helpers rather than growing large
  callbacks.

## Change Workflow

1. Update protocol types before adding a new action or broadcast.
2. Implement routing and authoritative state changes in `src/`.
3. Verify the corresponding simulation behavior in `packages/sim-core`.
4. Run `yarn --cwd apps/server typecheck`, `lint`, and `build`.
5. Exercise startup, client connect/disconnect, malformed input, and shutdown.

## Operational Checklist

- Default port remains 3001 unless configuration explicitly changes it.
- A failed bind or malformed packet produces a controlled error, not an
  unhandled rejection.
- Shutdown closes sockets and releases the listener before the process exits.
- On Windows, check for stale listeners with:
  `Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue`.
- Do not add blocking I/O or unbounded synchronous work to the tick callback.
