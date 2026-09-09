---
'@kybernetes/sim-core': patch
---

Fix ship walls vanishing after breach carves

`isShipSideWall` matched only pristine hull ids, so breach-carved ship pieces (`ship.*_br_*`) failed the ship-side check and `applyShipOffsetToWalls` left them at frame-local coords. Carved bulkheads rendered ~1210px off-ship while collision still blocked, reading as a completely missing wall. The check now strips `_br_` suffixes and falls back to the `ship.` prefix, keeping carved pieces in the ship viewport for both `DeckPass` and `getWorldOpaqueWalls`. `emitWallPieces` also anchors each leading piece at the running cursor so multi-breach walls no longer overlap. Covered by carved-offset and multi-cut unit tests.
