# Ship / Server / Protocol Rework Plan — from PRD to playable loop

> Intent: keep what looks good (WebGL2 client rendering, shaders, air-sim physics core),
> throw away and rebuild from scratch what is garbage
> (protocol, server, game loop, base ship/station setup) so the 7 PRD pillars become reachable.
> This doc is the build order. Each milestone follows the AGENTS.md routine:
> Protocol, sim-core + Vitest, server, web adapter, Playwright, 5-gate pipeline, changeset.

PRD pillars (source: PRD.md, 31 lines):

1. Top-down spatial world, rooms/walls/windows mesh + portals, destructible walls,
   crew walking + doors with cooldown + interactables, LOS (see through windows, not walls),
   player pawn + visibility cone (color inside / gray outside) + remembered fog-of-war, start in unknown.
2. Station start, hire loop, watch rotation (the actual core loop). Fresh character on station,
   ships pass by, hire on as role. Roles: engineer, deckhand, cook, security.
3. Survival/suits/supplies (partial): hunger/thirst 0-100, fatigue, elaborate health, hypoxia,
   space suit. Long-term: limbs each with health + vital organs (heart/lungs/brain/liver/kidneys),
   impact-force x material (k, e) damage, dismemberment/organ damage.
4. Naval damage + boarding combat (as built): rooms + portals. Portals = doors or shot-out holes.
   Open doors connect rooms; closed doors exist but do not connect; shot-out door becomes
   connecting hole portal; wind/air flows through it.
5. Co-op/bots/shared state: bots are schedule + voice-line automatons; co-op = 2+ players hire
   onto same ship or join ship-beacon-codes to spawn directly onto that ship.
6. Decoupled sim + authoritative air-sim: pressure, temperature, wind, gas mixtures, drag forces,
   across ships and stations.
7. Tactical HUD (WebGL visor): header/beacon/crew/clearance/credits, vitals + suit, subsystem gauges,
   atmos incl. ECS REPRESSURIZING, checklist + projected grade + timer, weapon ammo/heat/charge,
   progress ring, E prompt, notices, dual/collab cards, sensor legend, hover dossier, room summary.

---

## 0. Keep / freeze vs. rebuild (the cut line)

### 0.1 KEEP — frozen, do not rewrite (adapt around them)

- WebGL2 renderer + passes + shaders: apps/web/src/webgl/WebGL2Renderer.ts, passes/ (DeckPass,
  FogOfWarPass, LightingPass, AtmosOverlayPass, StarfieldPass), shaders.ts,
  systems/FramebufferManager.ts, systems/ParticleSystem.ts, PawnModels.ts, StationModels.ts,
  DeckFurniture.ts. Reason: user-verified look. Rework must not change pixels, only change data in.
- HUD renderers (structure): apps/web/src/webgl/hud/. Keep visor layout; rework only the data
  contract that fills it. HUD invariants from AGENTS.md stay in force (dynamic visor margins,
  7.2px/char monospace budget, no complex formatting inside HudRenderer).
- Air physics core: packages/air-sim/src/ (simulation.ts, room.ts, portal.ts, constants.ts) — staged
  flow solver (pairwise clamp, outflow limiter, multi-inflow relaxation), momentum-tracked portal
  velocity, Mach-1 cap. This becomes the only air model.
- Tokens / audio / styling: packages/ui-tokens, apps/web/src/audio, StyleX discipline. No Tailwind.

You are allowed to adapt code in frozen packages - but only to satisfy new contracts / protocols.
Do not change underlying functionality or architecture.

### 0.2 REBUILD FROM SCRATCH — delete, do not patch

Strategy: remove current implementations,
then write new files in place. No strangler imports from legacy logic — only from frozen math above.

Protocol (packages/protocol/src/) — garbage inventory with evidence:

- actions.ts (about 30 intents): PLAYER_MOVE with x,y,vx,vy trusts client position (cheat + desync);
  debug triggers are client-callable (TRIGGER_NAVAL_EVENT, TRIGGER_BOARDING_EVENT, TRIGGER_PDT_INTERCEPT,
  VENT_REACTOR_COOLANT, EMERGENCY_HULL_REPAIR); three parallel role systems disagree (StartingRole =
  wiper/galley_hand/security_private/hydro_tender/stevedore vs HireableJob = engineer/cook/deckhand
  vs PRD = engineer/deck hand/cook/security); no tick/seq, no envelope version, no validation.
- broadcasts.ts: SPATIAL_SNAPSHOT pawns+bulkheads always sends bulkheads as empty array
  (doors never replicate); TELEMETRY_DELTA is a full-state god object (reactor+lifeSupport+hull+
  shields+defense+events+fires+boarding+roomAtmospheres) with no delta/versioning;
  CREW_MANIFEST deckId hardcoded to deck_a; no tickId/serverTime, no interpolation basis.
- spatial.ts: PawnState has no health/suit/incap summary the HUD needs per-frame;
  WallSegment has no destructibility/breach linkage (PRD wants destructible walls);
  DeckDefinition implies data-driven decks, but the implementation is one hardcoded world.

Server (apps/server/src/) — garbage inventory:

- server.ts (about 576 lines, multiple fallow-ignore complexity comments): god class mixing session
  registry, bot reconcile, pawn carry, intro tick, dual/collab tick, vitals tick, welder tick, broadcasts.
- GameLoop = setInterval(50ms) + Date.now() delta: non-fixed timestep, drift, non-deterministic,
  one loop per session (N sessions = N timers).
- handlers/actionRouter.ts (about 691 lines): handleMoveAction copies client x,y verbatim (no server
  integration, no collision, no rate limit); JSON.parse then cast, no schema validation;
  join/leave bot reconcile inline.
- Intro/docking is a single-ship script (Kestrel, one destination, alternating plus/minus 1400 flyby),
  not a plural ship schedule; beacon-code helpers exist but are not the join path.

Game loop + world (packages/sim-core minus frozen math) — garbage inventory:

- state.ts tickVesselState is a god tick (reactor+lifeSupport+shields+events+air+boarding+supplies+morale)
  with a complexity-ignore; it steps the legacy spatial/shipAtmosphere.ts compartment model,
  while packages/air-sim implements a second, better air model — two air truths, neither authoritative.
- spatial/deck.ts (about 1532 lines): one absolute-coordinate plane fuses ship + station + gauntlet
  (HESPERIA_ROOMS, HESPERIA_WALLS, STATION_BAY_SPAWN); ship motion is faked by DockFrameOffset added
  to ship-side entities (carryAboardPawns, getWorldDoors, getShipFrameWalls) — breaks LOS, collision,
  and air-sim the moment more than one ship exists. Door gaps are hand-cut wall pairs
  (e.g. spine_top_bridge_1/2 + door_bridge 200-240) — fragile, not compiled, not airtight-checked.
- spatial/doors.ts: DoorState has isOpen/isAirlock/isSealed/roomA/roomB/health but no cooldown
  (PRD requires it), no clearance check, no destroyed-to-hole transition the air solver can see.
- survival.ts is flat vitals (hunger/thirst/fatigue/stamina/health/hypoxia/sealed-suit);
  no limb/organ model, static body temp. Fine as v1, but the elaborate PRD health system has no seam.
- Quest/flow duplication: duties.ts + quests/shiftChecklist.ts + quests/watchRotation.ts +
  systems/multiplayer.ts (DualProtocol, CollabShift) overlap; none is clearly the watch-rotation core loop.

Ships/stations content — garbage inventory:

- Single fused map, single ship, single station lobby/bay, gauntlet tube as special-case doors.
  No hull compiler, no reusable station hub, no second ship possible, no spawn/dock contracts
  the renderer and air-sim can share. Rebuild as data (see section 6).

## 1. Target architecture (what done looks like)

Flow: Client input/prediction -> Socket adapter -> WebGL2Renderer + HUD; wire via protocol v2
(ClientIntent input-only, ServerSnapshot ticked); Authority via SimHost fixed-step tick + beacon
session registry; Sim via World (stations + vessels), Hull compiler, air-sim wrapper, Bot schedules.
Host and World tick each other; World and Air step each other; server sends SNAPSHOT 10Hz to client.

Design rules:

1. Authoritative server, input-only client. Client never sends position. It sends sampled input
   (moveVec, facing, sprint, seq) at max 20Hz; server integrates, collides, returns snapshots.
   Client predicts locally between snapshots and reconciles (usePawnMovement becomes
   prediction-only; position trust is deleted).
2. One world, many frames. World space is global. Stations are static frames; each vessel has a real
   rigid frame (origin, angle, vel, angVel). No offset-hack: walls/doors/pawns/air-rooms all resolve
   through frame transforms owned by the world kernel. Renderer keeps receiving world-space geometry
   (same pixels, sane math).
3. Portal graph is the law. Rooms are nodes; portals are edges
   (door | hole | open | airlock; open/closed/destroyed/sealed; cooldown; area). Doors closed = edge
   disabled but present; doors destroyed or walls breached = hole edge enabled. Air-sim, LOS, pathing,
   and movement all read the same portal table — PRD pillar 4 falls out naturally.
4. air-sim is the only air truth. Legacy sim-core/spatial/shipAtmosphere.ts is deleted after cutover.
   The kernel owns one AtmosphereSimulation per vessel + one per station, stepped at fixed dt,
   exposing pressure/temp/O2/CO2/wind/drag + ECS repressurizing flags the HUD already displays.
5. Deterministic fixed-step kernel, DOM-free. packages/sim-core stays 100 percent pure TS:
   tickWorld(world, dt) with dt = 1/20, accumulator in the host, no Date.now() inside sim
   (time is passed in). All randomness seeded/injected for tests.
6. Watch rotation is the core loop; everything else serves it. Station, docked ship, hire,
   embark/transit, watch (duties/checklist/grade), debrief/pay, repeat. Dual/collab mini-games are
   demoted to watch-task variants, not parallel systems.

---

## 2. New world + ship data model (replaces deck.ts / doors.ts / state.ts)

New kernel files (all in packages/sim-core/src/world/, pure + unit-tested):

- types.ts — World, VesselFrame, StationFrame, RoomNode, PortalEdge, Fixture, PawnBody, Projectile.
  RoomNode: id, frameId, poly (rects allowed, polys supported), volumeM3, fixtures.
  PortalEdge: id, roomA, roomB, kind (door/hole/open/airlock), state (open/closed/destroyed/sealed),
  cooldownUntilTick, areaM2, segment.
  PawnBody: id, roomHint, pos, vel, facing, radius, speed, healthSummary, suitSealed, owner.
  Full limb/organ detail is NOT in v1 physics — but healthSummary carries HUD fields plus an optional
  limbs extension slot (see section 7) so the elaborate system plugs in later without rewiring snapshots.
  VesselFrame: id, name, beacon, origin, angle, vel, schedule. StationFrame: id, origin.
- hullCompiler.ts — compileHull(HullSpec) returns rooms, walls, portals, spawns, fixtures, airRooms.
  Input is a compact room-grid DSL (room rects + adjacency + door/window annotations), NOT hand-placed
  wall segments. Compiler emits gap-correct walls, portal segments, spawn points, fixture anchors,
  and one air-sim Room per RoomNode (portals wired by id). Includes airtightness + connectivity
  checks (every room reachable with all doors open; hull closed with all doors closed).
- frames.ts — world/frame transforms, velocity composition (pawn aboard moving ship inherits frame vel).
- movement.ts — server-side integration: input to accel to collide (frozen collision.ts) to
  portal crossing (door state + cooldown) to room-hint update. Replaces trust-client-positions.
- doors.ts — tryToggleDoor(world, pawnId, portalId, tick) with cooldown (e.g. 1.2s), clearance,
  airlock sequencing; destroyPortal (health to 0 becomes hole, stays connecting).
- airAuthority.ts — binds one AtmosphereSimulation per frame to the portal table:
  door/hole/open state maps to effectiveArea; per-tick exposes RoomAtmosphereSummary-compatible view
  plus wind/drag probes for pawns and projectiles. Deletes shipAtmosphere.ts on cutover.
- tickWorld.ts — the only tick: movement, doors/cooldowns, air (fixed sub-step), survival/vitals,
  bots, projectiles/combat, watch/duties, events. Small delegates, no god function
  (Fallow: methods under 20 lines, helpers split out).

Deleted: state.ts (VesselSimulationState/tickVesselState), spatial/deck.ts, spatial/doors.ts (replaced by
world versions), spatial/shipAtmosphere.ts, systems/boardingCombat.ts + navalCombat.ts + lifeSupport.ts +
reactor.ts as god systems (survivors re-expressed as watch-task subsystems or deleted — see M5),
gameLoop.ts (host owns timing), duties.ts/roles.ts/quests/bots-botManager.ts (replaced by sections 4-5
models; salvage tests as spec).

---

## 3. New protocol v2 (replaces packages/protocol/src wire)

Load the protocol skill before touching; keep discriminant type tags per AGENTS.md.

- envelope.ts — every packet carries v: 2, tick, serverTimeMs, type. Old unversioned packets rejected
  with a HELLO_MISMATCH notice (forces client update, no silent mixed play).
- intents.ts (client to server, input only — replaces actions.ts): HELLO (callsign, color,
  clientVersion), JOIN_BEACON (beacon; replaces JOIN_VESSEL), INPUT (seq, moveVec, facing, sprint,
  sealed; replaces PLAYER_MOVE x,y), INTERACT (fixtureId), DOOR (portalId, wantOpen), HIRE (offerId,
  job), TALK (npcId), plus minimal SUIT (sealed), CONSUME (itemId), SLEEP (bunkId, active),
  FIRE (originAngle, weapon; server raycasts, client never sends hit results).
  DELETED: all TRIGGER_*, VENT_*, DEPLOY_*, EMERGENCY_* debug/triage cheats.
- snapshots.ts (server to client, ticked — replaces broadcasts.ts): SNAPSHOT (tick, pawns, portals,
  projectiles, frames) at 10Hz; TELEMETRY (tick, subsystems, atmos) at 2Hz; VITALS (tick, vitals,
  credits, clearance) per-player at 5Hz; NOTICE (severity, title, message); HIRE_OFFER (offerId,
  jobs[2]); MANIFEST (crew); WATCH (watchNo, section, phase, remainingS, checklist, grade).
  Door/portal state rides SNAPSHOT.portals (fixes the eternal bulkheads-empty-array bug by construction).
- content.ts — the ONE role enum: Role = engineer | deckhand | cook | security (plus captain NPC-only).
  Replaces StartingRole vs HireableJob split; old values mapped once at join (wiper to deckhand,
  galley_hand to cook, hydro_tender to engineer, stevedore to deckhand, security_private to security)
  then removed.
- validate.ts — runtime guards for every intent (ranges, rates, lengths); invalid intents dropped with
  a counter, never throwing inside the tick.

Wire principles: snapshots carry tick so the client can interpolate (pawns) and detect drops; intents
carry seq so the server can dedupe/reorder; each channel has one consumer (SNAPSHOT to viewport/LOS,
TELEMETRY to gauges/atmos, VITALS to visor vitals, WATCH to checklist/grade).

---

## 4. New server host (replaces apps/server/src)

Load the server-app skill; keep WS teardown + SIGINT/SIGTERM discipline per AGENTS.md.

- SimHost.ts — owns one World, one accumulator (20Hz fixed step, 50ms slice, max 4 steps,
  drop-and-count beyond), and three broadcast clocks (SNAPSHOT 10Hz, TELEMETRY 2Hz, VITALS 5Hz).
  Replaces per-session GameLoop timers + server.ts god class. stop() terminates sockets then closes wss.
- sessions.ts — beacon to VesselFrame registry + station hub session; join/leave/resume by userId
  persistence (position/role/credits/clearance restored, never client-supplied).
- validatePipe.ts — parse, version check, schema guard, rate limit (input max 20Hz, interact/door max 8Hz,
  hire/talk max 2Hz), route. Invalid input dropped with a metric; malformed JSON never reaches sim.
- routers/intentRouter.ts — thin mapping: HELLO/JOIN_BEACON/HIRE/TALK/INTERACT/DOOR/SUIT/CONSUME/SLEEP/FIRE
  each to one kernel call (tryToggleDoor, fireWeapon, ...). No game math here.
- snapshotter.ts — builds the three channels from kernel views (no sim mutation during broadcast).
- Deleted: server.ts god flow, handlers/actionRouter.ts, handlers/introHandler.ts,
  broadcast/deltaBroadcaster.ts (replaced by snapshotter), per-session loops, bot-reconcile-by-role hack
  (bots become crew-list members with schedules, see M4/M7).

Co-op falls out of the registry: hiring onto the same beacon = same vessel frame; sharing a beacon code
out-of-band = direct spawn onto that ship (PRD pillar 5). No special-case lobby code.

## 5. Core loop rebuild (station to hire to watch — PRD pillar 2)

Authoritative flow (kernel watch.ts, protocol WATCH + HIRE_OFFER):

1. Station hub (always up). Fresh customized character spawns in the hub (name/callsign/color;
   CharacterCreationModal kept, wired to HELLO). Window shows the schedule board: inbound vessels
   with ETA/destination/roles-wanted. One map, fly-in/out visible from the window (keep the thin intro
   feel, pluralize it: N vessels on staggered loops, not one Kestrel script).
2. Docked, board, talk. While a vessel is docked, its gauntlet portals unseal; player walks aboard
   (portal crossing, no teleport), talks to captain fixture (TALK returns HIRE_OFFER with 2 random jobs).
3. Hire, embark. HIRE with offerId+job assigns one of the 4 roles, stamps manifest + checklist,
   fills unchosen jobs with NPC/bot crew, seals gauntlet, vessel departs
   (departing to in_transit). Stay-aboard loop supported (no forced disembark; next leg re-docks).
4. Watch rotation (the loop). WATCH carries watchNo, section alpha/bravo, phase active_watch/off_duty,
   remainingS, checklist, gradeProjection: role-specific tasks at fixtures (engineer to reactor stability,
   deckhand to cargo/mess upkeep, cook to galley/morale, security to patrol/incidents); duty tick advances
   progress; vitals/suit/atmos gate performance; end-of-watch grades S/A/B/C + credits/XP/clearance
   (keep the shiftChecklist grading feel, single implementation). watchRotation.ts + shiftChecklist.ts merge
   here; DualProtocol/CollabShift survive only if re-expressed as two-player watch tasks, else deleted.

Acceptance for the loop: spawn, see at least 1 inbound on board, dock, board, hire, depart, complete one
watch, debrief/grade/pay, second leg docks — all without touching legacy intro/dual/collab code.

---

## 6. Content rebuild (base ship + station — replaces hardcoded map)

- StationHub.spec (hull DSL): lobby + bay + window wall + schedule board + gauntlet mouth.
  Static frame at world origin. Reuses StationHub.ts visuals; geometry recompiled from spec.
- HesperiaV2.spec (reference ship): bridge, avionics, life-support, berthing, mess/galley, airlocks,
  armory, cargo, engineering, corridor spine — same feel as today, rebuilt as room adjacency +
  door/window annotations through compileHull. No hand-placed wall pairs; compiler guarantees door gaps,
  window transparency (LOS passes, movement blocks), airtight closure, and air-sim room wiring.
- Gauntlet/dock contract: shipMouth, stationMouth, sealedUnlessDocked — two portals + one tube room,
  driven by vessel schedule phase. Deletes gauntlet special-cases in doors/intro/movement.
- Renderer reuse: compiler emits WallSegment arrays + door-compatible views in world space, so
  DeckPass/FogOfWarPass/LightingPass render unchanged. LOS reads opaque walls + closed doors;
  windows are opaque=false (visible, not walkable) — PRD pillar 1 preserved.

Rule: no new hand-authored wall coordinates after M2. To move a wall, change the spec, recompile,
and let airtightness tests fail loudly.

---

## 7. Survival staging (PRD pillar 3 — partial now, elaborate later)

- V1 (this rework): keep current vitals shape (hunger/thirst/fatigue/health/hypoxia +
  suit sealed/O2/integrity/battery + incapacitated/bleedout) but move the tick into tickWorld
  fed by authoritative atmos probes (pO2-based hypoxia, vacuum/thermal drains).
  Body-temp becomes dynamic (cold rooms + vacuum + suit battery gate it) instead of fixed 37.
- Seam for elaborate health (not built now): PawnBody.healthSummary with hp plus optional limbs and
  organs arrays, plus a damageEvent (force, materialK, materialE, point, limbHint) interface in the
  kernel; v1 hit resolution fills hp only. Full limb/organ sim + dismemberment is an explicit
  follow-up milestone — do not block the rework on it (PRD marks supplies partial for the same reason).
- Supplies stay macro (rations/water/O2/morale/mutiny) ticked by crew consumption + watch performance.

---

## 8. Step-by-step build order (with tests + gates)

Each step: Protocol, sim-core + Vitest, server, web adapter, Playwright, gates, changeset.
Checkboxes are the definition of done. Effort hints assume one agent + the 5-gate pipeline.

- M0 — Scaffold + freeze (0.5d). Branch rework/proto-server-ships.
  Move legacy wire/server/world files to _legacy/ (history preserved, imports broken on purpose).
  Add REWORK_PLAN.md (this file), empty world/, envelope/intents/snapshots/content/validate,
  SimHost/sessions/snapshotter shells + hullCompiler stub. Freeze list (section 0.1) enforced in review.
  Gate: yarn typecheck passes with new shells; renderers untouched.
- M1 — Protocol v2 + validation (1-2d). Ship section 3 (envelope/intents/snapshots/content/validate)
  plus wire.test.ts successor: version reject, seq dedupe, rate-limit vectors, role-enum unification,
  snapshot tick monotonicity. Delete old actions/broadcasts/spatial/intro/survival/subsystems wire
  (after mapping table is documented). Gate: Vitest green; Fallow clean (no ignores).
- M2 — Hull compiler + station hub + reference ship geometry (2-3d).
  Ship hullCompiler.ts + StationHub.spec + HesperiaV2.spec (section 6) + airtightness/connectivity tests
  + toLegacyWalls view so passes render day one. Vitest: compile to walls to portals to air-rooms
  round-trip; door-gap exactness; window transparency flags; every room reachable doors-open / hull sealed
  doors-closed. Playwright (visual): station + empty ship render identical-in-spirit to today.
- M3 — World kernel: frames + movement + doors/portals + LOS wiring (2-3d).
  Ship types/frames/movement/doors/tickWorld movement slice (section 2): fixed-step input integration,
  portal crossing + cooldown, frame-velocity inheritance, server-side collision.
  Vitest: boundary cases (door cooldown enforcement, closed-door block, destroyed-to-hole crossing,
  moving-frame carry without offset-hack drift, zero-dt/no-NaN). Playwright: walk station to gauntlet to
  ship while docked; doors block/open on cooldown; remembered fog-of-war persists (PRD pillar 1).
- M4 — Air authority cutover (2d). Ship airAuthority.ts; bind portal table to air-sim areas;
  step air at fixed sub-dt; expose pressure/temp/O2/CO2/wind/drag + ECS repressurizing; delete
  shipAtmosphere.ts + state.ts air paths. Vitest: vented-room map, breach to wind to drag probes,
  repressurize flag lifecycle, station/ship isolation. Playwright/visual: atmos overlay arrows + venting
  states read from new telemetry (renderer unchanged, data source swapped).
- M5 — SimHost + sessions + snapshots + hire/watch loop (3-4d, the core).
  Ship section 4 host + section 5 flow (watch.ts, schedule, captain/NPC fill-ins, manifest, WATCH).
  Vitest: full loop station to hire to depart to watch to grade to re-dock; beacon rejoin/resume; co-op
  two pawns same vessel; reconnect persistence. Playwright: the acceptance journey in section 5 end to
  end (hire modal, checklist, timer, grade/debrief, credits). Delete legacy intro/dual/collab/duties/
  quests/bots paths once covered.
- M6 — Vitals/suit/combat minimal slice (2d). Ship section 7 v1 tick + suit/consume/sleep + minimal
  FIRE (server raycast vs walls/doors/pawns, wall/door damage to hole creation to air reacts — PRD pillar
  4 thin slice). Vitest: pO2 hypoxia, vacuum/thermal drains, bleedout/revive, limb-seam no-op, shot-out
  door becomes connecting hole with airflow. Playwright: seal/unseal suit matters; shot wall/door vents room.
- M7 — Bots + co-op hardening + HUD data parity (2d). Bots as schedule automatons
  (waypoints + voice lines + door discipline) on the portal graph; co-op beacon-join stress (2-4 clients);
  snapshotter output mapped 1:1 to every visor element in PRD pillar 7 (header/beacon/crew/clearance/
  credits, vitals+suit, gauges, atmos+ECS, checklist+grade+timer, ammo/heat/charge, progress ring,
  E prompt, notices, sensor legend, dossier, room summary — dual/collab cards only if kept as watch
  tasks). Playwright: bot presence + co-op shared state; full HUD parity checklist.
  Final: yarn lint, quality, typecheck, test, build, test:e2e:smoke + changeset.

Total: about 2-3 weeks agent-time. First shippable vertical slice = M1 to M3 (walk a compiled ship on
authoritative input with LOS/fog, no air/watch yet) — demo that before M4-M7.

---

## 9. Verification matrix (what proves each pillar)

- Pillar 1 Spatial/LOS/fog — Vitest: compiler airtightness; cooldown; portal cross; visibility polygon +
  explored-memory. Playwright: walk+dock cross; cone colored / outside gray; fog remembers.
- Pillar 2 Hire/watch loop — Vitest: schedule to dock to hire to depart to grade to redock; resume.
  Playwright: full journey incl. modal/checklist/timer/debrief.
- Pillar 3 Survival (partial) — Vitest: hypoxia/bleedout/thermal/consumables. Playwright: suit seal
  matters; starve/tire paths.
- Pillar 4 Damage/boarding — Vitest: door shot to hole to airflow; server raycast. Playwright: vent a
  room by shooting a door.
- Pillar 5 Bots/co-op — Vitest: schedules; 2-pawn same frame; beacon rejoin. Playwright: 2 browsers
  share ship state.
- Pillar 6 Air authority — Vitest: wind/drag probes; repressurize flags; isolation. Playwright: overlay
  arrows + vent states.
- Pillar 7 HUD parity — Vitest: snapshotter field coverage test. Playwright: every visor element fed by
  new channels. No HUD element on mock data.

Plus mandatory per-milestone: yarn lint and yarn quality and yarn typecheck and yarn test and yarn build
(plus test:e2e:smoke on PRs, full test:e2e on main) and yarn changeset for touched packages.

---

## 10. Risks / open questions (decide early, not mid-M5)

1. Renderer adapter strictness. If the new world view cannot feed DeckPass/FogOfWarPass unchanged,
   prefer fixing the view (world-to-walls mapper) over touching passes. Escalate before editing frozen files.
2. Tick budget. 20Hz sim + 10/5/2Hz broadcasts is the starting point; measure host CPU with 2 vessels +
   8 pawns + air sub-steps before tuning. Do not optimize by reintroducing client-trusted positions.
3. Two air models during M4. Keep legacy air runnable until authority cutover lands, then delete in the
   same PR (no dual-truth window across milestones).
4. Elaborate health scope creep. Limb/organ sim is explicitly out of this rework (seam only).
   Any PR adding per-limb physics before M7 must be split out.
5. Beacon abuse. Beacon codes are spawn keys — add per-beacon caps + join cooldown at sessions.ts
   from day one (avoids spawn-flood breaking the watch economy).

## Appendix A — file actions cheat sheet

- Delete after replacement: packages/protocol/src/actions, broadcasts, spatial, intro, survival,
  subsystems, boarding (to envelope/intents/snapshots/content/validate);
  packages/sim-core/src/state, gameLoop, intro, duties, roles, quests, bots,
  spatial/deck, spatial/doors, spatial/shipAtmosphere, systems/boardingCombat, navalCombat,
  lifeSupport, reactor, projectiles (to world/ + minimal subsystems);
  apps/server/src/server, handlers, broadcast (to SimHost/sessions/snapshotter/routers).
- Create: packages/sim-core/src/world/types, hullCompiler, frames, movement, doors, airAuthority,
  watch, tickWorld + content/StationHub, HesperiaV2 specs; packages/protocol/src/envelope, intents,
  snapshots, content, validate; apps/server/src/SimHost, sessions, validatePipe, snapshotter,
  routers/intentRouter.
- Touch lightly (adapter only): apps/web/src/hooks/useVesselSocket.ts (v2 channels + interpolate +
  predict/reconcile), usePawnMovement.ts (send INPUT, not position), StationHub.ts visuals if spec
  renames ids. Passes/shaders/HUD/air-sim core: no edits.
