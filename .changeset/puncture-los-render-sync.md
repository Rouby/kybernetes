---
"@kybernetes/sim-core": patch
"@kybernetes/web": patch
---

Sync wall shooting so bullet punctures no longer open sight lines early:
- sim-core: Framed breach segments carry optional areaM2 and carveWallsByFrame skips punctures below PUNCTURE_MAX_M2, keeping LOS blockers intact until a hole grows into a full breach.
- web: Lightmap pass carves only sizeClass breach models like DeckPass, so vision and bulkhead rendering open together after sustained fire instead of desyncing on the first shot.
