---
'@kybernetes/protocol': minor
'@kybernetes/server': patch
---

M1 protocol v2 hardening: seq dedupe, tick ordering, version rejects, role unification

- New pure `seq` module: `isFreshSeq` / `advanceSeq` per-sender cursors plus
  `isNewerTick` snapshot ordering, all covered by the new `wireV2` suite (version
  reject, seq dedupe/reorder, rate-limit budgets, role-enum unification, tick
  monotonicity, client-position stripping).
- Server validate pipe enforces seq dedupe ahead of the rate limiter with a new
  `duplicate` outcome; v1 version mismatches, INPUT floods (20Hz budget, window
  rollover), and retried/reordered intents are covered by pipe vectors.
- `MIGRATION_V2.md` documents the full v1-to-v2 table (intents, snapshots, roles,
  supporting types, M5 deletion checklist); the seven v1 wire modules are marked
  `@deprecated` and frozen. No deletions yet — server and web still import v1.
