---
'@kybernetes/server': patch
---

Latch movement inputs per pawn so held keys survive send gaps

- `SimHost` keeps the last `INPUT` per pawn for `INPUT_LATCH_MS` (1000ms,
  slice clock) and feeds held plus queued inputs into every fixed step.
  A zero `moveVec` releases immediately; stale holds expire and coast out
  through damping; leaving clears the latch.
- Fixes sluggish walking regressed by client idle suppression: the host used
  to drain its one-shot input queue every tick, so a held key applied for a
  single step and then damped to a stop until the next 500ms heartbeat.
  The heartbeat interval is now contract-tested to stay below the latch.
