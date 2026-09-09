---
"@kybernetes/protocol": minor
"@kybernetes/sim-core": minor
"@kybernetes/web": patch
---

Screenshot-driven polish pass on LoS, decals, and docked rendering:
- LoS: widen grazing-ray epsilon, sanitize visibility fans, skip sub-pixel fan triangles, and close cone fans across the mouth chord.
- Decals: replace ring/cross impact graphics with small chipped pits (halo, lit edge, dark pit, hot pixel, frost tick) shared by punctures and persistent scorch; stamp room pressure on impacts and scale spark throw by hole area and pressure.
- Docked rendering: reposition the orphan station hull plate onto the live hub footprint, move thruster bells and exhaust to the stern, thread full 2D ship offsets through all render passes, pin posted crew off dock volumes, and stabilize the debug overview while the vessel is off-station.
- Removed void-zone static station NPCs now covered by the sim crowd.
