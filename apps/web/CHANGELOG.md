# @kybernetes/web

## 0.2.0

### Minor Changes

- 8d842cb: ### 2D Viewport, Locomotion & Diegetic HUD
  
  ![Kybernetes Milestone 2 Viewport and HUD](../docs/images/milestone2_viewport.png)
  
  - **Hardware-Accelerated 2D Viewport (`VesselCanvas.tsx`)**:
    - HTML5 2D Canvas viewport tracking pawn locomotion with smooth camera interpolation.
    - Floor grid rendering, tactical compartment tags, bulkhead silhouettes, station interactive glyphs, and dynamic Line of Sight polygon clipping.
    - Responsive `ResizeObserver` maintaining a pixel-perfect 1:1 aspect ratio across all display resolutions.
  - **Pawn Movement Controller (`usePawnMovement.ts`)**:
    - WASD and Arrow Key locomotion controller with normalized diagonal vectors and collision sliding.
    - Proximity detection engine notifying the HUD of nearest interactable stations.
  - **Origin Manifest Modal (`RoleSelectModal.tsx`)**:
    - StyleX modal for selecting starting crew origins, displaying departmental postings, badges, and trait descriptions.
  - **Station Docking Console (`StationConsoleModal.tsx`)**:
    - Interactive modal triggered by pressing `[E]` near fixtures.
    - Supports starting/aborting duties with real-time shift progress meters, bunk sleep cycles for stamina regeneration, and nutrient paste / water recycling dispensers.
  - **Compile-Time StyleX Integration**:
    - Added `@stylex stylesheet;` integration to `index.css`, generating 4.54 kB of compile-time CSS rules and design tokens with zero runtime overhead.
  - **End-to-End Verification (`e2e/milestone2.spec.ts`)**:
    - Comprehensive Playwright tests covering WASD movement coordinates, role manifest switching, station proximity prompt detection, and duty execution.

### Patch Changes

- Updated dependencies [8d842cb]
- Updated dependencies [8d842cb]
  - @kybernetes/protocol@0.2.0
  - @kybernetes/sim-core@0.2.0
