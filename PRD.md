# Product Requirements Document (PRD)

## Core Pillars

1. **Top-down spatial world, WebGL2 viewport, tactile controls**: 

Ship comprised of different rooms, walls, windows. These rooms form a mesh (e.g. rooms connected by portals). Walls are fully destructible (pixel perfect) and may have portals through them. Crew members are simulated and walk around the ship. They can open doors (with a cooldown) and interact with objects. All crew members have a line of sight, and can see through windows but not through walls. Player controls one character pawn, line of sight, rememberd fog-of-war state. Starts within the unknown. Visibility cone show clear colored world, outside view is grayed out.

2. **Station start, hire loop, watch rotation (the actual core loop)**:

Player starts with fresh customized character on a station. Ships pass by and player can hire onto a ship as a role on that ship. Roles are engineer, deck hand, cook, security.

3. **Survival, suits, supplies (partial)**: 

Hunger/Thirst 0-100, Fatigue, elaborate Health system, Hypoxia, space suit. Pawns are complex system of limbs, each with their own health, and vital organs (heart, lungs, brain, liver, kidneys). Damage is calculated based on impact force and material properties, (k, e) values. Limbs can be shot off, organs can be damaged, etc.

4. **Naval damage and boarding combat (as built)**: 

Ships are simulated as a series of rooms, and portals. Portals can be doors but also shot-out holes in the walls. When doors are open they connect rooms. When doors are closed they still exist but don't connect rooms. If a door is shot out it becomes a portal that connects the two rooms, and wind/air will flow through it.

5. **Co-op, bots, shared state**: 

Bots are simple automatons with schedules and voice lines to make the ship feel alive. Coop gameplay is possible if two or more players hire onto the same ship or join ship-beacon-codes to directly spawn onto that ship.

6. **Decoupled sim + authoritative air-sim**: 

Physically correct air and atmosphere simulation across ships and stations. Including but not limited to air pressure, temperature, wind, gas mixtures, drag forces.

7. **Tactical HUD**:

WebGL visor (header/beacon/crew/clearance/credits, vitals + suit, subsystem gauges, atmos incl. ECS REPRESSURIZING, checklist + projected grade + timer, weapon ammo/heat/charge, progress ring, [E] prompt, notices, dual/collab cards, sensor legend, hover dossier, room summary).
