---
"@kybernetes/protocol": minor
"@kybernetes/sim-core": minor
"@kybernetes/server": minor
"@kybernetes/web": minor
---

### Milestone 5: Authoritative WebSocket Server, Multi-Room Lobbies & Real-Time Co-Op

![Kybernetes Multi-Crew Tactical Viewport](https://raw.githubusercontent.com/Rouby/kybernetes/main/docs/images/milestone5_viewport.png)

- **Authoritative Multi-Room WebSocket Server Daemon (`apps/server`)**:
  - Implemented multi-room session management via 6-character Subspace Beacon Codes (e.g. `HESP01`).
  - Fixed-step 20Hz (50ms) authoritative simulation loop broadcasting synchronized vessel state and spatial snapshots.
  - Full client connection lifecycle: automatic room allocation, seat reassignment, graceful disconnect cleanup, and session teardown.
- **Wire Protocol Extensions (`@kybernetes/protocol`)**:
  - Added `InitiateDualProtocolAction`, `ExecuteDualProtocolAction`, and `ContributeCollabShiftAction` client intents.
  - Added `DualProtocolBroadcast`, `CollabShiftUpdateBroadcast`, `LobbyStateBroadcast`, and extended `CrewManifestBroadcast`.
- **Pure Multiplayer Math & State Progression (`@kybernetes/sim-core`)**:
  - Deterministic vector and shortest-arc angular pawn interpolation (`lerpAngle`, `interpolatePawn`).
  - Dual-operator critical protocol state machine with 10-second synchronization window.
  - Collaborative heavy shift rate progression with team synergy multiplier ($N \times 1.25$).
  - Subspace beacon code generation and validation regex (`generateBeaconCode`, `isValidBeaconCode`).
- **Tactical Multi-Crew HUD & WebGL/Canvas Viewport (`apps/web`)**:
  - Real-time peer pawn rendering with role-coded dynamic colors and floating tactical nametags.
  - Smooth 60fps client-side pawn dead-reckoning interpolation.
  - Interactive **Live Crew Manifest Modal** (`[M]` or Header Crew badge) displaying active roster, departments, and combat/duty status.
  - Interactive **Subspace Beacon Modal** (`[B]` or Header Beacon badge) for entering codes and randomizing frequencies.
  - Dual-operator protocol alert banner with remaining sync countdown and bridge execution prompt.
  - Collaborative shift progress bar showing active crew contributors.
- **Multi-Context Playwright E2E Test Suite (`apps/web/e2e/milestone5.spec.ts`)**:
  - 4 comprehensive multi-context browser tests verifying multi-crew connection, live roster syncing, spatial replication & nametags, shared boarder defense alerts, and dual-operator protocol execution.
