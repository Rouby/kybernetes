# @kybernetes/sim-core

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
- e33f4ed: Replace the legacy cellular air solver with air-sim as the single authoritative model
  
   sim-core now owns one air-sim AtmosphereSimulation per hull (vessel + station)
  instead of the Float32 cell grid, compartment orifice solver, and airVenting map:
  
  - New spatial/shipAtmosphere owner module: 13 room-uniform compartments built from
    real cubic-metre volumes, static Door portals from createInitialDoors, and breach
    / puncture / partition holes added and removed as ordinary Puncture portals.
  - One sim per vessel / station: VesselSimulationState carries atmos + stationAtmos,
    ticked every frame with substepped dt, door-ratio sync, room-level fire burn and
    ECS repressurisation with life-support reserve drain.
  - Room-uniform O2: summaries, vitals sampling, and boarding AI read per-room means;
    corridor keeps fwd / mid / aft thirds plus an aggregate corridor view.
  - Boarding takes an authoritative air snapshot (vented rooms, 100-scale O2 health,
    suctions); direct unit-test ticks keep a door-based fallback vent model.
  - Server samples ship / station / vacuum atmospheres from the owned sims and pushes
    pawns with sim-derived vent wind; web overlay renders room rects from wire
    summaries and drag uses summary-based decompression sources.
  - Deletes spatial/atmosGrid, spatial/atmosPhysics, and systems/airVenting with
    their cell-based tests; adds spatial/shipAtmosphere coverage (conservation,
    determinism, breach-vs-puncture ordering, cascade isolation, portal lifecycle,
    fire starvation, ECS drain, sampling, wind).
- 6585fd2: Visualize punctures, breaches, and air loss from live sim state instead of room-top anchor guesses. Snapshot portals now carry breach geometry (area, birth tick, frame-local segment, room) so deltas fire when holes widen; sim-core gains a pure breachView module (render models, flow-axis math, exact segment carving shared by the renderer and LOS); the viewport renders area-scaled molten rims that cool into frost over 10 s, black vacuum insets, puncture decals, directional breach plumes with throat collars, wind-driven dust drift, throat arrows and vent shimmer on the atmos overlay, plus live per-room breach counts and wind vectors.
- 477dd3f: Stop single bullets from blowing rooms to vacuum: wall hits now punch a 0.05 m² puncture (a slow, survivable leak) instead of a 1.5 m² hole, and repeat hits landing on a live breach widen it (+0.1 m² each, capped at the old 1.5 m² full section) so sustained fire still tears walls open. A lone round in a 100 m³ cabin keeps >50 kPa after 5 s where the old hole left <10 kPa.
- 95d53da: Screenshot-driven docking and overlay correctness pass:
  - Continuous boarding: tight gate-leaf transfer volumes with stride-scale landings replace the 100px teleport yank; dock gates read walkable for movement and sight while the cycle holds them (air graph keeps sealed-safe states, so nothing vents); dock leaves refuse manual toggles and bot discipline while the cycle owns them.
  - Camera: frame-origin velocity feedforward keeps embarked views panning with docking burns instead of juddering behind snapshot deltas.
  - Overlays: atmos quads derive ship/station side from room frames (new hub rooms no longer ride the vessel offset); fog-of-war volume covers the harbor plus docked vessel with an explicit world origin on both CPU grid and GPU passes.
  - Breach cuts widen progressively with area so merges grow instead of popping; impact pressure rides the wire for scaled throws.
  - Removed void-zone static station NPCs and repositioned the orphan station hull plate onto the live hub footprint; thruster bells and exhaust moved to the stern.
- b3bd93d: Cutover C3: render data rebacked on compiled harbor hulls
  
  - `spatial/deck.ts` + `spatial/doors.ts` keep every export name and shape but
    compile all data from the harbor hull specs: bare room ids in world/local
    frames, namespaced door ids joining live snapshot portals, doors shut by
    default, stations deferred, plus a framed `harborStatic()` view for clients.
  - Client prediction dogfoods the server: new `predictStep` (same resolver as
    `collidePawn`) and `withSnapshotStates` (authoritative portal overlay where
    destroyed doors become connecting holes); the harbor client collides
    predictions against live `collidersForFrame` output.
  - Frozen-pass data follows the reback (overlay station ids + corridor
    thirds, DeckPass floor-pattern keys); pass logic untouched.
  - Adapter tests updated to harbor truth; tests for C4-owned deprecated
    modules deleted with the reback (their old-geometry behavior goes with
    the modules in C4).
- 27ae342: Cutover C4: default route on v2, old client and legacy sim deleted
  
  - The default route serves the harbor client. New HarborViewport drives the
    frozen WebGL2Renderer (passes, diegetic HUD, StationHub models, shaders,
    audio engine untouched) from v2 snapshots: predicted hero + remotes with
    voice lines, snapshot-synced doors, TELEMETRY atmos mapped to room summaries
    with vent detection, VITALS mapped to visor vitals and welder heat, gauge-
    fed hull/atmos status, and throttled audio ambience plus event foley
    (footsteps, doors, fire, talk/hire, visor, overlay clicks).
  - Deleted the v1 web client (App, all components/hooks), the preview
    scaffolding and its specs, and sim-core legacy (state, gameLoop, bots,
    quests, duties, roles, legacy survival, systems/*) with their tests.
    Web bundle drops 489 to 359 kB.
  - Explicitly kept, pinned by the frozen stack: sim-core intro (kinematics),
    shipAtmosphere, acoustics, fogOfWar, navigation, collision/deck/doors/
    visibility, and protocol v1 render types. Deleting those means remounting
    the viewport first; the cutover notes record the boundary.
- 8422f6b: Add a synced world-plus-air debug view on a separate client URL with live portal wind on the wire:
  - protocol: New optional `AirFlow` table on `TELEMETRY` (q1 portal throat velocity, signed on the roomA-to-roomB axis); absent on pre-flow senders so old clients keep working.
  - sim-core: New `readAirFlows` authority reader plus `quantizeAirFlow` / `significantFlows` helpers; `buildTelemetry` carries the still-air-filtered wind table while staying byte-stable idle.
  - server: Harbor daemon ships the live wind table on every TELEMETRY (full and delta) and on join baselines.
  - web: New `?debug-world=1` (alias `?view=debug`) top-down 2D debug canvas reusing the connected player socket session: rooms colored by pressure/o2/temp overlay, portals by state, cyan wind arrows, pawns with own-player ring, impacts, and a tick/air status panel. Camera follows the owned pawn (F toggles overview, O cycles overlay); `?debug=1` text HUD still composes on top.
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
- 61855fa: Free the trigger: remove weapon overheating, cost sustained fire with bloom and shake
  
  - sim-core: delete the heat record, `tickHeat`, and the `overheated` fire block. Each shot now adds `SPREAD_PER_SHOT` (0.03 rad) of aim bloom up to `SPREAD_MAX` (0.2 rad), applied to the round's direction with deterministic tick-parity alternation so bursts stay centered while groups widen; bloom bleeds off at `SPREAD_DECAY_PER_S` when not firing. Magazines are the only thing that stop the gun.
  - protocol/server: drop `heat` from `VITALS` and the `FIRE_overheated` notice; the fire gate is down/reloading/empty only.
  - web: the fire mirror no longer reads heat, the debug vitals line and heat-driven muzzle logic are gone, and camera shake accumulates trauma per shot (decaying over time) on top of a stronger base kick (5px over 170ms, up to ~12px at full trauma).
- e33f4ed: Generic multi-hull air simulation and wind probe debugging
  
  Ship and station air were two hardcoded fields; the game can now own any number
  of independent hulls:
  
  - New HullTopology registry (hesperia vessel + station, extensible): rooms,
    aggregates, door-link overrides, and static portals as data. Builders, breach
    parsing, partition holes, vent flood, and summaries all resolve through the
    owning hull, with boundary-tolerant door mapping.
  - VesselSimulationState carries hulls: Record<string, ShipAirState>; each tick
    routes hull-local doors, breaches, fires, and partition holes per hull and
    merges summaries. Cross-hull gauntlet doors stay out of every sim.
  - Server routes each pawn to its hull for atmosphere sampling and vent wind.
  - Wind debugging: air-sim exports DragTarget/DragResult, the test recorder
    gains addProbe/refreshLayout with per-frame entity wind/force capture, and the
    HTML report renders probe arrows, values, and metric cards. sim-core runs the
    reporter too and adds a Hesperia breach debug recording plus live addWindProbe
    readings through the hull tick.
- 5ec15a8: Implement thin intro docking and captain hire loop:
  - Wire contract for station spawn, simulated fly-in/out docking phases, 2-of-3 captain job offers (Engineer, Cook, Deckhand), hire acceptance, and transit updates.
  - Deterministic sim-core intro state machine with docked-only hiring, departure countdown, transit progress, NPC crew fill-ins, and next-leg restart.
  - Authoritative server hire flow with per-session offer counter, phase-change docking broadcasts, and departure alerts.
  - Web docking banner, E-to-talk captain flow, two-card hire modal, and Playwright intro journey coverage.
- 1a5a658: Make stations and ships lived-in: dense hub plus wired workhorse ship.
  - protocol: New v2 `living` slice (`living.ts`): 15 fixture kinds, CLAIM/VEND/COOK/HARVEST/RECYCLE/REPAIR intents with validators and rate limits, optional fixture tables on SNAPSHOT/SNAPSHOT_DELTA, living room resources on TELEMETRY, meal buff on VITALS. Fully additive and round-trip tested.
  - sim-core: New deterministic `world/living` kernel (fixture integrity/claims, power/heat loads, water grey-clean loop, hydro growth, 8s cook cycle, freezer stock, breaker trips) ticked in `tickWorld`; shots pass through fixtures (destruction/damage is deferred to a dedicated feature run); tiered meals (`hot_meal` +35 with mess buff) in survival; harbor scenario stages 19 hub/ship fixtures plus a 4-bot living crew (barkeep, trader, ship cook, hauling deckhand).
  - server: Intent router handles all six living verbs plus INTERACT (aid cabinet, sink, mess table) with frame-aware reach checks; `SimHost` forwards every living verb to the kernel (exhaustive switch, so future intents fail compile instead of dropping silently); covered by host integration tests including a walk-to-interact run; untrusted input never becomes state.
  - web: New `LivingFixtures` WebGL pass (state-driven bar, vendor, market, lockers, stove, freezer, hydro, recycler, breaker, aid, bunks with claim colors), context [E] action with HUD prompt through one facing-gated doors-plus-fixtures contest (37-degree cone, near-field override) so prompt and action always agree (now with mouse-cursor pull, tighter reaches, and wall/shut-door occlusion; glass never blocks), living power/water feeding reactor/water gauges, retired cabin-bunk decor in repurposed rooms, and a living-status HUD strip above the vitals panel (ship power, max heat, clean water, meals ready, hydro growth, mess-buff countdown, breaker/heat/water alerts) fed by aggregated TELEMETRY living rooms. All fixtures rearranged against walls with walkways clear (galley counters north/east, bunks head-to-south-wall, bar north stretch, lockers west stack, breaker on the corridor wall); new dim background `Clutter` pass (wall pipes, vents, posters, corner crates, never in walkways, never interactive, drawn behind everything). Fixture and living tables are retained across SNAPSHOT_DELTA/TELEMETRY deltas so furniture no longer flickers and [E] scans a stable list.
- de03fdf: M8: simulated projectiles with discrete magazines, gated full-auto fire
  
  - FIRE spawns a ticked projectile (velocity, life, owner grace) instead of
    resolving hitscan: each tick marches rounds in short substeps against
    pawns, shut doors, and walls, with contact-point refinement so breaches
    resolve on the correct side. Misses expire silently at end of life.
  - Magazines are discrete and individually tracked (no bullet pool): firing
    spends the loaded mag, reload swaps in the fullest spare over two seconds
    and retains partials (dry mags are discarded). Heat rebalanced for
    full-auto bursts with cooldown as the sustained limiter; FIRE is
    spam-guarded only.
  - One shared fire gate is enforced by the server and mirrored by the client
    from VITALS, so refused shots never send intents, sounds, or flashes
    (downed pawns cannot fire either). Holding F or mouse fires full-auto
    with press-echo flashes; R reloads; the HUD and visor MAG read live
    mag/reserve/spares.
  - Hits record TTL-pruned world impacts that flow through SNAPSHOT with frame
    ids; the viewport feeds them to impact particles once each and draws
    server-simulated tracers (extrapolated by snapshot age) with per-weapon
    colors. Each e2e file owns a private daemon, and scene captures record
    the lobby, doorway, and ship corridor.
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
- 95d53da: Move the debug view to a pawn-less same-port observer with server health:
  - protocol: New `OBSERVE` intent plus `SERVER_STATS` (TPS actual/target, tick ms last/avg, droppedSteps, accumulator, observer count, per-pawn link quality) and `DOCK_STATUS` broadcasts; `SNAPSHOT`/`SNAPSHOT_DELTA` carry an optional persistent `decals` table.
  - sim-core: New pure `debugStats` (TPS window math, link bucketing), `decals` LRU (64, weapon-scaled radii), and `dockStatus` (walkable, boarding_closing countdown, seal-aware) helpers with unit tests.
  - server: `SimHost` observer registry (no pawn/seat/latch/eviction, read-only intents dropped as `observer-readonly`), tick timing + ingress tracking, `SERVER_STATS` 1Hz to observers and `DOCK_STATUS` to all, decal-aware delta baselines.
  - web: New `useHarborObserver` (HELLO+OBSERVE only); `HarborApp` splits player/observer roots so `?view=debug` never mounts movement/fire/door hooks; `DebugWorldView` defaults to overview with click-to-follow, oriented hits, decal rings, and TPS/link/dock panel.
- 95d53da: Make station-to-ship boarding physical and the station worth being in:
  - protocol: New `DOCK_STATUS` channel (phase, walkable, secondsToSeal, gate ids); hire remains role-only, frame changes happen exclusively via dock volumes.
  - sim-core: Station hub grows from 3 to 7 rooms (concourse, security, overlook gallery with window, lounge) with departures/kiosk/vendor fixtures and new spawns; dock transfer is seal-aware with portal-anchored facing-preserving egress; ambient concourse crowd (3 wandering NPCs) joins the captain aboard.
  - server: Broadcasts `DOCK_STATUS` (immediate on change, 1Hz heartbeat) and crossing notices; hire never teleports.
  - web: Gauntlet tube visual (connected walkway vs sealed blinking gates), HUD dock chip (`DOCKED / BOARDING seals in Ns / SEALED`), concourse fixtures, snapshot-driven crowd rendering.
- 95d53da: Replace flat bullet-hole crosses with premium oriented impact rendering:
  - protocol: `SnapshotImpact` gains `angle`/`weapon`/`energy`/`surface`/`breachId`; new `ScorchDecal` table (id, frame, pos, angle, radius, weapon, bornTick) on full snapshots and changed-only deltas.
  - sim-core: Combat records contact normal, weapon, normalized energy, and surface; wall/door hits append weapon-scaled LRU decals; channels quantize and diff the decal table.
  - web: New `ImpactDecalPass` (oriented crater ellipse, rim light, scorch falloff, fresh glow flicker, vacuum frost, per-weapon palettes); `ParticleSystem.addDirectionalImpact` cone sparks + hot core; `DeckPass` renders premium decals and dock tube; debug view draws oriented ticks plus decal rings.
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
- 3157970: M0 rework scaffold: protocol v2, world kernel, and SimHost shells land alongside legacy code
  
  - Protocol v2 (additive, legacy wire untouched): envelope with v/tick/serverTimeMs plus
    HELLO_MISMATCH, input-only ClientIntent union (HELLO, JOIN_BEACON, INPUT, INTERACT,
    DOOR, HIRE, TALK, SUIT, CONSUME, SLEEP, FIRE), ticked ServerSnapshot channels
    (SNAPSHOT 10Hz, TELEMETRY 2Hz, VITALS 5Hz, NOTICE, HIRE_OFFER, MANIFEST, WATCH),
    the single Role enum with legacy role mapping, and runtime validate guards plus
    per-intent rate limits.
  - World kernel scaffold in sim-core: pure types (World, VesselFrame, StationFrame,
    RoomNode, PortalEdge, PawnBody with limb/organ seam), frame transforms, server-side
    movement integration, portal doors with cooldown and destroyed-to-hole transition,
    hullCompiler room-grid DSL with airtightness and connectivity checks, airAuthority
    portal-area mapping, fixed-step tickWorld, and StationHub / HesperiaV2 hull specs.
  - Server host scaffold: SimHost with 20Hz accumulator and 10/5/2Hz broadcast clocks,
    beacon registry with per-beacon caps and join cooldown, validatePipe
    (parse, version check, schema guard, rate limit), ticked snapshotter builders, and
    a thin intent router. Frozen renderers, HUD, air-sim core, tokens, and audio untouched.
- 3a0ac9b: M2 hull compiler depth: exact door gaps, window panes, sealed-hull checks, visual preview
  
  - Compiler cuts exact door gaps on both sides of every shared-edge portal (no
    hand-placed wall pairs); window portals compile to sealed `window` edges with
    glass panes that pass sight but block movement and airflow; new wall-contact,
    sealed-hull (no exterior holes or unsealed openings), and movement-reachability
    checks fail loudly on bad specs. `window` joins `PortalKind` with connecting
    and airflow semantics pinned down.
  - HesperiaV2 rebuilt on true shared-edge adjacency (corridor spine shares edges
    with all nine rooms); StationHub window is a real `window` portal. Both specs
    compile with zero errors and deterministically.
  - New `wallBlocksSight` / `wallBlocksMovement` wall semantics (matching the
    frozen LOS and collision conventions) for M3 world wiring.
  - Web preview at `?hull=station|hesperia` draws compiled rooms, gap-cut walls,
    panes, and portal markers on a standalone canvas (frozen passes untouched)
    with Playwright visual coverage and archived screenshots.
- 1790266: M3 world kernel depth: server-side collision, frame carry, LOS, playable slice
  
  - Movement is now authoritative: input accel integrates against compiled walls
    plus shut-portal colliders (closed doors block, open and destroyed-to-hole
    portals cross) via the shared wall-slide resolver with tunneling checks;
    pawns aboard moving vessels inherit frame velocity with zero drift; NaN and
    non-positive timesteps leave state untouched.
  - New LOS module: geometric segment sight over opaque walls and shut doors
    (window panes never block), one-hop room visibility through open and window
    portals, and per-pawn remembered fog stored on the world and advanced by the
    tick. New assembler builds namespaced multi-frame worlds plus pawn spawns.
  - Server intent router applies DOOR intents through the portal kernel
    (cooldown/clearance/not-found notices); clearance stays 0 until roles land.
  - Playable preview (`?hull=station|hesperia&play=1`) runs the same kernel tick
    in-browser: WASD walk, E door toggle with cooldown, live visibility and fog,
    with Playwright coverage for open/cooldown/cross, wall stops, and memory.
- c3aa514: M4 air authority cutover: one air-sim simulation per frame bound to the portal table
  
  - New world air authority owns an air-sim sim per frame: room volumes from hull
    specs at standard breathable air, portal areas synced from door/hole/open state
    every tick (windows and sealed doors pass nothing, destroyed doors vent),
    fixed 25ms substeps, and plain per-room readings (pressure, temp, O2, CO2,
    ECS repressurizing) attached to the world for snapshots.
  - Portal wind vectors from sim momentum, room wind averages, air density, hull
    punctures for damage-driven venting, vented-room mapping, and Newtonian drag
    forces complete the probe surface the HUD and boarding slices will consume.
  - Legacy `spatial/shipAtmosphere.ts` compartment model deprecated and frozen;
    deletion lands with `state.ts` in M5 once the server migrates hosts.
  - Playable preview gains the authority loop: pressure tinting, wind arrows, VENT
    badges, puncture key, and live per-room telemetry with Playwright coverage.
- c3151ea: M5 core loop: station to hire to watch to grade to redock on the world kernel
  
  - New hire loop (world/crew.ts): captains per vessel, talk for a two-job offer,
    hire aboard as one of the four unified roles, NPC fill-ins for unchosen jobs,
    and immediate departure. Watch rotation (world/watch.ts) advances role tasks
    while crew are aboard, grades S/A/B/C with credits, XP, and clearance.
    Vessel schedule (world/schedule.ts) cycles docked to departing to in_transit
    to inbound with gauntlet seal discipline and positional dock transfers.
  - tickWorld drives schedule and watches as small delegates; the harbor scenario
    stages station plus docked reference vessel with captain, transit, and dock
    link. SimHost owns air, sessions (beacon join, resume by userId, co-op on one
    beacon), and TALK/HIRE handling; snapshotter adds WATCH and HIRE_OFFER.
  - JOIN_BEACON gains an optional userId for resume. Legacy duties, roles,
    checklist, Dual/Collab, bots, intro, and the v1 action router are deprecated
    and frozen; deletion follows the server migration.
  - Playable preview runs the harbor journey in-browser (walk aboard, talk, hire,
    watch, grade, redock) with Playwright acceptance coverage.
- b22dce4: M6 survival and combat slice: vitals tick, suit discipline, server raycast fire
  
  - World vitals tick fed by authoritative atmos probes: pO2 hypoxia, vacuum and
    thermal drains with suit oxygen and battery gating, hunger/thirst/fatigue,
    bleedout with incapacitation and stabilized revive. Suit, consume, and sleep
    intents plus per-input facing and suit state complete the pawn contract.
  - Minimal FIRE: server-side raycast against walls, shut doors, and pawns.
    Doors lose integrity and become connecting holes; breached walls add hole
    portals the air authority reconciles into live airflow. Hit resolution fills
    hp only, leaving the limb/organ seam untouched for the elaborate model.
  - Legacy flat vitals tick deprecated and frozen. Preview gains suit and fire
    keys with live vitals stats and Playwright coverage for seal-matters and
    shoot-to-vent journeys.
- 99151e2: M7 bots, co-op hardening, and HUD data parity: the rework finale
  
  - Bots are schedule automatons: waypoint patrols on the portal graph with door
    discipline and arrival voice lines, ticked inside the world step; NPC crew and
    captains patrol from staging and hiring. Weapon heat with overheat refusal
    and cooldown completes the per-pawn combat state.
  - Channel builders move into sim-core beside the kernel they read, with vessel
    identity on manifests, derived subsystem gauges, voice lines on snapshots,
    heat on vitals, and a notice builder. HUD_PARITY_V2.md maps every visor
    element to its channel, composition, or explicit follow-up.
  - Host sessions enforce per-beacon caps with join cooldowns and slot release
    on leave; four-client co-op crews share one vessel with full manifests.
  - The playable preview renders a builder-only HUD readout (bots, voice, heat,
    gauges) with Playwright parity coverage on the harbor journey.
- 95d53da: Screenshot bugfix pass across LoS, impacts, bots, and docking:
  - LoS edge spikes: widen ray edge epsilon to 0.0003, sanitize fans (sub-pixel merge, near-eye collapse, wrap-duplicate drop), skip sub-0.5px fan triangles in the FOW builder, and close cone fans across the mouth chord.
  - Impacts: shrink decal craters to scuffs, batch decal layers per frame, stamp room pressure kPa on impacts, and scale spark throw by hole area times pressure differential.
  - Bots: route cross-room legs through portal-graph door midpoints and skip waypoints with no progress after 60 ticks; posted crew never drifts through dock volumes and the station crowd patrols off the gauntlet tube.
  - Docking: stern boarding ramp on the corridor west wall mates with the gauntlet at the docked origin, vessels fly phase-driven approach/departure/transit legs, the debug overview pins on the harbor with an in-transit bearing, and all ship-layer render offsets go full 2D.
- 95d53da: Screenshot-driven polish pass on LoS, decals, and docked rendering:
  - LoS: widen grazing-ray epsilon, sanitize visibility fans, skip sub-pixel fan triangles, and close cone fans across the mouth chord.
  - Decals: replace ring/cross impact graphics with small chipped pits (halo, lit edge, dark pit, hot pixel, frost tick) shared by punctures and persistent scorch; stamp room pressure on impacts and scale spark throw by hole area and pressure.
  - Docked rendering: reposition the orphan station hull plate onto the live hub footprint, move thruster bells and exhaust to the stern, thread full 2D ship offsets through all render passes, pin posted crew off dock volumes, and stabilize the debug overview while the vessel is off-station.
  - Removed void-zone static station NPCs now covered by the sim crowd.
- 5e20e82: Seamless station-to-ship walk, no teleport volumes:
  - protocol: DOCK_STATUS carries tubeGate, tubeRoom, and world-space mouthWorld for the tube draw.
  - sim-core: new station.andock_tube room bridging Andockschleuse A to the mated ship mouth at world x=1210; DockLink drops radius/egress volumes for tubePortal/tubeRoom/mouthWorld; new dockCrossing.ts preserves world position across the mouth line; tickWorld steps movement then cross-frame; LOS reveals tube <-> corridor while walkable; transferThroughDock and transferCooldownUntilTick deleted.
  - web/server: three-leaf dock gates, solid tube link in debug view, world-continuous prediction/camera with no snap.
- 477dd3f: Snapshot delta channels: full SNAPSHOT 1Hz plus deltas, event-driven manifest and watch
  
  - Protocol adds `SNAPSHOT_DELTA` (complete quantized pawns/shots/impacts plus
    changed portals/frames and removals), `full` flags on snapshot/telemetry,
    content `rev` digests on manifest/watch, and pure wire quantization helpers
    (`q2`/`q1`/`q0`, FNV-1a digests). All additive and JSON-safe.
  - Sim-core quantizes every channel builder so idle snapshots are byte-stable,
    diffs portals/frames/atmos against the last send, caps wall-breach portals
    at 24 (sustained fire used to bloat the portal and air tables forever),
    and builds projectile colliders once per frame per tick instead of once per
    projectile per substep.
  - Server sends full snapshots 1Hz with 10Hz deltas, full telemetry every 5th
    with changed rooms otherwise, manifest on crew-rev change plus 5s heartbeat
    (unicast on join), watch on content-rev change plus 1s heartbeat, and
    suppresses unchanged vitals with a 1s heartbeat. `getStats` exposes
    per-channel message and byte counters for tuning.
  - Web merges deltas onto cached full tables (downstream renders unchanged),
    ignores stale ticks and same-rev manifests, suppresses identical movement
    intents with a 500ms heartbeat, and rebuilds atmos/telemetry mappings only
    when a channel tick moves.
  - Measured on the harbor world: snapshot 1201B -> 509B idle delta, empty
    telemetry delta 139B vs 1538B full, manifest 10Hz -> event-driven;
    estimated downlink ~13.3KB/s to ~5.8KB/s per client (-56%).
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
- b92f4a3: Screenshot-faithful harbor remake: station plus docked vertical vessel.
  - Station: north band (Habitat 1-4 / Medizin / Sicherheit-Nord), central
    corridor with west Kommando stub and east N-S dock spine, south band
    (Hydroponik / Frachthalle / Reaktorraum / Sicherheit-Sued), and east
    Andockschleuse A airlock tube. Retires lobby/bay/gauntlet/concourse /
    overlook/lounge ids; spawns, crowd waypoints, fixtures, lights, and
    ambients remapped onto the new rooms.
  - Vessel: vertical Hesperia spine (Bruecke / Kajute-Nord / Kajute-Sued /
    Schiffskorridor / Reaktor-Antrieb) with a west corridor mouth mating the
    airlock. Dock link, SHIP_ORIGIN (1210,-80), and far hold move east;
    transfer volumes and stride-scale egresses re-pinned to the new leaves.
  - Renderer: dock tube, station block plate, vertical armor outline, south
    drive bells with +Y exhaust, corridor light lookup, and rewritten ship
    deck furniture bounded inside the new rooms.
  - Tests and e2e journeys follow the new room graph; no wire changes
    (existing fixture stationTypes cover the new rooms).
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

- e33f4ed: Drive pull and drag from air-sim portal flow and show the station atmos overlay
  
  Pull strength was a flat constant per vented room, so punctures yanked as hard as
  full breaches, and the atmos overlay only rendered ship-side rooms:
  
  - sim-core now derives wind from the air-sim solver itself: per-portal volumetric
    flow (tracked throat velocity x effective area) through a hemispherical sink
    superposition, mirroring the solver's own drag model, converted to px/s.
  - Boarding suction strength scales with solver wind at the room center, so small
    punctures tug weakly and large breaches yank; suction dies out as rooms empty.
  - RoomAtmosphereSummary gains optional windX / windY (room-center solver wind);
    client movement prediction and decompression particles read the authoritative
    broadcast values instead of a local pressure heuristic.
  - Station lobby, bay, and gauntlet now render in the atmos overlay pass.
- e5a5944: Improve bot crewmate lifelikeness and door discipline. Bots now wait at closed hatches (open radius 56px) instead of triggering doors across the room, hold position for the door cycle, track hatches they opened, and close them once clear (85px). Server skips closes while a player or bot is still in the hatch. Bots also publish velocity (walk sway + thruster FX), walk at per-role speeds with jitter, pause and glance around while travelling, shuffle and face their station while working, and scan while resting.
- e5a5944: Fix bots walking out of the ship through the mess hall ceiling. Rest targets were hardcoded at y=160, above the top hull line (y=228) in vacuum. Rest spots are now derived from room interiors, and all bot movement (stepwise, arrival teleport, work shuffle) is clamped to the hull interior as a guardrail.
- 27c46b0: Vent widened breaches at their live size and prove the wall breach end to end
  
  Combat widens a live breach in place, but the air authority froze each linked throat at its birth size, so every widened hole kept venting like a fresh puncture. Air-sim `Portal` gains a height-preserving `resizeThroat`, and the per-tick area sync follows hole `areaM2` growth, so sustained fire actually tears walls open faster. Covered by a widen-sync unit test. The harbor wall-breach journey fires a sealed-suited close-range burst (muzzles past the collider never touch it; lone punctures cannot vent the bay+lobby complex on a sane timeout) and asserts vent, spend, and reload.
- 8dd1b3f: Realistic pressure-coupled decompression vapor, cascading airflow venting, and organic frozen visor snowflake shader:
  - Fixed cascading decompression bug: decompression airflow now tracks interconnected rooms through open bulkheads, so when an evacuated room's doors open to adjacent pressurized compartments, fine mist jets across the doorway and continues venting out exterior breaches/hatches.
  - Tuned airflow particles into a silky fine aerosol mist (radius 1.0–2.4px, smooth sine fade, shimmering micro-glints) replacing chunky polygonal discs.
  - Coupled decompression airflow emission directly to real-time room pressure (P / 101.3 kPa), tapering to complete termination when the compartment evacuates to vacuum (<= 0.5 kPa).
  - Replaced the artificial rigid asterisk grid in `FROST_EDGE_FS` with an organic perimeter frost shader featuring 6-fold dendritic stellar snowflakes, crystalline fern tendrils, and a clear central line-of-sight.
  - Integrated smooth dynamic frost accumulation and thawing driven by player-centric ambient cold, decompression exposure, and suit core body temperature.
- 28f7ba8: Fix helmet UI button hit-testing, early audio unlock, FoW occlusion, and bot pathfinding:
  - sim-core: Implement findNavigationPath with collision-free portal waypoints, sequential bot progression, and isImpactVisible helper.
  - server: Wire door toggling for bot pathfinding transit.
  - web: Correct visor barrel distortion inverse mapping and DPR scaling for helmet UI buttons, initialize audio gesture unlock early, and accurately occlude FoW combat impacts and lights.
- 6bff245: Remove hazard floor shader and fix hallway door interactions and airflow:
  - Completely removed hazard floor stripes and vacuum floor shader from `DECK_FLOOR_FS` and `DeckPass`, replacing airlock vestibule floors with clean brushed gunmetal chamber plating.
  - Fixed bot navigation across hallway doors in `findNavigationPath`: automatically insert `door_spine_fwd` ($x = 440$) and `door_spine_aft` ($x = 760$) waypoints during corridor transits.
  - Enhanced bot door detection in `botManager`: bots recognize and request toggling for any closed door within 42px along their path, allowing bots to open hallway spine doors cleanly and proceed.
  - Fixed hallway door airflow drag routing in `atmosGrid`: sub-partitioned the catwalk corridor into zones (`corridor_fwd`, `corridor_mid`, `corridor_aft`) that connect only through open spine doors, guiding drag vectors through door openings and preventing closed hallway doors from leaking suction.
  - Aligned cellular decompression wave vectors with neighbor flow paths in `propagateDecompressionWave` instead of pulling diagonally through solid bulkheads.
  - Added server-side wall and closed door collision resolution in `server.ts` during wind push.
- 18c68ce: Fix Fog of War auto-reveal and persist explored memory per player:
  - sim-core: Add origin-aware FOW stamp matrix plus pure exploration-grid serialization (visible demotes to explored, corrupt payloads reject).
  - web: Gate omni room/dynamic/reactor light fans per-fragment against the exploration mask in-shader (static lamps keep their full wall-clipped fans so spill around corners stays visible), so lit but unexplored rooms stay void and explored rooms rest as gray tactical memory.
  - web: Fix the FOW stamper origin offset and persist the CPU exploration grid to localStorage per beacon/user, rehydrating the GPU mask on load.
- 0ba32f0: Frame-aware breach carving: ship breaches no longer punch holes in station walls.
  - `carveWallsByFrame` partitions the mixed wall soup (station world coords vs
    ship frame-local) and cuts each frame's gaps only into its own walls, fixing
    phantom station holes in bulkhead rendering plus poisoned LoS/fog blockers
    after firing on ship walls. Untagged segments keep legacy broadcast behavior.
  - `getOpaqueWallSegments`, `getWorldOpaqueWalls`, and the DeckPass bulkhead
    pass consume the framed carve; breach models already carry frameId.
- bd915dc: Game shell foundation: server-declared death, full-run restart, appearance identity:
  - protocol: Add PawnTrim/ThrusterTint appearance wire (appearance.ts), optional trim/thruster on HELLO, RESTART intent with validator and rate limit, DeathCause plus DEATH broadcast, dead flags on SnapshotPawn and VITALS.
  - sim-core: Add authoritative death module (isDead, deathCauseFor with bleedout/hypoxia/vacuum/thermal/starvation/dehydration/combat priority, restartRun fresh-run respawn preserving identity), store trim/thruster on pawns, expose dead/appearance in snapshots and vitals, add buildDeath.
  - server: Carry appearance from HELLO through beacon join onto pawns, handle RESTART with station-spawn respawn and latch cleanup, track and broadcast DEATH events once per pawn via drainDeaths in the vitals clock.
  - web: Persist callsign/color/trim/thruster identity to localStorage, send appearance in HELLO, handle DEATH channel into state plus critical notice, add pure death-screen copy helpers for the upcoming diegetic terminal.
- 5ec15a8: Fix projectile and welder AOE collisions across moving ship frames:
  - Unify projectile wall and door collision checks in world space by translating ship geometry via `applyShipOffsetToWalls` and `getWorldDoors`.
  - Project kinetic outer-hull hits to ship-local space (`worldHit - offset`) solely for `findRoomAtHullImpact` breach room mapping.
  - Update `tickProjectiles` outer boundary check to allow projectiles within both ship and station bounds.
  - Remove ship room bounding-box restriction from `applyWelderAoeDamage`, evaluating welder raycasts against world-space walls and doors.
  - Propagate docking offset to `tickVesselState`, `tickBoardingCombat`, `tickProjectiles`, `applyWelderAoeDamage`, and client predictive weapons/projectiles hooks (`usePredictiveProjectiles`, `useCanvasWeapons`, `VesselCanvas`).
  - Carry aboard active projectiles when ship translates during docking phases.
- ad98f85: Sync wall shooting so bullet punctures no longer open sight lines early:
  - sim-core: Framed breach segments carry optional areaM2 and carveWallsByFrame skips punctures below PUNCTURE_MAX_M2, keeping LOS blockers intact until a hole grows into a full breach.
  - web: Lightmap pass carves only sizeClass breach models like DeckPass, so vision and bulkhead rendering open together after sustained fire instead of desyncing on the first shot.
- e33f4ed: Rooms-only atmos overlay with drag arrows, dead cell wire cleanup, hull isolation proof
  
  - AtmosOverlayPass renders room rects only: all cell naming, cell buffers, and
    the ATMOS_CELL shaders are gone (renamed ATMOS_ROOM), with no behavior loss.
  - Overlay now draws per-room drag arrows from broadcast windX/windY in every
    atmos mode, so vent pull is visible in-game without opening a report.
  - Removed the dead atmosDirtyCells cell-grid field from TelemetryDeltaBroadcast.
  - Verified ship/station isolation: hull sims share no Room or Portal objects,
    every portal endpoint resolves inside its own hull, stepping a venting ship
    leaves station pressures bit-identical, and vent lists never cross hulls.
- 66f340f: Fix ship walls vanishing after breach carves
  
  `isShipSideWall` matched only pristine hull ids, so breach-carved ship pieces (`ship.*_br_*`) failed the ship-side check and `applyShipOffsetToWalls` left them at frame-local coords. Carved bulkheads rendered ~1210px off-ship while collision still blocked, reading as a completely missing wall. The check now strips `_br_` suffixes and falls back to the `ship.` prefix, keeping carved pieces in the ship viewport for both `DeckPass` and `getWorldOpaqueWalls`. `emitWallPieces` also anchors each leading piece at the running cursor so multi-breach walls no longer overlap. Covered by carved-offset and multi-cut unit tests.
- bfee10d: Unify room lookup: `schedule.roomAt` is now the exported canonical frame-local point query and `crew.roomContainingPoint` delegates to it, removing a 17-line duplication (no behavior change; server and combat call sites untouched). Covered by a new `roomAt.test.ts` proving frame scoping, edge-inclusive bounds, and alias parity.
- 8422f6b: Snappier walking and client-predicted bullets with fire shake
  
  - Movement tune (shared server/prediction model): base accel 900 -> 1300
    and damping 6 -> 7, so cruise rises ~150 -> ~186 px/s with a quicker ramp
    and shorter coast. Fixes the heavy/rampy feel and most of the perceived
    press delay (own motion is predicted locally; the ramp was the lag).
  - Key presses now send their INPUT on the same frame instead of waiting for
    the 50ms pump, trimming the remaining server-apply latency.
  - Fired rounds are predicted locally from the same muzzle/speed/life
    constants as the server and render immediately; predictions the server
    takes over are dropped in its favour, refused shots clear on the FIRE_*
    notice, and anything unconfirmed expires past projectile life. Bullets no
    longer wait a snapshot round-trip.
  - Slight camera shake (3px, 120ms decay) on local fire for gun feel.
- f5972db: Viewport fixes: true coordinates, aim, gunfire feedback, and test isolation
  
  - Fixed a coordinate regression that double-offset ship bulkheads and doors:
    walls and door segments are frame-local again, fixtures render aboard and
    in the lobby, and breach lookups accept namespaced ids.
  - The canvas is the only element and fills the screen; the debug panel hides
    behind `?debug=1`. Camera zoom with mouse lookahead, adaptive settle, and
    close-snap reconcile remove the stop-trail.
  - Mouse aims after the first move, clicks fire through the HUD hit-tester,
    shots draw muzzle flashes plus tracer beams, and notices surface on the
    visor. Prediction runs the server accel/damping model.
  - Each e2e file owns a private daemon (no cross-file world leakage), the
    journey tolerates ambient door state, and scene captures record the lobby,
    doorway, and ship corridor.
- 6585fd2: Unfreeze renderer rework: live exhaust plumes and seated furniture
  
  - Lifts the WebGL rework freeze: renderer, passes, and models under
    `apps/web/src/webgl/` are editable again (AGENTS.md Step 4 updated,
    frozen annotations removed from harbor adapters and sim-core render data).
    v1-protocol deletion freezes are untouched.
  - Thruster plumes are real particles now: `ParticleSystem.emitExhaust`
    streams white-hot/cyan exhaust from the three aft bells through the
    existing additive pool (capped), replacing the static quads that burned
    at full scale even while docked. Emission is motion-gated by a new
    `shipUnderway` render flag (wired from the watch phase: full burn in
    transit, idle trickle docked).
  - Seats every ship furniture group inside its room rect (crates, reactor
    shielding, avionics racks, life-support vats, mess dining, armory racks
    all bled through bulkheads) and pins placement with
    `SHIP_FURNITURE_BOUNDS` containment tests plus thruster-bell mounting
    tests against the hull spec.
- d091bd7: Viewport correctness: true coordinates, mouse aim, and fire feedback
  
  - Fixed a C3 coordinate regression: ship walls and door segments are
    frame-local again (frozen consumers offset them), ending double-offset
    bulkheads and doors. Harbor fixtures (helm, lockers, winch, galley,
    consoles, job board) render aboard and in the lobby with frame-aware
    offsets, and breach lookups accept namespaced ids.
  - Client prediction runs the server accel/damping model with per-snapshot
    velocity seeding, and the mouse owns aim (with lookahead camera) after
    the first move. Click fires through the HUD hit-tester; muzzle flashes
    follow server-confirmed heat and notices surface on the visor.
- ea41229: Screenshot diff testing moves to vitest/browser canvas shots:
  - Removed the interim SVG string snapshots, SVG renderer, and Playwright SVG spec; shared scenario geometry now lives in pure `spatial/visibilityScenarios` with canvas rendering and sight-invariant assertions in `spatial/visibilityShots.browser.test.ts`.
  - Added complex S7 three-room door chain and S8 aligned/staggered twin-breach scenarios proving sight passes open doorways and paired gaps but stops at shut walls and offset cuts.
  - New `test:browser` script (plus root `test:visibility` shortcut) diffs 12 canvas shots against `__screenshots__` goldens via `toMatchScreenshot`; the node unit gate stays browser-free.
- ad98f85: Add unit-screenshot tests for visibility and line-of-sight:
  - New pure `renderVisibilitySvg` snapshot renderer (`spatial/visibilitySvg`) shared by tests and debug views so screenshots and assertions cannot drift apart.
  - New `spatial/visibilitySnapshots` Vitest covers empty rooms, wall blocking, doorway open/shut, bullet punctures holding sight, grown breaches opening sight, and a live ship-wall shooting sequence, writing deterministic SVGs to `test-results/visibility/` plus `toMatchSnapshot` regression coverage.
  - Run with `yarn --cwd packages/sim-core test visibilitySnapshots`, then open the SVGs in a browser to eyeball walls, hidden areas, and LoS polygons against expectation.
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
- Updated dependencies [01e5e60]
- Updated dependencies [03c84e8]
- Updated dependencies [222ec04]
- Updated dependencies [e33f4ed]
- Updated dependencies [90448c2]
- Updated dependencies [27c46b0]
- Updated dependencies [6585fd2]
- Updated dependencies [95d53da]
- Updated dependencies [854dfed]
- Updated dependencies [8422f6b]
- Updated dependencies [5af7ce8]
- Updated dependencies [61855fa]
- Updated dependencies [bd915dc]
- Updated dependencies [bd915dc]
- Updated dependencies [e33f4ed]
- Updated dependencies [5ec15a8]
- Updated dependencies [1a5a658]
- Updated dependencies [de03fdf]
- Updated dependencies [13a6e13]
- Updated dependencies [95d53da]
- Updated dependencies [e33f4ed]
- Updated dependencies [95d53da]
- Updated dependencies [95d53da]
- Updated dependencies [414d5a5]
- Updated dependencies [d6eff22]
- Updated dependencies [95d53da]
- Updated dependencies [5ec15a8]
- Updated dependencies [3157970]
- Updated dependencies [82bb70b]
- Updated dependencies [c3151ea]
- Updated dependencies [99151e2]
- Updated dependencies [e33f4ed]
- Updated dependencies [95d53da]
- Updated dependencies [95d53da]
- Updated dependencies [5e20e82]
- Updated dependencies [a14cbfb]
- Updated dependencies [477dd3f]
- Updated dependencies [5ec15a8]
- Updated dependencies [c3725db]
- Updated dependencies [5ec15a8]
- Updated dependencies [5ec15a8]
- Updated dependencies [f7b8890]
- Updated dependencies [1f78aa0]
- Updated dependencies [d2bb947]
- Updated dependencies [5ec15a8]
  - @kybernetes/air-sim@0.3.1
  - @kybernetes/protocol@0.4.0

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
