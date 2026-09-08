---
'@kybernetes/protocol': minor
'@kybernetes/sim-core': minor
'@kybernetes/server': minor
'@kybernetes/web': minor
---

Snapshot delta channels: full SNAPSHOT 1Hz plus deltas, event-driven manifest and watch

- Protocol adds `SNAPSHOT_DELTA` (complete quantized pawns/shots/impacts plus
  changed portals/frames and removals), `full` flags on snapshot/telemetry,
  content `rev` digests on manifest/watch, and pure wire quantization helpers
  (`q2`/`q1`/`q0`, FNV-1a digests). All additive and JSON-safe.
- Sim-core quantizes every channel builder so idle snapshots are byte-stable,
  diffs portals/frames/atmos against the last send, caps wall-breach portals
  at 24 (sustained fire used to bloat the portal and air tables forever),
  and builds projectile colliders once per frame per tick instead of once per
  projectile per substep.
- Server sends full snapshots 1Hz with 10Hz deltas, full telemetry every 5th
  with changed rooms otherwise, manifest on crew-rev change plus 5s heartbeat
  (unicast on join), watch on content-rev change plus 1s heartbeat, and
  suppresses unchanged vitals with a 1s heartbeat. `getStats` exposes
  per-channel message and byte counters for tuning.
- Web merges deltas onto cached full tables (downstream renders unchanged),
  ignores stale ticks and same-rev manifests, suppresses identical movement
  intents with a 500ms heartbeat, and rebuilds atmos/telemetry mappings only
  when a channel tick moves.
- Measured on the harbor world: snapshot 1201B -> 509B idle delta, empty
  telemetry delta 139B vs 1538B full, manifest 10Hz -> event-driven;
  estimated downlink ~13.3KB/s to ~5.8KB/s per client (-56%).
