---
"@kybernetes/protocol": minor
"@kybernetes/sim-core": minor
"@kybernetes/server": minor
"@kybernetes/web": minor
---

### Milestone 4: FTL Visual Overhaul, DecisionTreeAI Raider Combat & Realistic Physics Air Venting

![Kybernetes FTL Tactical Combat Viewport](https://raw.githubusercontent.com/Rouby/kybernetes/main/docs/images/ftl_viewport.png)

- **Authentic FTL Interior Visuals & Grid Layout (`apps/web`)**:
  - Crisp FTL off-white / light slate grid floor plating (`#edf0f5`) with 35px square grid cells.
  - Stamped subsystem floor emblems directly on the grid (`[O2]`, `[ENG]`, `[WPN]`, `[MED]`, `[NAV]`, `[CARGO]`).
  - Iconic FTL diagonal red/pink vacuum warning hazard stripes (`#ffcdd2` background with `#ef9a9a` stripes) across decompressed compartments.
  - Double-lined dark slate bulkheads (`#27384d`) with operable sliding blast doors and status LEDs.
- **DecisionTreeAI Raiders & Waypoint Navigation (`@kybernetes/sim-core`)**:
  - Implemented graph-based waypoint pathfinding through doorways and corridors (no more walking through walls!).
  - **DecisionTreeAI**:
    1. *Survival*: If room oxygen drops below 25% or compartment is vented, raiders flee toward the nearest room with breathable air!
    2. *Engagement*: If crew/player is in line-of-sight within 220px, raiders transition to firefight mode, aim, and shoot red plasma bolts every 1.2s.
    3. *Obstacle Breach*: Attacks locked or closed blast doors blocking their waypoint path.
    4. *Sabotage*: Initiates shaped charge countdown when reaching priority target subsystems.
- **Gun Equipping, Aiming & Projectile Firefights (`@kybernetes/protocol`, `apps/server`, `apps/web`)**:
  - Players equip weapons from the Armory Weapon Locker via `[E]` interaction or quick hotkeys `[1] Kinetic Carbine`, `[2] Pulse Laser`, `[3] Arc Welder`.
  - Continuous mouse aiming with tactical laser sight and crosshair.
  - Left Mouse Click or `[Space]` fires high-speed glowing energy bolts (shader-grade additive glow blending).
  - Raiders return fire with red plasma bolts that damage player vitals.
- **Realistic Physics Air Venting & Exterior Hull Airlocks**:
  - Exterior hull airlocks (Port Airlock, Cargo Vent Hatch, Starboard Vent) can be opened to the space vacuum.
  - Physics-based suction vector field pulls pawns and debris toward open breach openings.
  - Multi-room atmospheric pressure equalization through connected open interior doors.
  - Decompression air stream vapor particles rushing into space vacuum with additive blending.
