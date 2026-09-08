---
'@kybernetes/protocol': minor
'@kybernetes/sim-core': minor
'@kybernetes/server': patch
'@kybernetes/web': minor
---

M8: simulated projectiles with magazines, reloads, and impact feed

- FIRE now spawns a ticked projectile (velocity, life, owner grace) instead
  of resolving hitscan: each tick marches rounds in short substeps against
  pawns, shut doors, and walls, with contact-point refinement so breaches
  resolve on the correct side. Misses expire silently at end of life.
- Magazines: 30-round mags with 120-round reserve on vitals, an `empty` gate
  on fire, and a 2-second RELOAD intent that refills from reserve. Heat and
  overheat behavior unchanged.
- Hits record TTL-pruned world impacts that flow through SNAPSHOT with frame
  ids; the viewport feeds them to impact particles once each and draws
  server-simulated tracers with per-weapon colors. R reloads, the HUD shows
  live mag/reserve/reloading, and e2e breaches a wall, spends, and refills.
