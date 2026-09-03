---
"@kybernetes/sim-core": minor
"@kybernetes/web": minor
---

### Realistic 2D Lighting, Dynamic Shadows & Dark Corridors

- **Hardware-Accelerated 2D Lighting & Shadow Pipeline (`apps/web`)**:
  - Implemented multi-pass 2D lighting engine using a dedicated Lightmap Framebuffer Object (FBO).
  - Raycasted 2D visibility polygon triangle fans with smooth quadratic physical falloff (`(1.0 - d/R)^2`).
  - Screen-space multiplicative blending (`gl.blendFunc(gl.DST_COLOR, gl.ZERO)`) to apply illumination and realistic occluding shadows over the ship interior.
  - Directional player pawn flashlight with smooth angular cone falloff, 360° close-proximity ambient halo, and real-time shadow casting as the player turns and aims.
  - Closed blast doors dynamically occlude light; opening doors causes light to flood across thresholds into adjacent hallways.
  - Dynamic illumination from flying pulse lasers, raider plasma bolts, continuous arc welder arcs, and impact spark particles.
- **Atmospheric Dark Corridors & Industrial Bulkhead Lamps (`@kybernetes/sim-core`, `apps/web`)**:
  - Central transit corridor ambient lighting lowered to ~7% deep gunmetal/slate darkness (`[0.06, 0.07, 0.10]`) with dark industrial ribbed deck plating.
  - 4 spaced industrial corridor ceiling lamps (warm tungsten halogen and cool tactical fluorescent strips with subtle atmospheric electrical flicker).
  - Physical ceiling lamp fixtures rendered along the corridor ceiling conduit with glowing lenses and center diodes.
  - Exposed `HESPERIA_LIGHTS`, `ROOM_AMBIENTS`, and `getOpaqueWallSegments` helper for shadow raycasting.
