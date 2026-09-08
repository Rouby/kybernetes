---
'@kybernetes/protocol': minor
'@kybernetes/sim-core': minor
'@kybernetes/server': patch
'@kybernetes/web': minor
---

M8: simulated projectiles with discrete magazines, reloads, and impact feed

- FIRE spawns a ticked projectile (velocity, life, owner grace) instead of
  resolving hitscan: each tick marches rounds in short substeps against
  pawns, shut doors, and walls, with contact-point refinement so breaches
  resolve on the correct side. Misses expire silently at end of life.
- Magazines are discrete and individually tracked (no bullet pool): firing
  spends the loaded mag, reload swaps in the fullest spare over two seconds
  and retains partials (dry mags are discarded). Heat rebalanced for
  full-auto bursts with cooldown as the sustained limiter; FIRE is
  spam-guarded only.
- Hits record TTL-pruned world impacts that flow through SNAPSHOT with frame
  ids; the viewport feeds them to impact particles once each and draws
  server-simulated tracers with per-weapon colors. Hold F or mouse to fire
  full-auto with press-echo muzzle flashes, R reloads, the HUD shows live
  mag/reserve/spares, and the visor MAG reads from the same channel.
