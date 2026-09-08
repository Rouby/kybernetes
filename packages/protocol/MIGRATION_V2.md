# Protocol v1 -> v2 migration map

v1 modules (`actions`, `broadcasts`, `spatial`, `intro`, `survival`, `subsystems`,
`boarding`) are deprecated and frozen: no new fields, no new consumers. They are
deleted in M5 once the server and web finish migrating to v2. This table is the
deletion precondition.

## Client intents (`actions.ts` -> `intents.ts` + `validate.ts`)

| v1 (`ClientAction`) | v2 (`ClientIntent`) | Notes |
| --- | --- | --- |
| `JOIN_VESSEL` (vesselCode, callsign, role, color?, userId?) | `HELLO` (callsign, color, clientVersion) + `JOIN_BEACON` (beacon, seq) + `HIRE` (offerId, job) | Join splits into identity, beacon spawn, and hire; persistence is server-side, never client-supplied |
| `PLAYER_MOVE` (x, y, vx, vy, facingAngle) | `INPUT` (seq, moveVec, facing, sprint, sealed) | Client position trust deleted; server integrates, collides, returns snapshots |
| `INTERACT_STATION` (stationId, deckId) | `INTERACT` (seq, fixtureId) | Fixtures live in the world kernel, not per-deck station lists |
| `TOGGLE_DOOR` (doorId, open) | `DOOR` (seq, portalId, wantOpen) | Portal graph owns cooldown, clearance, destroyed-to-hole |
| `TALK_TO_CAPTAIN` (captainId) | `TALK` (seq, npcId) | Any NPC fixture, not one scripted captain |
| `ACCEPT_JOB_OFFER` (offerId, job) | `HIRE` (seq, offerId, job) | Job is the unified `Role` enum |
| `CONSUME_ITEM` (itemId) | `CONSUME` (seq, itemId) | Unchanged shape, seq added |
| `BUNK_SLEEP` (bunkId, active) | `SLEEP` (seq, bunkId, active) | Unchanged shape, seq added |
| `FIRE_WEAPON` (originX/Y, targetX/Y, weaponType, chargeRatio) | `FIRE` (seq, originAngle, weapon) | Client never sends hit results; server raycasts |
| `START_DUTY` / `COMPLETE_DUTY` / `CANCEL_DUTY` / `WATCH_HANDOVER` | Watch-task variants (M5) | Merged into the single watch-rotation loop |
| `TRIGGER_NAVAL_EVENT` / `TRIGGER_BOARDING_EVENT` / `TRIGGER_PDT_INTERCEPT` / `VENT_REACTOR_COOLANT` / `EMERGENCY_HULL_REPAIR` / `DEPLOY_*` / `VENT_COMPARTMENT` / `BULKHEAD_LOCK` / `TOGGLE_BATTLE_STATIONS` / `ENGAGE_INTRUDER` | DELETED, no equivalent | Client-callable debug/triage cheats; authority stays server-side |

## Server broadcasts (`broadcasts.ts` -> `snapshots.ts`)

| v1 (`ServerBroadcast`) | v2 (`ServerSnapshot`) | Notes |
| --- | --- | --- |
| `SPATIAL_SNAPSHOT` (pawns + bulkheads, always `[]`) | `SNAPSHOT` (tick, pawns, portals, projectiles, frames) 10Hz | Portal state rides the snapshot by construction; tick enables interpolation |
| `TELEMETRY_DELTA` god object (reactor + lifeSupport + hull + shields + defense + events + fires + boarding + roomAtmospheres) | `TELEMETRY` (tick, subsystems, atmos) 2Hz | One atmos view per room plus ECS repressurizing flags |
| `VITALS_DELTA` | `VITALS` (tick, vitals, credits, clearance) 5Hz per-player | |
| `SHIP_ALERT` | `NOTICE` (tick, severity, title, message) | Also carries `HELLO_MISMATCH` version rejects |
| `CaptainJobOfferBroadcast` / `JobAssignedBroadcast` | `HIRE_OFFER` (tick, offerId, jobs[2]) | |
| `CREW_MANIFEST` (deckId hardcoded `deck_a`) | `MANIFEST` (tick, crew with frameId) | Real frame placement, no hardcoded deck |
| Shift/duty/dual/collab updates | `WATCH` (watchNo, section, phase, remainingS, checklist, grade) | Single watch-rotation channel |

## Roles (`actions.StartingRole` vs `intro.HireableJob` -> `content.Role`)

`Role = engineer | deckhand | cook | security` (plus `captain` NPC-only) is the one
enum. `LEGACY_ROLE_MAP` converts once at join: wiper -> deckhand,
galley_hand -> cook, hydro_tender -> engineer, stevedore -> deckhand,
security_private -> security. v1 `HireableJob` lacked `security` entirely.

## Supporting types

- `spatial.PawnState` / `WallSegment` / `DeckDefinition` -> world kernel
  (`world/types.ts`) plus `SNAPSHOT` views; `DeckDefinition` hardcoded worlds are
  replaced by compiled hull specs.
- `survival.PlayerVitals` / `SuitTelemetry` -> `VITALS` channel; the elaborate
  limb/organ model plugs into `HealthSummary` without rewiring snapshots.
- `subsystems.RoomAtmosphereSummary` / reactor / shield / hull telemetry ->
  `TELEMETRY` atmos entries; per-subsystem god objects shrink to watch-task gauges.
- `boarding.*` combat state -> minimal server-raycast `FIRE` slice (M6).
- Every packet carries `v: 2, tick, serverTimeMs` (`envelope.ts`); seq dedupe lives
  in `seq.ts` and is enforced by the server validate pipe.

## Deletion checklist (M5)

- [ ] Server intent router handles only v2 intents; no `ClientAction` import remains.
- [ ] Web socket hook dispatches only v2 snapshots; no `ServerBroadcast` import remains.
- [ ] `wire.test.ts` v1 vectors ported or retired; `wireV2.test.ts` covers the wire.
- [ ] Delete `actions.ts`, `broadcasts.ts`, `spatial.ts`, `intro.ts`, `survival.ts`,
      `subsystems.ts`, `boarding.ts` and remove their `index.ts` re-exports.
