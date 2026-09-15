---
'@kybernetes/protocol': patch
---

Delete protocol v1 modules, v1 wire tests, and `MIGRATION_V2.md`

- Deleted `actions.ts`, `boarding.ts`, `broadcasts.ts`, `intro.ts`,
  `survival.ts`, `subsystems.ts` (previously `spatial.ts`): all remaining
  shapes with live consumers (`PlayerVitals`, `TelemetryDeltaBroadcast`,
  `RoomAtmosphereSummary`, `PawnState`/`WallSegment`/`StationFixture` family,
  `DoorState`, `WeaponType`, hire/offer/docking/transit, boarding-tactics,
  shift-evaluation types) moved verbatim into v2 `snapshots.ts` (legacy
  blocks) or `content.ts`. No consumer changes; everything keeps importing
  from `@kybernetes/protocol` with identical shapes.
- Retired `wire.test.ts` v1 vectors; the v2 wire stays covered by
  `wireV2.test.ts` + `shipWire.test.ts` (protocol suite now 49 tests).
- Removed the v1 barrel exports and `MIGRATION_V2.md` itself: every deletion
  precondition in that doc is now met (v2-only server router and web socket
  hook were already done). Semantic migration of the frozen renderer/audio
  adapter onto the `VITALS`/`TELEMETRY` channels remains future work.
