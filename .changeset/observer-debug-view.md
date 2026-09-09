---
"@kybernetes/protocol": minor
"@kybernetes/sim-core": minor
"@kybernetes/server": minor
"@kybernetes/web": minor
---

Move the debug view to a pawn-less same-port observer with server health:
- protocol: New `OBSERVE` intent plus `SERVER_STATS` (TPS actual/target, tick ms last/avg, droppedSteps, accumulator, observer count, per-pawn link quality) and `DOCK_STATUS` broadcasts; `SNAPSHOT`/`SNAPSHOT_DELTA` carry an optional persistent `decals` table.
- sim-core: New pure `debugStats` (TPS window math, link bucketing), `decals` LRU (64, weapon-scaled radii), and `dockStatus` (walkable, boarding_closing countdown, seal-aware) helpers with unit tests.
- server: `SimHost` observer registry (no pawn/seat/latch/eviction, read-only intents dropped as `observer-readonly`), tick timing + ingress tracking, `SERVER_STATS` 1Hz to observers and `DOCK_STATUS` to all, decal-aware delta baselines.
- web: New `useHarborObserver` (HELLO+OBSERVE only); `HarborApp` splits player/observer roots so `?view=debug` never mounts movement/fire/door hooks; `DebugWorldView` defaults to overview with click-to-follow, oriented hits, decal rings, and TPS/link/dock panel.
