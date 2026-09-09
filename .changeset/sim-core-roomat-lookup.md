---
"@kybernetes/sim-core": patch
---

Unify room lookup: `schedule.roomAt` is now the exported canonical frame-local point query and `crew.roomContainingPoint` delegates to it, removing a 17-line duplication (no behavior change; server and combat call sites untouched). Covered by a new `roomAt.test.ts` proving frame scoping, edge-inclusive bounds, and alias parity.
