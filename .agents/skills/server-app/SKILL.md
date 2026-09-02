---
name: server-app
description: >-
  Use when modifying or extending the backend daemon (apps/server). Covers Node 24,
  WebSocket server (ws), tick loop broadcast, client session lifecycle, and port teardown.
---

# Server Application (`apps/server`)

The server application is the authoritative session host daemon. It runs the fixed-step simulation loop, enforces physics/rules, validates player action intents, and broadcasts spatial/telemetry deltas.

## Core Rules & Architecture

1. **Authoritative State Loop**:
   * The server owns the true vessel state (`VesselSimulationState`).
   * Ticks at 10Hz (100ms) or 20Hz (50ms) using `GameLoop` from `@kybernetes/sim-core`.
   * Broadcasts `TelemetryDeltaBroadcast` and `SpatialSnapshotBroadcast` over WebSockets.
2. **Process Lifecycle & Port Release**:
   * Port 3001 must be released immediately on shutdown.
   * `apps/server/src/index.ts` must maintain `SIGINT` and `SIGTERM` signal handlers.
   * `server.stop()` must forcefully terminate all active WebSocket client connections before closing `wss` to prevent sockets from staying in `TIME_WAIT` or keeping the process alive.
3. **Low Complexity (Fallow Gate)**:
   * Keep handlers concise. Do not write large 30+ line arrow functions inside promises.
   * Extract distinct operations into private helper methods (e.g. `terminateClients()`, `broadcast()`).

## What to Look Out For

* **Windows Orphan Processes**:
  * If testing `apps/server` manually or via tasks, verify port 3001 is clean before starting another instance:
    ```powershell
    Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
    ```
  * Never remove the signal trapping in `index.ts`.
* **Action Validation**:
  * Never trust client coordinates or vital levels blindly. Validate that player movements do not intersect solid bulkheads and that consumable items exist in ship stores.
* **Non-Blocking Execution**:
  * Never run long synchronous loops in the tick callback. Keep ticks sub-millisecond.
