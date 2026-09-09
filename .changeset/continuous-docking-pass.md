---
"@kybernetes/protocol": minor
"@kybernetes/sim-core": minor
"@kybernetes/server": patch
"@kybernetes/web": patch
---

Screenshot-driven docking and overlay correctness pass:
- Continuous boarding: tight gate-leaf transfer volumes with stride-scale landings replace the 100px teleport yank; dock gates read walkable for movement and sight while the cycle holds them (air graph keeps sealed-safe states, so nothing vents); dock leaves refuse manual toggles and bot discipline while the cycle owns them.
- Camera: frame-origin velocity feedforward keeps embarked views panning with docking burns instead of juddering behind snapshot deltas.
- Overlays: atmos quads derive ship/station side from room frames (new hub rooms no longer ride the vessel offset); fog-of-war volume covers the harbor plus docked vessel with an explicit world origin on both CPU grid and GPU passes.
- Breach cuts widen progressively with area so merges grow instead of popping; impact pressure rides the wire for scaled throws.
- Removed void-zone static station NPCs and repositioned the orphan station hull plate onto the live hub footprint; thruster bells and exhaust moved to the stern.
