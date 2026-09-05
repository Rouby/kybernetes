---
"@kybernetes/protocol": minor
"@kybernetes/sim-core": minor
"@kybernetes/server": minor
"@kybernetes/web": minor
---

Moving ships architecture improvements across P0, P1, and P2:
- P0: Fixed breach repair welding distance check to account for ship translation offset in world space, enabling hull repair while underway.
- P0: Exported `STATION_AMBIENT_ATMOS` and supplied nominal habitat atmosphere to station crew, preventing vacuum damage inside station lobby and docking bay.
- P0: Confined `CellularAtmosGrid` strictly to ship compartments (`isShipSideRoom`), preventing station cells from translating with the ship during undocking.
- P0: Exported `SPACE_VACUUM_ATMOS` and implemented 3-tier atmosphere resolution (`resolveAtmosphereAt`), correctly subjecting unsealed crew in space vacuum to hypoxia and decompression ebullism.
- P1: Added pure frame conversion helpers (`toShipLocal`, `toWorld`) and unambiguous `SHIP_ROOM_IDS` lookup to sim-core.
- P1: Offloaded door rendering and cellular atmospheric overlay translations to GPU model matrices, eliminating per-frame CPU vertex array allocations.
- P2: Introduced `VesselKinematics` contract on `SHIP_DOCKING_UPDATE`, implemented smoothstep kinematic curves for docking and departure, and modulated aft thruster flare during ship motion.
- Fixed deck floor procedural textures and tactical room decals (helm dais, scrubber ring, reactor warning, cargo pad, catwalk spine) to evaluate against the ship-local reference frame, ensuring they remain locked to vessel compartments during motion.
- Fixed bulkhead bullet impact hole/scorch decals (`partitionHoles`) to record and store in ship-local reference frame, translating faithfully with ship offset in `DeckPass`.
- Implemented Galilean projectile momentum inheritance: weapons fired aboard moving ships inherit ship velocity vector $\vec{V}_{ship} = (v_x, v_y)$ in both client prediction and server authoritative simulation, eliminating projectile carry drift and ensuring perpendicular shots travel straight across ship compartments.

