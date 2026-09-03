# @kybernetes/web

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
- e4332d9: ### In-World Visual Overhaul: High-Detail Procedural Vector & Shader Art
  
  - **Ship Architecture & Room Plating**:
    - Implemented bespoke procedural floor shaders in `DECK_FLOOR_FS` for all vessel compartments: Command Bridge (hexagonal slate tiles with concentric command dais rings), Reactor Engineering (industrial diamond tread plates with high-voltage hazard warning circles), Cargo Bay & Ore Hold (scuffed freight panels with yellow loading zone striping), Armory & Security (ballistic gunmetal with inset crimson caution borders), and Central Transit Conduit (ribbed runner with luminous cyan navigation tracks).
    - Added soft 14px ambient occlusion perimeter drop shadows along room bulkheads.
    - Multi-layer armored bulkheads: directional wall drop shadows (+4, +5), 7.5px dark structural casing core, 2.8px metallic beveled edge highlight, and panel seam ticks every 32px.
    - Sliding hydraulic blast doors with recessed track frames, LED clearance indicators (green/red), and hazard warning chevrons.
  - **Bespoke Station Machinery Models (`StationModels.ts`)**:
    - Procedural vector machinery for all 9 ship stations (Command Helm, Reactor Core Monitor, Armory Gun Locker, Cargo Mag-Winch, Bio-Dome Scrubber, Bunks, Galley, and Dispensers) with proximity interaction targeting brackets.
  - **Characters, Combatants & Weapons (`PawnModels.ts`)**:
    - Spacesuit silhouettes with rear oxygen thruster packs, role-colored shoulder chevrons, reflective helmet visors, walk bobbing, and hands holding equipped weapons (`kinetic_carbine`, `pulse_laser`, `arc_welder`).
    - Spiked void-pirate raider models with horizontal crimson visors and armed plasma carbines.
    - Automated sentry turrets with rotating dual-barrel chassis and sweeping red laser targeting beams.
  - **Atmospheric Lighting, VFX & Camera Dynamics (`VesselCanvas.tsx`)**:
    - Instantaneous weapon muzzle flash light bursts that illuminate the room and cast dynamic wall shadows.
    - Microscopic atmospheric dust motes floating through the ship's air system.
    - Reactor core ambient pulse breathing in Engineering.
    - Tactical camera dynamics: mouse look-ahead offset towards cursor, decaying weapon recoil screenshake, and smooth mouse-wheel tactical zoom (0.75x to 1.25x) with pixel-accurate world raycasting.
- 8da4d68: Implement performant Line of Sight (LoS) raycasting with static light polygon caching and realistic persistent Fog of War:
  - Add pure TypeScript `isPointInPolygon` (Jordan curve ray-crossing test) and `ExplorationGrid` spatial data structure in `@kybernetes/sim-core`.
  - Add bounding-box pre-culling to `computeVisibilityPolygon` for a 90% reduction in raycast math.
  - Implement static ceiling light visibility polygon caching in `WebGL2Renderer`, invalidating only when blast doors change states.
  - Introduce persistent world-space Fog of War framebuffer (`fowFBO`) tracking explored ship regions with smooth vector rasterization.
  - Add `FOW_AMBIENT_FS` shader modulating ship room ambients: unexplored areas are shrouded in pitch black void, explored areas retain dimmed tactical memory blueprint, and active sightlines receive full dynamic lighting.
  - Filter dynamic entities (intruders, remote pawns, and floating nametags) so they are concealed unless in the player's active Line of Sight or immediate ambient awareness.
- d047572: ### Rimworld + FTL Tactical Visual Overhaul & Damage Control Viewport
  
  ![Kybernetes Milestone 3 Tactical Telemetry & Subsystems](https://raw.githubusercontent.com/Rouby/kybernetes/main/docs/images/milestone3_viewport.png)
  
  - **Direct In-World Station Interactions & Round Progress Bar**:
    - Removed full-screen station console modals; fixtures now execute their primary action directly upon pressing `[E]` without interrupting the game viewport.
    - Hardware-accelerated round circular progress ring rendered on the 2D canvas directly above the active fixture (`renderRoundProgressBar.ts`), showing action percentage, verb label, and glowing radial arc.
    - Lean in-game HUD overlay bar with progress readout and abort control (`[ESC] Abort Shift`).
  - **Modular 2D Canvas Engine (`src/canvas/`)**:
    - **FTL-Style Outer Hull & Space Void (`renderBackground.ts`, `renderShipHull.ts`)**:
      - Outer armor silhouette with chamfered hull corners, radiator cooling fins, and dual aft ion thrusters with pulsing plasma plumes.
      - Deep space background with subtle starry depth, twinkling parallax stars, and soft nebular gas dust.
    - **Tactical Room Plating & Ambient Occlusion (`renderDeckFloors.ts`, `renderBulkheads.ts`)**:
      - Room-specific floor plating: hex-tech bridge with glowing command ring, diamond-plate engineering deck with diagonal yellow/black hazard warning tape and floor coolant conduits, sanitary checkerboard galley, and freight grids.
      - Rimworld-style ambient occlusion: interior walls cast soft directional drop shadows onto floor tiles for tangible 3D depth.
      - Double-lined metallic FTL bulkheads with beveled highlights and etched subsystem deck emblems.
    - **Detailed Mechanical Fixtures (`renderFixtures.ts`)**:
      - Multi-tier cylindrical reactor with animated pulsing plasma core.
      - Curved holographic bridge helm with multi-monitor tactical displays.
      - Rimworld-style crew cots with pillows, folded blankets, and vitals headboard monitors.
      - Industrial nutrient dispensers, hydration fountains, bio-scrubber fans, and weapon racks.
    - **Rimworld-Style Capsule Pawns (`renderPawn.ts`)**:
      - Rounded pill/capsule torso with soft grounded elliptical drop shadow.
      - Detached floating hands that dynamically rotate and position toward movement and facing angles.
      - Animated walking bob (vertical hop and hand sway during locomotion).
      - Role-based departmental apparel coloring and directional helmet visors.
    - **Atmospheric Hazard Effects (`renderHazards.ts`)**:
      - Multi-particle compartment fires with hot yellow cores, licking orange flame tongues, rising dark smoke, and floating ember sparks.
      - Hull breaches with radiating frost fracture lines and cyan venting decompression gas particles.
  - **Diegetic Tactical Telemetry Rail (`TelemetryRail.tsx`)**:
    - Modular StyleX panels with real-time thermal gauges, scrubber efficiency bars, kinetic shields, and damage control triage buttons.
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
- 8da4d68: Migrated all gameplay HUD elements into full-screen diegetic WebGL2 rendering and stripped immersion-breaking debug clutter:
  - Implemented spherical helmet visor curvature via vertex shader barrel distortion (`u_curvature = 0.055`) and tessellated quad/border geometry
  - Added dynamic aspect ratio safe positioning for top and bottom HUD panels to prevent clipping across ultra-wide and custom displays
  - Rendered authentic 30-round double-stack brass & copper ammunition cartridges with live spending, low-ammo warnings, and reload animations
  - Added magazine capacity and tactical reloading mechanics to the kinetic carbine with manual reload (`[R]`), auto-reload on empty, reserve pool (`120`), and reload progress
  - Rebound Crew Manifest / Origin selection to `[P]` (`KeyP`) or `Shift+R` to dedicate `[R]` to weapon reloading
  - Inverse-distortion mouse uncurving in `HudHitTester` for pixel-accurate click and hover detection on curved interactive widgets
  - Removed debug cheat buttons (+PASTE, +WATER, +REST), debug battlestation status toggles, and ship console telemetry from personal suit visor
  - Replaced DOM sidebars with edge-to-edge 100vw x 100vh WebGL2 viewport, preserving external React modals for lobbies and manifests

### Patch Changes

- 8da4d68: Eliminate duplicate vessel joining and introduce diegetic Main Menu:
  - Prevent auto-registration of raw WebSocket connections into sessions on the server daemon; sockets remain unassigned until an explicit JOIN_VESSEL packet is received.
  - Remove unconditional JOIN_VESSEL packet dispatch on ws.onopen in useVesselSocket.
  - Add MainMenu component providing player dossier customization (callsign, starting role) and two primary vessel commissioning modes: "Commission New Vessel" (random 6-char Beacon frequency) and "Board Existing Vessel" (Subspace Beacon code input).
  - Quick board button conditionally rendered only in E2E testing mode.
  - Add "Disembark" action in shipboard HUD allowing players to leave an active vessel and return to the Main Menu.
  - Synchronize active dual-operator protocols and collaborative shifts upon new client admission.
  - Update full Playwright test suite to board via Main Menu or test helper.
- 54dea2d: Modularize large monolithic modules into single-responsibility passes, hooks, and services:
  - Decomposed `VesselCanvas.tsx` by extracting `usePredictiveProjectiles`, `useTacticalCamera`, and `useCanvasWeapons` hooks.
  - Decomposed `WebGL2Renderer.ts` by extracting `FramebufferManager`, `ParticleSystem`, `StarfieldPass`, `DeckPass`, `LightingPass`, and `FogOfWarPass`.
  - Decomposed `server.ts` by extracting `types.ts`, `deltaBroadcaster.ts`, and `actionRouter.ts`.
  - Preserved 100% test coverage and wire compatibility across all E2E and unit test suites.
- Updated dependencies [8da4d68]
- Updated dependencies [8da4d68]
- Updated dependencies [d047572]
- Updated dependencies [d047572]
- Updated dependencies [f2792ac]
- Updated dependencies [8da4d68]
- Updated dependencies [e4332d9]
- Updated dependencies [c231985]
- Updated dependencies [dee1cff]
  - @kybernetes/protocol@0.3.0
  - @kybernetes/sim-core@0.3.0

## 0.2.0

### Minor Changes

- 8d842cb: ### 2D Viewport, Locomotion & Diegetic HUD
  
  ![Kybernetes Milestone 2 Viewport and HUD](https://raw.githubusercontent.com/Rouby/kybernetes/main/docs/images/milestone2_viewport.png)
  
  - **Hardware-Accelerated 2D Viewport (`VesselCanvas.tsx`)**:
    - HTML5 2D Canvas viewport tracking pawn locomotion with smooth camera interpolation.
    - Floor grid rendering, tactical compartment tags, bulkhead silhouettes, station interactive glyphs, and dynamic Line of Sight polygon clipping.
    - Responsive `ResizeObserver` maintaining a pixel-perfect 1:1 aspect ratio across all display resolutions.
  - **Pawn Movement Controller (`usePawnMovement.ts`)**:
    - WASD and Arrow Key locomotion controller with normalized diagonal vectors and collision sliding.
    - Proximity detection engine notifying the HUD of nearest interactable stations.
  - **Origin Manifest Modal (`RoleSelectModal.tsx`)**:
    - StyleX modal for selecting starting crew origins, displaying departmental postings, badges, and trait descriptions.
  - **Station Docking Console (`StationConsoleModal.tsx`)**:
    - Interactive modal triggered by pressing `[E]` near fixtures.
    - Supports starting/aborting duties with real-time shift progress meters, bunk sleep cycles for stamina regeneration, and nutrient paste / water recycling dispensers.
  - **Compile-Time StyleX Integration**:
    - Added `@stylex stylesheet;` integration to `index.css`, generating 4.54 kB of compile-time CSS rules and design tokens with zero runtime overhead.
  - **End-to-End Verification (`e2e/milestone2.spec.ts`)**:
    - Comprehensive Playwright tests covering WASD movement coordinates, role manifest switching, station proximity prompt detection, and duty execution.

### Patch Changes

- Updated dependencies [8d842cb]
- Updated dependencies [8d842cb]
  - @kybernetes/protocol@0.2.0
  - @kybernetes/sim-core@0.2.0
