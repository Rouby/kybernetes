# @kybernetes/server

## 0.3.0

### Minor Changes

- b5bbb59: Cutover C1: live v2 harbor daemon replaces the v1 vessel server
  
  - New HarborDaemon serves one harbor world over WebSocket on protocol v2:
    input-only intents through the validate pipe (version, schema, rate limit,
    seq dedupe) with drop counters, and ticked SNAPSHOT/TELEMETRY/VITALS plus
    WATCH/MANIFEST/HIRE_OFFER broadcasts with per-client sessions, beacon caps,
    resume by userId, and clean stop with socket termination.
  - Deleted the v1 vessel server, action/intro routers, delta broadcaster, and
    session types. Browser end-to-end stays red until the web client migrates.
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
- 1a5a658: Make stations and ships lived-in: dense hub plus wired workhorse ship.
  - protocol: New v2 `living` slice (`living.ts`): 15 fixture kinds, CLAIM/VEND/COOK/HARVEST/RECYCLE/REPAIR intents with validators and rate limits, optional fixture tables on SNAPSHOT/SNAPSHOT_DELTA, living room resources on TELEMETRY, meal buff on VITALS. Fully additive and round-trip tested.
  - sim-core: New deterministic `world/living` kernel (fixture integrity/claims, power/heat loads, water grey-clean loop, hydro growth, 8s cook cycle, freezer stock, breaker trips) ticked in `tickWorld`; shots pass through fixtures (destruction/damage is deferred to a dedicated feature run); tiered meals (`hot_meal` +35 with mess buff) in survival; harbor scenario stages 19 hub/ship fixtures plus a 4-bot living crew (barkeep, trader, ship cook, hauling deckhand).
  - server: Intent router handles all six living verbs plus INTERACT (aid cabinet, sink, mess table) with frame-aware reach checks; `SimHost` forwards every living verb to the kernel (exhaustive switch, so future intents fail compile instead of dropping silently); covered by host integration tests including a walk-to-interact run; untrusted input never becomes state.
  - web: New `LivingFixtures` WebGL pass (state-driven bar, vendor, market, lockers, stove, freezer, hydro, recycler, breaker, aid, bunks with claim colors), context [E] action with HUD prompt through one facing-gated doors-plus-fixtures contest (37-degree cone, near-field override) so prompt and action always agree (now with mouse-cursor pull, tighter reaches, and wall/shut-door occlusion; glass never blocks), living power/water feeding reactor/water gauges, retired cabin-bunk decor in repurposed rooms, and a living-status HUD strip above the vitals panel (ship power, max heat, clean water, meals ready, hydro growth, mess-buff countdown, breaker/heat/water alerts) fed by aggregated TELEMETRY living rooms. All fixtures rearranged against walls with walkways clear (galley counters north/east, bunks head-to-south-wall, bar north stretch, lockers west stack, breaker on the corridor wall); new dim background `Clutter` pass (wall pipes, vents, posters, corner crates, never in walkways, never interactive, drawn behind everything). Fixture and living tables are retained across SNAPSHOT_DELTA/TELEMETRY deltas so furniture no longer flickers and [E] scans a stable list.
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
- d2bb947: Implement systemic Watch Rotation core gameloop and crew progression:
  - Two-Phase Watch Rotation: Structured alternation between Active Watch duties and Off-Duty Liberty.
  - Bunk Sleep Handover: Bunk resting (`berth_pod_alpha` / `berth_pod_beta`) clears fatigue and triggers shift evaluation, clearance XP, and watch rollover.
  - Purely Systemic Decay: Reactor thermal drift, scrubber wear, and dynamic subsystem replenishment tied to duty execution.
  - Staggered Watch Sections: Watch Section Alpha and Bravo rotation tracking with compact HUD badge indicators.
  - Department Clearance & Salary Promotions: Escalating clearance levels, credit salary multipliers, and rank badges.
  - Shift debrief modal with clearance promotion banner and next-watch commencement.

### Patch Changes

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
- e5a5944: Improve bot crewmate lifelikeness and door discipline. Bots now wait at closed hatches (open radius 56px) instead of triggering doors across the room, hold position for the door cycle, track hatches they opened, and close them once clear (85px). Server skips closes while a player or bot is still in the hatch. Bots also publish velocity (walk sway + thruster FX), walk at per-role speeds with jitter, pause and glance around while travelling, shuffle and face their station while working, and scan while resting.
- 6585fd2: Visualize punctures, breaches, and air loss from live sim state instead of room-top anchor guesses. Snapshot portals now carry breach geometry (area, birth tick, frame-local segment, room) so deltas fire when holes widen; sim-core gains a pure breachView module (render models, flow-axis math, exact segment carving shared by the renderer and LOS); the viewport renders area-scaled molten rims that cool into frost over 10 s, black vacuum insets, puncture decals, directional breach plumes with throat collars, wind-driven dust drift, throat arrows and vent shimmer on the atmos overlay, plus live per-room breach counts and wind vectors.
- 95d53da: Screenshot-driven docking and overlay correctness pass:
  - Continuous boarding: tight gate-leaf transfer volumes with stride-scale landings replace the 100px teleport yank; dock gates read walkable for movement and sight while the cycle holds them (air graph keeps sealed-safe states, so nothing vents); dock leaves refuse manual toggles and bot discipline while the cycle owns them.
  - Camera: frame-origin velocity feedforward keeps embarked views panning with docking burns instead of juddering behind snapshot deltas.
  - Overlays: atmos quads derive ship/station side from room frames (new hub rooms no longer ride the vessel offset); fog-of-war volume covers the harbor plus docked vessel with an explicit world origin on both CPU grid and GPU passes.
  - Breach cuts widen progressively with area so merges grow instead of popping; impact pressure rides the wire for scaled throws.
  - Removed void-zone static station NPCs and repositioned the orphan station hull plate onto the live hub footprint; thruster bells and exhaust moved to the stern.
- 854dfed: Cutover C2: v2 web client alongside at ?harbor=1 with migrated e2e
  
  - Protocol gains the JOINED handshake identifying the joining pawn.
    The daemon answers admissions with it.
  - New harbor client: v2 socket hook (channels, auto-seq intents, reconnect
    with resume by stored userId), predicted movement with authoritative
    reconcile, static compiled geometry with live snapshot dynamics, and HUD
    readouts for status, vitals, watch, manifest, offers, and notices.
  - Server door toggles now enforce a reach check against the authoritative
    pawn position; fresh spawns prefer the designated fresh_spawn point.
  - E2E suite swaps to the harbor client (smoke plus acceptance journey);
    legacy v1 specs are deleted and files run serially against the shared
    single-vessel daemon. The default route still serves the old client.
- bd915dc: Death proof over real sockets plus deterministic door e2e:
  - server: HarborDaemon integration test kills a pawn through the real combat path over two live sockets and asserts the authoritative DEATH broadcast, dead VITALS, and a RESTART back to alive VITALS.
  - web: Debug HUD exposes the shared viewport target (target:door/target:fixture), and the corridor-door journey waits for that target and presses before keyup, fixing the position-guess race against coasting (3/3 clean repeats).
- 8422f6b: Add a synced world-plus-air debug view on a separate client URL with live portal wind on the wire:
  - protocol: New optional `AirFlow` table on `TELEMETRY` (q1 portal throat velocity, signed on the roomA-to-roomB axis); absent on pre-flow senders so old clients keep working.
  - sim-core: New `readAirFlows` authority reader plus `quantizeAirFlow` / `significantFlows` helpers; `buildTelemetry` carries the still-air-filtered wind table while staying byte-stable idle.
  - server: Harbor daemon ships the live wind table on every TELEMETRY (full and delta) and on join baselines.
  - web: New `?debug-world=1` (alias `?view=debug`) top-down 2D debug canvas reusing the connected player socket session: rooms colored by pressure/o2/temp overlay, portals by state, cyan wind arrows, pawns with own-player ring, impacts, and a tick/air status panel. Camera follows the owned pawn (F toggles overview, O cycles overlay); `?debug=1` text HUD still composes on top.
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
- 61855fa: Free the trigger: remove weapon overheating, cost sustained fire with bloom and shake
  
  - sim-core: delete the heat record, `tickHeat`, and the `overheated` fire block. Each shot now adds `SPREAD_PER_SHOT` (0.03 rad) of aim bloom up to `SPREAD_MAX` (0.2 rad), applied to the round's direction with deterministic tick-parity alternation so bursts stay centered while groups widen; bloom bleeds off at `SPREAD_DECAY_PER_S` when not firing. Magazines are the only thing that stop the gun.
  - protocol/server: drop `heat` from `VITALS` and the `FIRE_overheated` notice; the fire gate is down/reloading/empty only.
  - web: the fire mirror no longer reads heat, the debug vitals line and heat-driven muzzle logic are gone, and camera shake accumulates trauma per shot (decaying over time) on top of a stronger base kick (5px over 170ms, up to ~12px at full trauma).
- bd915dc: Game shell foundation: server-declared death, full-run restart, appearance identity:
  - protocol: Add PawnTrim/ThrusterTint appearance wire (appearance.ts), optional trim/thruster on HELLO, RESTART intent with validator and rate limit, DeathCause plus DEATH broadcast, dead flags on SnapshotPawn and VITALS.
  - sim-core: Add authoritative death module (isDead, deathCauseFor with bleedout/hypoxia/vacuum/thermal/starvation/dehydration/combat priority, restartRun fresh-run respawn preserving identity), store trim/thruster on pawns, expose dead/appearance in snapshots and vitals, add buildDeath.
  - server: Carry appearance from HELLO through beacon join onto pawns, handle RESTART with station-spawn respawn and latch cleanup, track and broadcast DEATH events once per pawn via drainDeaths in the vitals clock.
  - web: Persist callsign/color/trim/thruster identity to localStorage, send appearance in HELLO, handle DEATH channel into state plus critical notice, add pure death-screen copy helpers for the upcoming diegetic terminal.
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
- 88c8847: Latch movement inputs per pawn so held keys survive send gaps
  
  - `SimHost` keeps the last `INPUT` per pawn for `INPUT_LATCH_MS` (1000ms,
    slice clock) and feeds held plus queued inputs into every fixed step.
    A zero `moveVec` releases immediately; stale holds expire and coast out
    through damping; leaving clears the latch.
  - Fixes sluggish walking regressed by client idle suppression: the host used
    to drain its one-shot input queue every tick, so a held key applied for a
    single step and then damped to a stop until the next 500ms heartbeat.
    The heartbeat interval is now contract-tested to stay below the latch.
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
- 5ec15a8: Fix projectile and welder AOE collisions across moving ship frames:
  - Unify projectile wall and door collision checks in world space by translating ship geometry via `applyShipOffsetToWalls` and `getWorldDoors`.
  - Project kinetic outer-hull hits to ship-local space (`worldHit - offset`) solely for `findRoomAtHullImpact` breach room mapping.
  - Update `tickProjectiles` outer boundary check to allow projectiles within both ship and station bounds.
  - Remove ship room bounding-box restriction from `applyWelderAoeDamage`, evaluating welder raycasts against world-space walls and doors.
  - Propagate docking offset to `tickVesselState`, `tickBoardingCombat`, `tickProjectiles`, `applyWelderAoeDamage`, and client predictive weapons/projectiles hooks (`usePredictiveProjectiles`, `useCanvasWeapons`, `VesselCanvas`).
  - Carry aboard active projectiles when ship translates during docking phases.
- 82bb70b: M1 protocol v2 hardening: seq dedupe, tick ordering, version rejects, role unification
  
  - New pure `seq` module: `isFreshSeq` / `advanceSeq` per-sender cursors plus
    `isNewerTick` snapshot ordering, all covered by the new `wireV2` suite (version
    reject, seq dedupe/reorder, rate-limit budgets, role-enum unification, tick
    monotonicity, client-position stripping).
  - Server validate pipe enforces seq dedupe ahead of the rate limiter with a new
    `duplicate` outcome; v1 version mismatches, INPUT floods (20Hz budget, window
    rollover), and retried/reordered intents are covered by pipe vectors.
  - `MIGRATION_V2.md` documents the full v1-to-v2 table (intents, snapshots, roles,
    supporting types, M5 deletion checklist); the seven v1 wire modules are marked
    `@deprecated` and frozen. No deletions yet — server and web still import v1.
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
- 5e20e82: Seamless station-to-ship walk, no teleport volumes:
  - protocol: DOCK_STATUS carries tubeGate, tubeRoom, and world-space mouthWorld for the tube draw.
  - sim-core: new station.andock_tube room bridging Andockschleuse A to the mated ship mouth at world x=1210; DockLink drops radius/egress volumes for tubePortal/tubeRoom/mouthWorld; new dockCrossing.ts preserves world position across the mouth line; tickWorld steps movement then cross-frame; LOS reveals tube <-> corridor while walkable; transferThroughDock and transferCooldownUntilTick deleted.
  - web/server: three-leaf dock gates, solid tube link in debug view, world-continuous prediction/camera with no snap.
- 88c8847: Fix daemon hangs and orphaned ports: `start()` now rejects with `EADDRINUSE` instead of hanging forever when the port is held, `stop()` is idempotent, terminates every socket (including half-open handshakes), and always settles via a bounded close so Ctrl-C and test teardown can never wedge. Boot prints a busy-port hint and shutdown forces exit after a timeout.
- a14cbfb: Give each pawn a single driver: evict the previous holder on same-userId resume
  
  Two sessions under one userId (two tabs sharing a profile) bound the same pawn and both drove it, so facing and suit state flopped between their inputs every tick. `SimHost.joinBeacon` now evicts the previous holder and queues it for termination, and an evicted socket closing can no longer release the beacon seat or the input latch. The daemon closes evicted sockets with a dedicated application code, and the client answers it with a take-over notice instead of auto-reconnecting, which would otherwise steal the pawn straight back every 2 seconds.
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
- Updated dependencies [03c84e8]
- Updated dependencies [e33f4ed]
- Updated dependencies [e33f4ed]
- Updated dependencies [e5a5944]
- Updated dependencies [e5a5944]
- Updated dependencies [27c46b0]
- Updated dependencies [6585fd2]
- Updated dependencies [477dd3f]
- Updated dependencies [95d53da]
- Updated dependencies [854dfed]
- Updated dependencies [b3bd93d]
- Updated dependencies [27ae342]
- Updated dependencies [8422f6b]
- Updated dependencies [8dd1b3f]
- Updated dependencies [5af7ce8]
- Updated dependencies [28f7ba8]
- Updated dependencies [6bff245]
- Updated dependencies [18c68ce]
- Updated dependencies [0ba32f0]
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
- Updated dependencies [5ec15a8]
- Updated dependencies [414d5a5]
- Updated dependencies [ad98f85]
- Updated dependencies [d6eff22]
- Updated dependencies [95d53da]
- Updated dependencies [5ec15a8]
- Updated dependencies [3157970]
- Updated dependencies [82bb70b]
- Updated dependencies [3a0ac9b]
- Updated dependencies [1790266]
- Updated dependencies [c3aa514]
- Updated dependencies [c3151ea]
- Updated dependencies [b22dce4]
- Updated dependencies [99151e2]
- Updated dependencies [e33f4ed]
- Updated dependencies [95d53da]
- Updated dependencies [95d53da]
- Updated dependencies [5e20e82]
- Updated dependencies [66f340f]
- Updated dependencies [bfee10d]
- Updated dependencies [a14cbfb]
- Updated dependencies [8422f6b]
- Updated dependencies [477dd3f]
- Updated dependencies [5ec15a8]
- Updated dependencies [5ec15a8]
- Updated dependencies [5ec15a8]
- Updated dependencies [b92f4a3]
- Updated dependencies [f7b8890]
- Updated dependencies [f5972db]
- Updated dependencies [6585fd2]
- Updated dependencies [d091bd7]
- Updated dependencies [ea41229]
- Updated dependencies [ad98f85]
- Updated dependencies [1f78aa0]
- Updated dependencies [d2bb947]
- Updated dependencies [5ec15a8]
  - @kybernetes/protocol@0.4.0
  - @kybernetes/sim-core@0.4.0

## 0.2.0

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
- d047572: ### Authoritative Server Loop, Subsystem Ticking & Naval Threat Ingestion
  
  - **10Hz Authoritative Tick Loop (`server.ts`)**:
    - Deterministically ticks vessel state (`reactor`, `lifeSupport`, `hull`, `shields`, `defense`, `activeFires`, and `activeEvents`).
    - Broadcasts delta telemetry frames (`TELEMETRY_DELTA`) at 10Hz to all connected client sockets.
  - **Damage Control Client Action Handlers**:
    - Handles `TOGGLE_BATTLE_STATIONS`, `TRIGGER_PDT_INTERCEPT`, `DEPLOY_FIRE_SUPPRESSION`, `EMERGENCY_HULL_REPAIR`, `VENT_REACTOR_COOLANT`, and `TRIGGER_NAVAL_EVENT`.
    - Dispatches immediate state delta broadcasts upon client triage actions.
    - Broadcasts `DAMAGE_TRIAGE_RESULT` and `SHIP_ALERT` packets across the active crew.
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

## 0.1.1

### Patch Changes

- Updated dependencies [8d842cb]
- Updated dependencies [8d842cb]
  - @kybernetes/protocol@0.2.0
  - @kybernetes/sim-core@0.2.0
