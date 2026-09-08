# _legacy cut line (M0 scaffold)

C4: default route serves the v2 harbor client (WebGL viewport + diegetic HUD
fed by v2 snapshots through a harbor-side adapter; frozen renderer/passes/
audio consumed untouched). Deleted: old App/components/hooks, preview
scaffolding + its specs, sim-core legacy (state, gameLoop, bots, quests,
duties, roles, legacy survival, systems/*) and their tests. KEPT pinned by
the frozen stack: sim-core intro (kinematics), shipAtmosphere (airflow +
breaches), acoustics, fogOfWar, navigation, collision/deck/doors/visibility,
and protocol v1 render types (actions/board/spatial/subsystems/survival/
broadcasts). Deleting those means remounting the viewport first.

C3: `spatial/deck.ts` + `spatial/doors.ts` rebacked on compiled harbor hulls
(same export names/shapes, new data; doors start shut, stations deferred).
Adapter tests (`spatial.test.ts`, `spatial/deck.test.ts`) updated to harbor
truth. Tests for deprecated modules (`gauntlet`, `bots/botManager`,
`systems/decisionTree`, `systems/projectiles`, `spatial/hullAirDebug`,
`spatial/shipAtmosphere`) deleted with the reback — they encoded old-geometry
behavior of C4-owned modules; the modules themselves follow in C4.

M0 keeps legacy implementations in place so `yarn typecheck` stays green while
protocol v2 / world kernel / SimHost shells land alongside them.

## Freeze (do not rewrite, adapt around)

- `apps/web/src/webgl/WebGL2Renderer.ts`, `passes/`, `shaders.ts`,
  `systems/FramebufferManager.ts`, `systems/ParticleSystem.ts`, `PawnModels.ts`,
  `StationModels.ts`, `DeckFurniture.ts`
- `apps/web/src/webgl/hud/` structure
- `packages/air-sim/src/` (simulation, room, portal, constants)
- `packages/ui-tokens`, `apps/web/src/audio`, StyleX discipline

## Rebuild (delete after replacement, M1-M7)

- `packages/protocol/src/actions.ts`, `broadcasts.ts`, `spatial.ts`, `intro.ts`,
  `survival.ts`, `subsystems.ts`, `boarding.ts` -> `envelope/intents/snapshots/content/validate`
- `packages/sim-core/src/state.ts`, `gameLoop.ts`, `intro.ts`, `duties.ts`, `roles.ts`,
  `quests/`, `bots/`, `spatial/deck.ts`, `spatial/doors.ts`, `spatial/shipAtmosphere.ts`,
  `systems/boardingCombat.ts`, `navalCombat.ts`, `lifeSupport.ts`, `reactor.ts`, `projectiles.ts`
  -> `world/` kernel
- `apps/server/src/server.ts`, `handlers/`, `broadcast/` -> `SimHost/sessions/snapshotter/routers`

Physical move to `_legacy/` happens in M5 once server + web migrate off v1 imports,
so no import breaks mid-rework. Git history already preserves every file.

M1: the wire mapping table is `packages/protocol/MIGRATION_V2.md`; v1 protocol
modules carry `@deprecated` banners pointing at it.

M4: `world/airAuthority.ts` (one air-sim sim per frame, portal-table areas,
readings on the world) is the only air truth. `spatial/shipAtmosphere.ts` is
deprecated and frozen; physical deletion lands with `state.ts` in M5 once the
server host migrates off `VesselSimulationState`.

M5: `world/crew.ts` (hire loop), `world/watch.ts` (watch rotation + grades),
`world/schedule.ts` (vessel schedule + dock transfer), and `world/scenarios.ts`
(harbor stage) are the core loop. Deprecated and frozen: `duties.ts`, `roles.ts`,
`quests/shiftChecklist.ts`, `systems/multiplayer.ts` (Dual/Collab),
`bots/botManager.ts`, `intro.ts`, and the server v1 `handlers/actionRouter.ts`.
Physical deletion once the server and web migrate off v1 (M7 at the latest).

C1: the v1 vessel server, action/intro routers, delta broadcaster, session
types, and their tests are DELETED (replaced by the HarborDaemon + SimHost).
Legacy sim-core and protocol v1 modules stay until the web client migrates.

M7: snapshot builders move to `world/channels.ts` beside the kernel (vessel
identity, derived gauges, voice lines, heat, notices); HUD parity matrix is
`packages/protocol/HUD_PARITY_V2.md`. The live v1 socket is untouched, so
physical deletion of the deprecated paths moves to the transport-cutover epic.
