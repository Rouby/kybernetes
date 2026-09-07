# _legacy cut line (M0 scaffold)

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
