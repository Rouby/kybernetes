---
"@kybernetes/protocol": patch
"@kybernetes/server": patch
---

Slice 3 protocol wire, server authority and networking: strict HELLO_MISMATCH rejection of missing/stale versions and unknown packet types with clean disconnect, 64 KB ingress maxPayload, 30 s ping/pong reaping of half-open sockets, per-stream 256 KB backpressure with baseline recovery, vessel/station-scoped ship and market telemetry fan-out, and removal of 22 orphaned v1 broadcast types from snapshots.ts (live frozen-renderer types retained).
