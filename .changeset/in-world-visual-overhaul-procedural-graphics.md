---
"@kybernetes/web": minor
---

### In-World Visual Overhaul: High-Detail Procedural Vector & Shader Art

- **Ship Architecture & Room Plating**:
  - Implemented bespoke procedural floor shaders in `DECK_FLOOR_FS` for all vessel compartments: Command Bridge (hexagonal slate tiles with concentric command dais rings), Reactor Engineering (industrial diamond tread plates with high-voltage hazard warning circles), Cargo Bay & Ore Hold (scuffed freight panels with yellow loading zone striping), Armory & Security (ballistic gunmetal with inset crimson caution borders), and Central Transit Conduit (ribbed runner with luminous cyan navigation tracks).
  - Added soft 14px ambient occlusion perimeter drop shadows along room bulkheads.
  - Multi-layer armored bulkheads: directional wall drop shadows (+4, +5), 7.5px dark structural casing core, 2.8px metallic beveled edge highlight, and panel seam ticks every 32px.
  - Sliding hydraulic blast doors with recessed track frames, LED clearance indicators (green/red), and hazard warning chevrons.
- **Bespoke Station Machinery Models (`StationModels.ts`)**:
  - Procedural vector machinery for all 9 ship stations (Command Helm, Reactor Core Monitor, Armory Gun Locker, Cargo Mag-Winch, Bio-Dome Scrubber, Bunks, Galley, and Dispensers) with proximity interaction targeting brackets.
- **Characters, Combatants & Weapons (`PawnModels.ts`)**:
  - Spacesuit silhouettes with rear oxygen thruster packs, role-colored shoulder chevrons, reflective helmet visors, walk bobbing, and hands holding equipped weapons (`kinetic_carbine`, `pulse_laser`, `arc_welder`).
  - Spiked void-pirate raider models with horizontal crimson visors and armed plasma carbines.
  - Automated sentry turrets with rotating dual-barrel chassis and sweeping red laser targeting beams.
- **Atmospheric Lighting, VFX & Camera Dynamics (`VesselCanvas.tsx`)**:
  - Instantaneous weapon muzzle flash light bursts that illuminate the room and cast dynamic wall shadows.
  - Microscopic atmospheric dust motes floating through the ship's air system.
  - Reactor core ambient pulse breathing in Engineering.
  - Tactical camera dynamics: mouse look-ahead offset towards cursor, decaying weapon recoil screenshake, and smooth mouse-wheel tactical zoom (0.75x to 1.25x) with pixel-accurate world raycasting.
