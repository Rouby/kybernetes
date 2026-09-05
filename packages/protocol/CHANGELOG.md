# @kybernetes/protocol

## 0.4.0

### Minor Changes

- 03c84e8: Replace tuned air-loss constants with a mass-conserving compartment decompression model
  
  Air loss is now driven by compressible-flow physics instead of tuned decay rates:
  
  - New `spatial/atmosPhysics` core: 13 control volumes with real cubic-metre sizes,
    isentropic orifice flow (choked below pressure ratio 0.528, subsonic above), exact
    mole/energy bookkeeping, and per-opening areas (blast door 3 m2, purge vent 4 m2,
    full rupture 1 m2, kinetic puncture 40 mm reference, partition holes 40 mm).
  - Open doors vent a compartment in seconds; kinetic punctures leak over minutes.
    Sealed rooms hold pressure exactly; patching or closing stops loss.
  - `tickCellularAtmos` keeps its signature: the cell grid is now a view layer over
    compartment means, so HUD overlays, drag vectors, ECS repressurisation, fire,
    and server vitals all behave as before.
  - Suit hypoxia keys on oxygen partial pressure instead of separate pressure/O2 gates.
  - Hull weld time scales with breach size (puncture 3 s, rupture 8 s).
  - Fire spread is deterministic (position-hashed, no `Math.random` in the tick).
  - Protocol adds `BreachDescriptor` and `CompartmentAtmosphere` wire types;
    `hull.breaches` string ids stay wire-compatible.
  - Airflow drag follows the full vent path past already-reached doorways and pushes
    along the opening normal on top of the vent, so the pull no longer stalls to zero
    for pawns standing inside doors or on hatches.
- 5af7ce8: Implement high-fidelity shipboard environmental thermodynamics and survival simulation engine:
  - 2D Cellular Automata Deck Grid (20px x 20px, 2400 cells) modeling pressure, oxygen, temperature, toxic smoke, and decompression airflow vectors.
  - EVA Suit lifecycle: manual visor toggle [H], 600s O2 reservoir, suit integrity punctures and repairs, emergency refills at airlocks.
  - Hypoxia blackout, hypothermia, and crawl-speed incapacitated state with 45s bleedout timer.
  - WebGL fullscreen post-processing vignettes for tunnel-vision hypoxia and edge frost.
  - Diegetic Web Audio visor seal pneumatics, hypoxia breathing loop, and suit O2 alarms.
  - Server-authoritative vitals and room atmosphere synchronization with client prediction.
  - Toggle-able tactical environmental sensor view-overlays: Oxygen Availability ($O_2$), Thermal Distribution ($T$), and Barometric Cabin Pressure ($P$) with top-center scale legends, real-time cell-by-cell automata color-grading with micro-seam insets, and calm void indigo vacuum visualization.
  - High-speed compressible flow decompression engine: Sonic rarefaction expansion wavefront (<0.15s), choked orifice evacuation (~0.3-0.5s rapid blowdown to hard vacuum for whole open doors/hatches and full breaches vs prolonged 15-30s evacuation for small punctures), rapid inter-room pneumatic pressure equalization across open blast doors (~1-1.5s), strict closed door isolation (including catwalk spine pressure bulkheads), space vacuum sink non-accumulation, unified single-volume cascade across open doors, strong aerodynamic pawn pull with station console anchoring, adiabatic vapor flash plume, and crisis vacuum acoustic muffling (220 Hz lowpass).
  - `[V]` hotkey and interactive visor `SENSOR [V]` button with audio click feedback and HUD banner notifications.
- 5ec15a8: Implement thin intro docking and captain hire loop:
  - Wire contract for station spawn, simulated fly-in/out docking phases, 2-of-3 captain job offers (Engineer, Cook, Deckhand), hire acceptance, and transit updates.
  - Deterministic sim-core intro state machine with docked-only hiring, departure countdown, transit progress, NPC crew fill-ins, and next-leg restart.
  - Authoritative server hire flow with per-session offer counter, phase-change docking broadcasts, and departure alerts.
  - Web docking banner, E-to-talk captain flow, two-card hire modal, and Playwright intro journey coverage.
- 13a6e13: Moving ships architecture improvements across P0, P1, and P2:
  - P0: Fixed breach repair welding distance check to account for ship translation offset in world space, enabling hull repair while underway.
  - P0: Exported `STATION_AMBIENT_ATMOS` and supplied nominal habitat atmosphere to station crew, preventing vacuum damage inside station lobby and docking bay.
  - P0: Confined `CellularAtmosGrid` strictly to ship compartments (`isShipSideRoom`), preventing station cells from translating with the ship during undocking.
  - P0: Exported `SPACE_VACUUM_ATMOS` and implemented 3-tier atmosphere resolution (`resolveAtmosphereAt`), correctly subjecting unsealed crew in space vacuum to hypoxia and decompression ebullism.
  - P1: Added pure frame conversion helpers (`toShipLocal`, `toWorld`) and unambiguous `SHIP_ROOM_IDS` lookup to sim-core.
  - P1: Offloaded door rendering and cellular atmospheric overlay translations to GPU model matrices, eliminating per-frame CPU vertex array allocations.
  - P2: Introduced `VesselKinematics` contract on `SHIP_DOCKING_UPDATE`, implemented smoothstep kinematic curves for docking and departure, and modulated aft thruster flare during ship motion.
  - Fixed deck floor procedural textures and tactical room decals (helm dais, scrubber ring, reactor warning, cargo pad, catwalk spine) to evaluate against the ship-local reference frame, ensuring they remain locked to vessel compartments during motion.
  - Fixed bulkhead bullet impact hole/scorch decals (`partitionHoles`) to record and store in ship-local reference frame, translating faithfully with ship offset in `DeckPass`.
  - Implemented Galilean projectile momentum inheritance: weapons fired aboard moving ships inherit ship velocity vector $\vec{V}_{ship} = (v_x, v_y)$ in both client prediction and server authoritative simulation, eliminating projectile carry drift and ensuring perpendicular shots travel straight across ship compartments.
- d6eff22: Overhaul CSS Hesperia vessel design to a realistic submarine/hard-sci-fi architecture where space is a luxury:
  - Scaled vertical room dimensions to a dense 140px height ($Y: 228 \to 368$ upper deck, $Y: 432 \to 572$ lower deck), creating a sleek 2.4:1 submarine hull profile ($940 \times 380\text{px}$) and eliminating floor void.
  - Reduced central corridor to a narrow 64px catwalk spine ($Y: 368 \to 432$) with subfloor conduit grating, glowing guide rails, and intermediate pressure blast bulkheads.
  - Densely packed compartments with collidable cargo container stacks, reactor containment shroud barriers, avionics server racks with diagnostic LEDs, dual algae bioreactor vats, crew sleep pods, and mess dining furniture.
  - Re-architected 11-compartment micro-grid with dedicated Life Support scrubber bay, Avionics matrix, dual-stage interlocked airlocks, and wall-recessed living bunks and galley.
  - Re-architected clean 1:1 station identifiers with updated bot patrol routines and shift checklist duties.
  - Upgraded WebGL2 deck shaders, contoured armored hull silhouette, and aft thruster plume arrays.
  - Enhanced tactical camera with tighter default zoom (1.35x) and a tighter framing range (0.95x - 1.85x) to frame compact submarine compartments intimately.
  - Fixed crew hover reticle `[ ]` brackets and world speech bubble projection so they scale and stay pixel-locked to pawns across all zoom levels.
  - Replaced mouse-click door operation across rooms with diegetic proximity interaction: corner brackets frame the hatch only when standing directly in front of it, and pressing `[E]` toggles the blast door open/closed with synchronized sound.
  - Removed in-world UI overlay tag pills for interactions, maintaining a completely uncluttered viewport and displaying interaction intents diegetically on the lower-right helmet visor card.
  - Implemented directional gaze cone checking for all door and station interactions ($\approx \pm 70^\circ$), ensuring interactions only trigger when looking directly at the target.
  - Fixed stuck door toggle state tracking so players can immediately alternate opening and closing doors in place without needing to leave and re-enter proximity range.
- 5ec15a8: South station with real alternating ship motion:
  - Station relocated to a full-width south block with a vertical docking gauntlet and west approach windows; east wing removed.
  - Deterministic dock offset (west entry on even legs, east on odd, through-exit, off-screen hold) with ship/station frame seams across walls, rooms, stations, lights, doors, and visibility.
  - Server carries aboard crew and bots, samples and collides frame-aware, and guards gauntlet hatches.
  - Web renders every layer offset, predicts and carries the local pawn, tracks live docking eta for smooth approach, and proves motion end-to-end via the offset sweep journey.
  - `legIndex` on the docking broadcast; quick-board honors the URL beacon so parallel sessions stay isolated.
- 5ec15a8: Seamless station start with walk-through docking gauntlet:
  - New `DoorState.isSealed` wire flag for docking-cycle door locks.
  - Station wing on the unified deck (bay, lobby, gauntlet tube), phase-driven gauntlet hatches, cyclic docking turnaround, and bay spawns with traversal unit coverage.
  - Authoritative gauntlet door sync, toggle guard, bay spawns, and join-time docking snapshot.
  - Web station floors, hull plate, NPC figures, sealed-door prompt filtering, relocated click-through docking banner, and quick-board session isolation fix.
  - Gauntlet boarding e2e journey plus hardened unique test beacons.
- 5ec15a8: Add station hub dressing with a docking viewport window and job board:
  - New `job_board` and `viewport_window` station fixture types with mess-hall and docking-bay placements.
  - Canvas job board panel with three billet rows and a bay window framing the Kestrel fly-in, docked hold, departure, and in-transit states driven by the authoritative docking phase.
  - Playwright hub render coverage and StationHub transform unit tests.
- d2bb947: Implement systemic Watch Rotation core gameloop and crew progression:
  - Two-Phase Watch Rotation: Structured alternation between Active Watch duties and Off-Duty Liberty.
  - Bunk Sleep Handover: Bunk resting (`berth_pod_alpha` / `berth_pod_beta`) clears fatigue and triggers shift evaluation, clearance XP, and watch rollover.
  - Purely Systemic Decay: Reactor thermal drift, scrubber wear, and dynamic subsystem replenishment tied to duty execution.
  - Staggered Watch Sections: Watch Section Alpha and Bravo rotation tracking with compact HUD badge indicators.
  - Department Clearance & Salary Promotions: Escalating clearance levels, credit salary multipliers, and rank badges.
  - Shift debrief modal with clearance promotion banner and next-watch commencement.
- 5ec15a8: Windows as transparent wall segments flanking the dock:
  - New `WallSegment.isWindow` flag; four lobby windows (two per side) block movement and airflow but stay invisible to vision and lighting.
  - Removed the viewport fixture boxes and glass-ship rendering; the real moving ship shows through the glass.
  - Bulkhead pass renders glass panes with frame ticks; traversal and occlusion unit coverage updated.

### Patch Changes

- 5ec15a8: Remove the role pickers so captain hire is the only billet path:
  - Delete `RoleSelectModal` and its KeyP/KeyR shortcut; the visor button is now BILLET and requests hire from the captain.
  - Dossier onboarding is callsign + suit color only (starting origin defaults, persisted crew keeps theirs); copy points new operators at captain-assigned billets.
  - Fix `@kybernetes/protocol` missing `"type": "module"`, which hid runtime value exports (`JOB_OFFER_CATALOG`) from the tsx dev server.
  - Milestone2 journey asserts the old picker is gone; dossier specs embark without role clicks.
- f7b8890: Harden test strategy and fix the production server entry (no game behavior change): portable Playwright screenshot paths under test-results, socket-predicate waits via e2e helpers, retries + failure-only artifacts, production-artifact webServers, smoke/full CI split, wire round-trip coverage for protocol, WS loopback tests for the server daemon, and unit tests for web HUD formatters. Also fixes `yarn --cwd apps/server start`, which crashed under plain Node (extensionless ESM imports, missing package type): the server package is now `"type": "module"` with `.js` relative import extensions, and `build` emits a self-contained `dist/boot.mjs` bundle that `start` runs.
- 1f78aa0: Implement physical wall segment breach holes, Arc Welder breach repair, and automatic ECS atmospheric repressurization:
  - **Physical Wall Segment Breach Holes**: Added `HESPERIA_BREACH_LOCATIONS` and `carveBreachedWallSegments` in `deck.ts`, physically carving $\approx 18\text{px}$ gaps into outer hull bulkheads during active breaches.
  - **Lighting & Line-of-Sight Penetration**: Updated `getOpaqueWallSegments` to use carved wall geometry, allowing interior lighting rays and line-of-sight to pierce through the breach hole into space vacuum.
  - **Diegetic WebGL Visuals**: Rendered jagged molten edges, pulsing thermal stress glows, and cyan frost fracture spurs at active breach holes in `DeckPass`, with decompression airflow vapor emanating directly through the opening.
  - **Arc Welder Physical Repair**: Added `trackBreachWelding` and updated server `tickActiveWelders` to accumulate repair progress (~3.0s) when crew pawns weld directly at the breach hole, repairing hull plating and broadcasting damage triage results upon completion.
  - **Volume-Scaled ECS Repressurization**: Added automatic environmental control system replenishment in `atmosGrid` and `state.ts`: sealed compartments automatically warm to 21°C, restore pressure to 101.3 kPa, replenish O2 to 20.9%, and dilute smoke, consuming proportional shipwide life support O2.
  - **Wire Telemetry & Visor HUD**: Added `isRepressurizing` to `RoomAtmosphereSummary` and display `ECS REPRESSURIZING` status on the visor HUD during compartment recovery.
  - **Kinetic Weapon Wall Damage & Micro-Breaches**: Outer hull impacts from kinetic carbines (5% roll) and railgun pistols (35% roll) trigger micro-puncture decompression events (`puncture_<roomId>`) with structural hull degradation (-0.4% / -1.5% integrity).
  - **Railgun Pistol Weapon & Audio**: Added `railgun_pistol` weapon loadout (hotkey `4`, armory cycle) with hypervelocity sabot slug visuals, heavy tactile screen shake, and synthesized supersonic audio.
  - **Breach-Aligned Venting Particles & Drag**: Aligned atmospheric decompression plumes, vapor mist glints, and cellular airflow drag vectors to the exact puncture coordinates and bulkhead normal vector rather than room center geometry.
  - **Interior Partition Penetration & Equalization**: Interior wall hits create `partitionHoles` impact craters, enabling cellular atmospheric diffusion and gas/smoke pressure equalization between adjoining rooms across sealed bulkheads.
  - **Physical Orifice Limits on Interior Punctures**: Throttled decompression wave propagation and cellular gas diffusion across interior partition holes (`partitionHoles`) into breached or vacuum rooms to realistic orifice limits (`kRate` throttled to ~0.035, max transfer capped at 1.5 kPa per substep). Intact rooms no longer explosively depressurize at once when connected to a breached compartment by a small bullet hole, and onboard ECS can actively maintain room pressure against minor puncture leaks.

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
