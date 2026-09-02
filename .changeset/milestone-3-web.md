---
"@kybernetes/web": minor
---

### Rimworld + FTL Tactical Visual Overhaul & Damage Control Viewport

![Kybernetes Milestone 3 Tactical Telemetry & Subsystems](https://raw.githubusercontent.com/Rouby/kybernetes/main/docs/images/milestone3_viewport.png)

- **Direct In-World Station Interactions & Round Progress Bar**:
  - Removed full-screen station console modals; fixtures now execute their primary action directly upon pressing `[E]` without interrupting the game viewport.
  - Hardware-accelerated round circular progress ring rendered on the 2D canvas directly above the active fixture (`renderRoundProgressBar.ts`), showing action percentage, verb label, and glowing radial arc.
  - Lean in-game HUD overlay bar with progress readout and abort control (`[ESC] Abort Shift`).
- **Modular 2D Canvas Engine (`src/canvas/`)**:
  - **FTL-Style Outer Hull & Space Void (`renderBackground.ts`, `renderShipHull.ts`)**:
    - Outer armor silhouette with chamfered hull corners, radiator cooling fins, and dual aft ion thrusters with pulsing plasma plumes.
    - Deep space background with subtle starry depth, twinkling parallax stars, and soft nebular gas dust.
  - **Tactical Room Plating & Ambient Occlusion (`renderDeckFloors.ts`, `renderBulkheads.ts`)**:
    - Room-specific floor plating: hex-tech bridge with glowing command ring, diamond-plate engineering deck with diagonal yellow/black hazard warning tape and floor coolant conduits, sanitary checkerboard galley, and freight grids.
    - Rimworld-style ambient occlusion: interior walls cast soft directional drop shadows onto floor tiles for tangible 3D depth.
    - Double-lined metallic FTL bulkheads with beveled highlights and etched subsystem deck emblems.
  - **Detailed Mechanical Fixtures (`renderFixtures.ts`)**:
    - Multi-tier cylindrical reactor with animated pulsing plasma core.
    - Curved holographic bridge helm with multi-monitor tactical displays.
    - Rimworld-style crew cots with pillows, folded blankets, and vitals headboard monitors.
    - Industrial nutrient dispensers, hydration fountains, bio-scrubber fans, and weapon racks.
  - **Rimworld-Style Capsule Pawns (`renderPawn.ts`)**:
    - Rounded pill/capsule torso with soft grounded elliptical drop shadow.
    - Detached floating hands that dynamically rotate and position toward movement and facing angles.
    - Animated walking bob (vertical hop and hand sway during locomotion).
    - Role-based departmental apparel coloring and directional helmet visors.
  - **Atmospheric Hazard Effects (`renderHazards.ts`)**:
    - Multi-particle compartment fires with hot yellow cores, licking orange flame tongues, rising dark smoke, and floating ember sparks.
    - Hull breaches with radiating frost fracture lines and cyan venting decompression gas particles.
- **Diegetic Tactical Telemetry Rail (`TelemetryRail.tsx`)**:
  - Modular StyleX panels with real-time thermal gauges, scrubber efficiency bars, kinetic shields, and damage control triage buttons.
