---
'@kybernetes/protocol': patch
'@kybernetes/sim-core': patch
'@kybernetes/web': patch
---

Retire the `StartingRole` export in favor of `LegacyStartingRole`

- `actions.StartingRole` and `content.LegacyStartingRole` were identical
  unions; all live consumers (`crewDossier`, `HESPERIA_SPAWNS`, deck/adapter
  tests, the v2 role-unification test) now use `LegacyStartingRole`.
- v1 `actions.ts`/`spatial.ts` keep their frozen shapes through a local
  alias. Continues the v1 protocol module removal per `MIGRATION_V2.md`.
