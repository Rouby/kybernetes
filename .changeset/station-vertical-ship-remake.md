---
"@kybernetes/sim-core": minor
"@kybernetes/server": patch
"@kybernetes/web": patch
---

Screenshot-faithful harbor remake: station plus docked vertical vessel.
- Station: north band (Habitat 1-4 / Medizin / Sicherheit-Nord), central
  corridor with west Kommando stub and east N-S dock spine, south band
  (Hydroponik / Frachthalle / Reaktorraum / Sicherheit-Sued), and east
  Andockschleuse A airlock tube. Retires lobby/bay/gauntlet/concourse /
  overlook/lounge ids; spawns, crowd waypoints, fixtures, lights, and
  ambients remapped onto the new rooms.
- Vessel: vertical Hesperia spine (Bruecke / Kajute-Nord / Kajute-Sued /
  Schiffskorridor / Reaktor-Antrieb) with a west corridor mouth mating the
  airlock. Dock link, SHIP_ORIGIN (1210,-80), and far hold move east;
  transfer volumes and stride-scale egresses re-pinned to the new leaves.
- Renderer: dock tube, station block plate, vertical armor outline, south
  drive bells with +Y exhaust, corridor light lookup, and rewritten ship
  deck furniture bounded inside the new rooms.
- Tests and e2e journeys follow the new room graph; no wire changes
  (existing fixture stationTypes cover the new rooms).