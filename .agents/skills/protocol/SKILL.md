---
name: protocol
description: >-
  Use when modifying or extending @kybernetes/protocol. Covers WebSocket packet schemas,
  client action intents, server broadcasts, and spatial snapshot types.
---

# Protocol Package (`@kybernetes/protocol`)

The protocol package is the single source of truth for the WebSocket network layer connecting `apps/web` to `apps/server`.

## Core Rules & Architecture

1. **Pure Types & Zero Runtime Overhead**:
   * Contains only TypeScript interfaces, types, and constants.
   * Never import third-party packages or runtime dependencies.
2. **Discriminant Unions**:
   * All client actions must extend `ClientAction` with a unique, uppercase `type` discriminant (e.g. `type: 'PLAYER_MOVE'`).
   * All server broadcasts must extend `ServerBroadcast` with a unique `type` discriminant (e.g. `type: 'SPATIAL_SNAPSHOT'`).
3. **Canonical Categorization**:
   * `actions.ts`: Client intents sent to server.
   * `broadcasts.ts`: Server state updates sent to crew.
   * `spatial.ts`: 2D positions, pawns, bulkheads, and fixtures.
   * `survival.ts`: Vitals and macro supplies.

## What to Look Out For

* **Synchronous Updates**:
  * Any change to `ClientAction` or `ServerBroadcast` immediately impacts both `apps/server` (packet handling) and `apps/web` (packet dispatch/receipt). Update all three in the same changeset.
* **Exports in `index.ts`**:
  * Ensure all new sub-modules are re-exported from `src/index.ts`.
* **Payload Serialization**:
  * Avoid non-serializable objects (e.g., `Set`, `Map`, `Date`, circular references). Use arrays, primitives, and plain JSON objects.
