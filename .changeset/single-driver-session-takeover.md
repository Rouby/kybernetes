---
'@kybernetes/protocol': patch
'@kybernetes/server': patch
'@kybernetes/web': patch
---

Give each pawn a single driver: evict the previous holder on same-userId resume

Two sessions under one userId (two tabs sharing a profile) bound the same pawn and both drove it, so facing and suit state flopped between their inputs every tick. `SimHost.joinBeacon` now evicts the previous holder and queues it for termination, and an evicted socket closing can no longer release the beacon seat or the input latch. The daemon closes evicted sockets with a dedicated application code, and the client answers it with a take-over notice instead of auto-reconnecting, which would otherwise steal the pawn straight back every 2 seconds.
