# @kybernetes/sim-core

## 0.2.0

### Minor Changes

- 8d842cb: ### Simulation Core, Roles & Spatial Physics
  
  - **Starting Origin Roles (`roles.ts`)**:
    - `wiper` (Maintenance Wiper): Engineering department, +15% repair speed, +20% thermal resistance in reactor bays.
    - `galley_hand` (Galley Hand): Sustenance & Logistics, -20% food/water consumption, +10% stamina aura.
    - `security_private` (Security Private): Armory & Defense, +25% combat efficiency, +15% baseline damage resistance.
    - `hydro_tender` (Hydroponics Tender): Biosphere & Life Support, +20% atmospheric scrubber speed, bio-toxin immunity.
    - `stevedore` (Cargo Stevedore): Hold Logistics & Salvage, +30% inventory carrying capacity, +15% scrap yield.
  - **Ship Duty Engine (`duties.ts`)**:
    - Catalog of 8 departmental duties across reactor, mess, armory, hydroponics, and cargo stations.
    - Deterministic tick runner calculating stamina consumption, role specialization boosts (1.5× speed), and starvation/dehydration penalties (halves work velocity per PRD 3.6).
  - **CSS Hesperia Deck Geography (`spatial/deck.ts`)**:
    - Full deck plan: 7 compartments (Reactor Engineering, Galley/Mess, Armory, Hydroponics Bay, Cargo Hold, Bridge, Central Corridor).
    - 16 opaque bulkhead segments and 10 interactive machinery stations.
  - **Physics & Continuous Collision Sliding (`spatial/collision.ts`)**:
    - Circle-to-segment distance and penetration resolution.
    - Multi-axis tangent sliding algorithm (`resolvePawnMovement`) preventing pawn friction sticking along bulkhead surfaces.
  - **Line of Sight & Fog of War (`spatial/visibility.ts`)**:
    - 2D Visibility Polygon raycasting using radial angular sorting of wall endpoints and ray-segment intersections.
    - Forward-facing directional flashlight cone (60° beam) blended with ambient room illumination.
  - **Unit Testing**: 12 new Vitest unit tests verifying collision sliding, raycast occlusion, role matrices, and duty rewards.

### Patch Changes

- Updated dependencies [8d842cb]
  - @kybernetes/protocol@0.2.0
