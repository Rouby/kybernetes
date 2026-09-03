---
'@kybernetes/web': patch
'@kybernetes/server': patch
---

Modularize large monolithic modules into single-responsibility passes, hooks, and services:
- Decomposed `VesselCanvas.tsx` by extracting `usePredictiveProjectiles`, `useTacticalCamera`, and `useCanvasWeapons` hooks.
- Decomposed `WebGL2Renderer.ts` by extracting `FramebufferManager`, `ParticleSystem`, `StarfieldPass`, `DeckPass`, `LightingPass`, and `FogOfWarPass`.
- Decomposed `server.ts` by extracting `types.ts`, `deltaBroadcaster.ts`, and `actionRouter.ts`.
- Preserved 100% test coverage and wire compatibility across all E2E and unit test suites.
