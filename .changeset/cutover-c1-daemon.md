---
'@kybernetes/server': minor
---

Cutover C1: live v2 harbor daemon replaces the v1 vessel server

- New HarborDaemon serves one harbor world over WebSocket on protocol v2:
  input-only intents through the validate pipe (version, schema, rate limit,
  seq dedupe) with drop counters, and ticked SNAPSHOT/TELEMETRY/VITALS plus
  WATCH/MANIFEST/HIRE_OFFER broadcasts with per-client sessions, beacon caps,
  resume by userId, and clean stop with socket termination.
- Deleted the v1 vessel server, action/intro routers, delta broadcaster, and
  session types. Browser end-to-end stays red until the web client migrates.
