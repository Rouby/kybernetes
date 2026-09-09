---
"@kybernetes/web": patch
---

Split `WebGL2Renderer.render` (cognitive 52) into five pass phases — `updateFrameSimulation`, `renderLightmapPass`, `renderScenePass`, `renderEmissivePass`, `renderHudPass` — plus focused sub-helpers (frost, event intake, remote pawns, welder arcs, hypoxia overlay) so every method sits under the complexity/CRAP gates with no suppressions. Frame output is unchanged; resolves the Fallow render target.
