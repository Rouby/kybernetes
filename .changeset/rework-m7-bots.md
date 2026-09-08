---
'@kybernetes/protocol': minor
'@kybernetes/sim-core': minor
'@kybernetes/server': patch
'@kybernetes/web': patch
---

M7 bots, co-op hardening, and HUD data parity: the rework finale

- Bots are schedule automatons: waypoint patrols on the portal graph with door
  discipline and arrival voice lines, ticked inside the world step; NPC crew and
  captains patrol from staging and hiring. Weapon heat with overheat refusal
  and cooldown completes the per-pawn combat state.
- Channel builders move into sim-core beside the kernel they read, with vessel
  identity on manifests, derived subsystem gauges, voice lines on snapshots,
  heat on vitals, and a notice builder. HUD_PARITY_V2.md maps every visor
  element to its channel, composition, or explicit follow-up.
- Host sessions enforce per-beacon caps with join cooldowns and slot release
  on leave; four-client co-op crews share one vessel with full manifests.
- The playable preview renders a builder-only HUD readout (bots, voice, heat,
  gauges) with Playwright parity coverage on the harbor journey.
