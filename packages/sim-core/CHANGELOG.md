# @kybernetes/sim-core

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
- 8da4d68: Implement performant Line of Sight (LoS) raycasting with static light polygon caching and realistic persistent Fog of War:
  - Add pure TypeScript `isPointInPolygon` (Jordan curve ray-crossing test) and `ExplorationGrid` spatial data structure in `@kybernetes/sim-core`.
  - Add bounding-box pre-culling to `computeVisibilityPolygon` for a 90% reduction in raycast math.
  - Implement static ceiling light visibility polygon caching in `WebGL2Renderer`, invalidating only when blast doors change states.
  - Introduce persistent world-space Fog of War framebuffer (`fowFBO`) tracking explored ship regions with smooth vector rasterization.
  - Add `FOW_AMBIENT_FS` shader modulating ship room ambients: unexplored areas are shrouded in pitch black void, explored areas retain dimmed tactical memory blueprint, and active sightlines receive full dynamic lighting.
  - Filter dynamic entities (intruders, remote pawns, and floating nametags) so they are concealed unless in the player's active Line of Sight or immediate ambient awareness.
- d047572: ### Core Simulation Dynamics for Reactor, Atmosphere, Hull & Naval Threats
  
  - Implemented pure reactor thermal math in `src/systems/reactor.ts`: output MW generation, coolant-modulated heat dissipation, status thresholds, and emergency coolant venting.
  - Implemented pure life support dynamics in `src/systems/lifeSupport.ts`: O2 consumption, scrubber recycling, scrubber degradation, and fire/breach atmospheric consumption.
  - Implemented pure hull & kinetic shield mechanics in `src/systems/hull.ts`: 75% kinetic shield absorption, structural hull stress, breach generation, and emergency hull welding.
  - Implemented naval threat resolution in `src/systems/navalCombat.ts`: incoming torpedoes, coronal radiation bursts, micrometeor storms, point-defense turret (PDT) interception rolls, and damage impact consequences.
  - Integrated all subsystems into deterministic tick pipeline in `src/state.ts` and added 23 unit tests in `src/subsystems.test.ts`.
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
- c231985: Implement Pure Procedural Web Audio Sound Engine with 2D spatial acoustics, bulkhead occlusion, and telemetry-driven living ship dynamics:
  - Pure spatial acoustic calculations in `packages/sim-core/src/spatial/acoustics.ts`: distance attenuation, stereo pan, bulkhead intersection raycasting through opaque hull geometry and doors, and multi-tier acoustic cutoff filters (20kHz -> 1.2kHz -> 380Hz)
  - Zero-external-sample procedural sound engine in `apps/web/src/audio/` using pure Web Audio API synthesis:
    - `ReactorDroneSynth`: Continuous dual-triangle reactor drone scaling with output MW (48Hz -> 72Hz), pink noise air loop rolling off with O2 depletion, and 15.6kHz CRT flyback whine on Command Bridge
    - `MetallicPlateSynth`: Deck surface-aware footsteps (steel deck, engineering grate, bridge linoleum) and structural hull creaks/groans under damage (<50% integrity)
    - `PneumaticSynth`: High-pressure pneumatic equalization sweeps, solenoid latch clicks, and decompression venting bursts
    - `BallisticsSynth`: Kinetic carbine Dirac pop/thud, pulse laser frequency chirps, arc welder continuous plasma sizzle, raider plasma shots, and ricochet/impact thuds
    - `TerminalUiSynth`: Tactile mechanical switch clacks, station interaction prompt chirps, telemetry packet squelches, and heavy debrief evaluation stamp thuds
    - `VitalsMonitorSynth`: Procedural heartbeat accelerated by fatigue and low health, suffocation inhale/exhale sweeps when O2 <= 25%, and post-explosion tinnitus ringing
    - `AlarmSynth`: Dual-tone red alert sirens, caution chimes, and Geiger counter clicks
  - 5-Bus Gain Routing (`master`, `ambience`, `foley`, `ui`, `crisis`) with dynamic master crisis low-pass filter ducking and `localStorage` persistence
  - StyleX `AudioSettingsModal` with volume sliders, test audio triggers, mute toggle, and reactive state synchronization
  - Viewport integration: WebGL top bar button `AUDIO [O]`, hotkeys `[O]` (mixer modal) and `[U]` (quick mute), footstep distance cadence tracking (every 56px), and Playwright e2e test suite (`audio.spec.ts`)
- dee1cff: ### Realistic 2D Lighting, Dynamic Shadows & Dark Corridors
  
  - **Hardware-Accelerated 2D Lighting & Shadow Pipeline (`apps/web`)**:
    - Implemented multi-pass 2D lighting engine using a dedicated Lightmap Framebuffer Object (FBO).
    - Raycasted 2D visibility polygon triangle fans with smooth quadratic physical falloff (`(1.0 - d/R)^2`).
    - Screen-space multiplicative blending (`gl.blendFunc(gl.DST_COLOR, gl.ZERO)`) to apply illumination and realistic occluding shadows over the ship interior.
    - Directional player pawn flashlight with smooth angular cone falloff, 360° close-proximity ambient halo, and real-time shadow casting as the player turns and aims.
    - Closed blast doors dynamically occlude light; opening doors causes light to flood across thresholds into adjacent hallways.
    - Dynamic illumination from flying pulse lasers, raider plasma bolts, continuous arc welder arcs, and impact spark particles.
  - **Atmospheric Dark Corridors & Industrial Bulkhead Lamps (`@kybernetes/sim-core`, `apps/web`)**:
    - Central transit corridor ambient lighting lowered to ~7% deep gunmetal/slate darkness (`[0.06, 0.07, 0.10]`) with dark industrial ribbed deck plating.
    - 4 spaced industrial corridor ceiling lamps (warm tungsten halogen and cool tactical fluorescent strips with subtle atmospheric electrical flicker).
    - Physical ceiling lamp fixtures rendered along the corridor ceiling conduit with glowing lenses and center diodes.
    - Exposed `HESPERIA_LIGHTS`, `ROOM_AMBIENTS`, and `getOpaqueWallSegments` helper for shadow raycasting.

### Patch Changes

- Updated dependencies [8da4d68]
- Updated dependencies [d047572]
- Updated dependencies [f2792ac]
- Updated dependencies [8da4d68]
- Updated dependencies [e4332d9]
  - @kybernetes/protocol@0.3.0

## 0.2.0

### Minor Changes

- 8d842cb: ### Simulation Core, Roles & Spatial Physics
  
  - **Starting Origin Roles (`roles.ts`)**:
    - `wiper` (Maintenance Wiper): Engineering department, +15% repair speed, +20% thermal resistance in reactor bays.
    - `galley_hand` (Galley Hand): Sustenance & Logistics, -20% food/water consumption, +10% stamina aura.
    - `security_private` (Security Private): Armory & Defense, +25% combat efficiency, +15% baseline damage resistance.
    - `hydro_tender` (Hydroponics Tender): Biosphere & Life Support, +20% atmospheric scrubber speed, bio-toxin immunity.
    - `stevedore` (Cargo Stevedore): Hold Logistics & Salvage, +30% inventory carrying capacity, +15% scrap yield.
  - **Ship Duty Engine (`duties.ts`)**:
    - Catalog of 8 departmental duties across reactor, mess, armory, hydroponics, and cargo stations.
    - Deterministic tick runner calculating stamina consumption, role specialization boosts (1.5× speed), and starvation/dehydration penalties (halves work velocity per PRD 3.6).
  - **CSS Hesperia Deck Geography (`spatial/deck.ts`)**:
    - Full deck plan: 7 compartments (Reactor Engineering, Galley/Mess, Armory, Hydroponics Bay, Cargo Hold, Bridge, Central Corridor).
    - 16 opaque bulkhead segments and 10 interactive machinery stations.
  - **Physics & Continuous Collision Sliding (`spatial/collision.ts`)**:
    - Circle-to-segment distance and penetration resolution.
    - Multi-axis tangent sliding algorithm (`resolvePawnMovement`) preventing pawn friction sticking along bulkhead surfaces.
  - **Line of Sight & Fog of War (`spatial/visibility.ts`)**:
    - 2D Visibility Polygon raycasting using radial angular sorting of wall endpoints and ray-segment intersections.
    - Forward-facing directional flashlight cone (60° beam) blended with ambient room illumination.
  - **Unit Testing**: 12 new Vitest unit tests verifying collision sliding, raycast occlusion, role matrices, and duty rewards.

### Patch Changes

- Updated dependencies [8d842cb]
  - @kybernetes/protocol@0.2.0
