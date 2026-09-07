---
'@kybernetes/protocol': patch
'@kybernetes/sim-core': patch
'@kybernetes/web': patch
---

Drive pull and drag from air-sim portal flow and show the station atmos overlay

Pull strength was a flat constant per vented room, so punctures yanked as hard as
full breaches, and the atmos overlay only rendered ship-side rooms:

- sim-core now derives wind from the air-sim solver itself: per-portal volumetric
  flow (tracked throat velocity x effective area) through a hemispherical sink
  superposition, mirroring the solver's own drag model, converted to px/s.
- Boarding suction strength scales with solver wind at the room center, so small
  punctures tug weakly and large breaches yank; suction dies out as rooms empty.
- RoomAtmosphereSummary gains optional windX / windY (room-center solver wind);
  client movement prediction and decompression particles read the authoritative
  broadcast values instead of a local pressure heuristic.
- Station lobby, bay, and gauntlet now render in the atmos overlay pass.
