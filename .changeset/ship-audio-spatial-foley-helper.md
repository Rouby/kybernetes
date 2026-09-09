---
"@kybernetes/web": patch
---

Ship audio spatial-foley dedup: `ShipAudioEngine` gains a shared `spatialFoleyInput` preamble (audibility gate, channel setup) used by remote footsteps, remote weapon fire, impacts, and door toggles, removing the internal clone family and three `complexity` suppressions. Covered by 6 new unit tests proving audible routing and gain-floor culling.
