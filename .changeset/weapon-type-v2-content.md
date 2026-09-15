---
'@kybernetes/protocol': patch
---

Relocate `WeaponType` from deprecated `boarding.ts` to v2 `content.ts`

- `WeaponType` now lives with the other content enums in `content.ts`
  (verbatim union, no runtime change); `boarding.ts` and v1 `actions.ts`
  import it from there. All HUD/renderer/audio consumers keep importing from
  `@kybernetes/protocol` unchanged. Continues the v1 protocol module removal
  per `MIGRATION_V2.md`.
