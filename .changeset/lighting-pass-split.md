---
"@kybernetes/web": patch
---

Split `LightingPass.updateLights` and `renderDynamicLightSources` (cognitive 33 each) into welder/projectile accumulators and per-source light-fan helpers behind a shared pure `isOccludedFromPlayer` sight guard. No visual changes; removes both complexity suppressions and resolves the Fallow target. Covered by 4 new unit tests.
