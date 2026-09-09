---
"@kybernetes/sim-core": patch
"@kybernetes/web": patch
---

Frame-aware breach carving: ship breaches no longer punch holes in station walls.
- `carveWallsByFrame` partitions the mixed wall soup (station world coords vs
  ship frame-local) and cuts each frame's gaps only into its own walls, fixing
  phantom station holes in bulkhead rendering plus poisoned LoS/fog blockers
  after firing on ship walls. Untagged segments keep legacy broadcast behavior.
- `getOpaqueWallSegments`, `getWorldOpaqueWalls`, and the DeckPass bulkhead
  pass consume the framed carve; breach models already carry frameId.