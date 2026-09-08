---
'@kybernetes/protocol': minor
'@kybernetes/sim-core': minor
'@kybernetes/server': patch
'@kybernetes/web': minor
---

M8: simulated projectiles with discrete magazines, gated full-auto fire

- FIRE spawns a ticked projectile (velocity, life, owner grace) instead of
  resolving hitscan: each tick marches rounds in short substeps against
  pawns, shut doors, and walls, with contact-point refinement so breaches
  resolve on the correct side. Misses expire silently at end of life.
- Magazines are discrete and individually tracked (no bullet pool): firing
  spends the loaded mag, reload swaps in the fullest spare over two seconds
  and retains partials (dry mags are discarded). Heat rebalanced for
  full-auto bursts with cooldown as the sustained limiter; FIRE is
  spam-guarded only.
- One shared fire gate is enforced by the server and mirrored by the client
  from VITALS, so refused shots never send intents, sounds, or flashes
  (downed pawns cannot fire either). Holding F or mouse fires full-auto
  with press-echo flashes; R reloads; the HUD and visor MAG read live
  mag/reserve/spares.
- Hits record TTL-pruned world impacts that flow through SNAPSHOT with frame
  ids; the viewport feeds them to impact particles once each and draws
  server-simulated tracers (extrapolated by snapshot age) with per-weapon
  colors. Each e2e file owns a private daemon, and scene captures record
  the lobby, doorway, and ship corridor.
