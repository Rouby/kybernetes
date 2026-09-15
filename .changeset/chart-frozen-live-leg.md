---
'@kybernetes/web': patch
---

Galaxy chart: pin the live route to its departure snapshot while flying

- The committed prograde/retrograde route was re-solved from the live ship state every frame, so the flip diamond, burn vectors, and interior samples swam while traveling (measured ~6.5px flip drift over 2.5s with the destination endpoint fixed).
- The live leg now renders the remaining slice of its frozen departure snapshot - the same trajectory the ship marker flies - so the endpoint, flip point (seated exactly, not on the nearest sample), and burn chevrons hold still and the route visibly shrinks toward arrival.
- In-transit test fixtures now carry `legTotalS`, mirroring the server wire which always sends it alongside `remainingS`.
