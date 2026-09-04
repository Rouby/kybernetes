---
"@kybernetes/protocol": minor
"@kybernetes/sim-core": minor
"@kybernetes/web": minor
---

Overhaul CSS Hesperia vessel design to a realistic submarine/hard-sci-fi architecture where space is a luxury:
- Scaled vertical room dimensions to a dense 140px height ($Y: 228 \to 368$ upper deck, $Y: 432 \to 572$ lower deck), creating a sleek 2.4:1 submarine hull profile ($940 \times 380\text{px}$) and eliminating floor void.
- Reduced central corridor to a narrow 64px catwalk spine ($Y: 368 \to 432$) with subfloor conduit grating, glowing guide rails, and intermediate pressure blast bulkheads.
- Densely packed compartments with collidable cargo container stacks, reactor containment shroud barriers, avionics server racks with diagnostic LEDs, dual algae bioreactor vats, crew sleep pods, and mess dining furniture.
- Re-architected 11-compartment micro-grid with dedicated Life Support scrubber bay, Avionics matrix, dual-stage interlocked airlocks, and wall-recessed living bunks and galley.
- Re-architected clean 1:1 station identifiers with updated bot patrol routines and shift checklist duties.
- Upgraded WebGL2 deck shaders, contoured armored hull silhouette, and aft thruster plume arrays.
- Enhanced tactical camera with tighter default zoom (1.35x) and a tighter framing range (0.95x - 1.85x) to frame compact submarine compartments intimately.
- Fixed crew hover reticle `[ ]` brackets and world speech bubble projection so they scale and stay pixel-locked to pawns across all zoom levels.
- Replaced mouse-click door operation across rooms with diegetic proximity interaction: corner brackets frame the hatch only when standing directly in front of it, and pressing `[E]` toggles the blast door open/closed with synchronized sound.
- Removed in-world UI overlay tag pills for interactions, maintaining a completely uncluttered viewport and displaying interaction intents diegetically on the lower-right helmet visor card.
- Implemented directional gaze cone checking for all door and station interactions ($\approx \pm 70^\circ$), ensuring interactions only trigger when looking directly at the target.
- Fixed stuck door toggle state tracking so players can immediately alternate opening and closing doors in place without needing to leave and re-enter proximity range.
