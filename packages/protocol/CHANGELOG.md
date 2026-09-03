# @kybernetes/protocol

## 0.3.0

### Minor Changes

- 8da4d68: ### Character Creation, Crew State Persistence & Arc Welder Propagation
  
  - **Post-Session Character Creation Modal (`apps/web`)**:
    - Main menu now commissions or boards sessions first, transitioning immediately to the Operator Dossier Specification.
    - Players configure their callsign (with randomizer), assign one of 5 duty roles, and select from an 8-color Tactical Suit palette with a live visor avatar preview.
    - Modal decomposed into focused sub-components (`CallsignField`, `RoleGrid`, `SuitColorGrid`, `AvatarPreview`).
  - **Full Crew State Persistence Per User (`apps/server` & `apps/web`)**:
    - Crew position `(x, y)`, facing angle, role, callsign, suit color, vitals, credits, and clearance are persisted per user (`localStorage` on client, session and global storage on authoritative server).
    - Re-embarking or reconnecting to a vessel restores previous spatial coordinates and role configuration instead of resetting to default spawn points.
  - **Arc Welder Multi-Pawn Wire & WebGL Propagation (`packages/protocol`, `apps/server`, `apps/web`)**:
    - Replicated active welding state over the wire via `PlayerMoveIntent.isWelding` and `PawnState.isWelding` at 20Hz.
    - Authoritative continuous welder AOE damage applied to intruders in `tickActiveWelders()`.
    - WebGL2 renderer dynamically simulates electric arcs, spark particle impacts, and dynamic multi-point lighting for all visible active welders on screen (both local player and peers).
- d047572: ### Wire Contracts for Vessel Telemetry & Naval Damage Events
  
  - Added `SubsystemStatus` discriminant tags (`nominal | degraded | critical`).
  - Added telemetry schemas: `ReactorTelemetry`, `LifeSupportTelemetry`, `HullTelemetry`, `ShieldTelemetry`, and `DefenseTelemetry`.
  - Added naval combat wire schemas: `NavalDamageEvent`, `NavalDamageEventType`, and `NavalDamageEventStatus`.
  - Added damage control client action intents: `TriggerPdtInterceptAction`, `DeployFireSuppressionAction`, `EmergencyHullRepairAction`, `VentReactorCoolantAction`, and `TriggerNavalDamageEventAction`.
  - Added server broadcasts: `NavalDamageEventBroadcast` and `DamageTriageBroadcast`, and extended `TelemetryDeltaBroadcast` with all active subsystem state.
- f2792ac: ### Milestone 4: FTL Visual Overhaul, DecisionTreeAI Raider Combat & Realistic Physics Air Venting
  
  ![Kybernetes FTL Tactical Combat Viewport](https://raw.githubusercontent.com/Rouby/kybernetes/main/docs/images/ftl_viewport.png)
  
  - **Authentic FTL Interior Visuals & Grid Layout (`apps/web`)**:
    - Crisp FTL off-white / light slate grid floor plating (`#edf0f5`) with 35px square grid cells.
    - Stamped subsystem floor emblems directly on the grid (`[O2]`, `[ENG]`, `[WPN]`, `[MED]`, `[NAV]`, `[CARGO]`).
    - Iconic FTL diagonal red/pink vacuum warning hazard stripes (`#ffcdd2` background with `#ef9a9a` stripes) across decompressed compartments.
    - Double-lined dark slate bulkheads (`#27384d`) with operable sliding blast doors and status LEDs.
  - **DecisionTreeAI Raiders & Waypoint Navigation (`@kybernetes/sim-core`)**:
    - Implemented graph-based waypoint pathfinding through doorways and corridors (no more walking through walls!).
    - **DecisionTreeAI**:
      1. *Survival*: If room oxygen drops below 25% or compartment is vented, raiders flee toward the nearest room with breathable air!
      2. *Engagement*: If crew/player is in line-of-sight within 220px, raiders transition to firefight mode, aim, and shoot red plasma bolts every 1.2s.
      3. *Obstacle Breach*: Attacks locked or closed blast doors blocking their waypoint path.
      4. *Sabotage*: Initiates shaped charge countdown when reaching priority target subsystems.
  - **Gun Equipping, Aiming & Projectile Firefights (`@kybernetes/protocol`, `apps/server`, `apps/web`)**:
    - Players equip weapons from the Armory Weapon Locker via `[E]` interaction or quick hotkeys `[1] Kinetic Carbine`, `[2] Pulse Laser`, `[3] Arc Welder`.
    - Continuous mouse aiming with tactical laser sight and crosshair.
    - Left Mouse Click or `[Space]` fires high-speed glowing energy bolts (shader-grade additive glow blending).
    - Raiders return fire with red plasma bolts that damage player vitals.
  - **Realistic Physics Air Venting & Exterior Hull Airlocks**:
    - Exterior hull airlocks (Port Airlock, Cargo Vent Hatch, Starboard Vent) can be opened to the space vacuum.
    - Physics-based suction vector field pulls pawns and debris toward open breach openings.
    - Multi-room atmospheric pressure equalization through connected open interior doors.
    - Decompression air stream vapor particles rushing into space vacuum with additive blending.
- 8da4d68: ### Milestone 5: Authoritative WebSocket Server, Multi-Room Lobbies & Real-Time Co-Op
  
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
- e4332d9: ### Playable Game Loop Upgrade: Shift Checklist Quests, Ambient Bot Crew & Performance Debrief
  
  - **Shift Checklist Duty System (`@kybernetes/sim-core` & `@kybernetes/protocol`)**:
    - Implemented sequential 3-task departmental shift checklists (`generateShiftChecklist`, `advanceShiftTask`) tailored to the player's starting role.
    - Gated XP and credit rewards strictly behind scheduled shift tasks; non-scheduled actions continue to alter ship systems (e.g., venting reactor heat, drinking water) without granting personal rewards.
    - Implemented dynamic projected rating estimation (`calculateProjectedGrade`) and final shift performance evaluation (`evaluateShiftPerformance`) rating players from Grade S down to Grade C based on watch speed and ship vitals health.
  - **Autonomous Bot Crew & Ambient Voicelines (`@kybernetes/sim-core` & `apps/server`)**:
    - Implemented full 5-person crew reconciliation (`reconcileBotsForSession`): any unassigned crew role is automatically staffed by an autonomous bot crewmate with distinct persona callsigns and badges (`Stoker Vane [ENG-3]`, `Cook Higgins [LOG-3]`, `Marine Ortiz [SEC-3]`, `Tender Chen [BIO-3]`, `Rigger Kowalski [HLD-3]`).
    - Added deterministic bot behavior finite state machine (`walking_to_station` -> `working_station` -> `walking_to_rest` -> `resting`) with functional assistance contributing to reactor cooling and O2 maintenance.
    - Integrated role-based atmospheric voicelines rendered as floating 2D world speech bubbles with role border tints and expiration timers.
    - Bots dynamically step down when a human crew member claims their role and respawn if the human switches or disconnects.
  - **Top-Left Visor HUD & StyleX Performance Debrief Modal (`apps/web`)**:
    - Built WebGL2 HUD visor rendering active watch shift number, projected grade badge (`[S]`, `[A]`, `[B]`, `[C]`), elapsed watch timer, and 3-step checklist status.
    - Implemented retro terminal `ShiftDebriefModal` displaying watch duration, average crew vitals, credit / XP remuneration breakdown with bonuses, and watch rotation advancement button.
    - Comprehensive Playwright E2E browser tests (`e2e/shift_loop.spec.ts`) verifying bot manifest population, 3-task duty cycle progression, and debrief card modal workflows.

## 0.2.0

### Minor Changes

- 8d842cb: ### Wire Contracts & Spatial Schemas
  
  - Added `WallSegment` schema (`x1, y1, x2, y2, isOpaque, thickness`) defining physical bulkheads and occlusion geometry.
  - Added `DeckDefinition` schema for complete deck layouts, machine fixtures, and departmental spawn coordinates.
  - Added `DutyDefinition` schema declaring ship duties, station bindings, base shift durations, and clearance reward matrices.
  - Added `DutyCompletedBroadcast` for wire dispatch of completed shift duties, credit earnings, and clearance XP progression.
  - Extended `StationFixture` with optional contextual in-world interaction prompt strings (`prompt?: string`).
