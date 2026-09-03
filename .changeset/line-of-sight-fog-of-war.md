---
"@kybernetes/sim-core": minor
"@kybernetes/web": minor
---

Implement performant Line of Sight (LoS) raycasting with static light polygon caching and realistic persistent Fog of War:
- Add pure TypeScript `isPointInPolygon` (Jordan curve ray-crossing test) and `ExplorationGrid` spatial data structure in `@kybernetes/sim-core`.
- Add bounding-box pre-culling to `computeVisibilityPolygon` for a 90% reduction in raycast math.
- Implement static ceiling light visibility polygon caching in `WebGL2Renderer`, invalidating only when blast doors change states.
- Introduce persistent world-space Fog of War framebuffer (`fowFBO`) tracking explored ship regions with smooth vector rasterization.
- Add `FOW_AMBIENT_FS` shader modulating ship room ambients: unexplored areas are shrouded in pitch black void, explored areas retain dimmed tactical memory blueprint, and active sightlines receive full dynamic lighting.
- Filter dynamic entities (intruders, remote pawns, and floating nametags) so they are concealed unless in the player's active Line of Sight or immediate ambient awareness.
