---
'@kybernetes/protocol': patch
---

Relocate `DoorState` from deprecated `boarding.ts` to v2 `snapshots.ts`

- `DoorState` now lives beside its v2 successor `SnapshotPortal` in
  `snapshots.ts` (verbatim shape, no runtime change); `boarding.ts` re-exports
  nothing new and keeps working through the package index.
- No importer changes needed: every consumer (`audio`, frozen `WebGL2`
  renderer, sim-core `visibility`, `wire.test.ts`) keeps importing from
  `@kybernetes/protocol`. First step toward deleting the v1 protocol modules
  per `MIGRATION_V2.md`.
