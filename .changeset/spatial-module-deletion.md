---
'@kybernetes/protocol': patch
---

Delete deprecated `spatial.ts`; move its shapes to v2 `snapshots.ts`

- `PawnState`, `BulkheadState`, `WallSegment`, `StationFixture`,
  `DutyDefinition`, `DeckDefinition`, and the shift-evaluation types now live
  in `snapshots.ts` (verbatim shapes, `StartingRole` spelled as
  `LegacyStartingRole`); v1 `broadcasts.ts` imports them from there and the
  `spatial` barrel export is gone.
- No consumer changes needed: the frozen renderer, deck adapter, collision,
  HUD, and scenario code keep importing from `@kybernetes/protocol`.
  Continues the v1 protocol module removal per `MIGRATION_V2.md`.
