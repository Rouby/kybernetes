---
'@kybernetes/sim-core': minor
'@kybernetes/web': minor
---

Cutover C4: default route on v2, old client and legacy sim deleted

- The default route serves the harbor client. New HarborViewport drives the
  frozen WebGL2Renderer (passes, diegetic HUD, StationHub models, shaders,
  audio engine untouched) from v2 snapshots: predicted hero + remotes with
  voice lines, snapshot-synced doors, TELEMETRY atmos mapped to room summaries
  with vent detection, VITALS mapped to visor vitals and welder heat, gauge-
  fed hull/atmos status, and throttled audio ambience plus event foley
  (footsteps, doors, fire, talk/hire, visor, overlay clicks).
- Deleted the v1 web client (App, all components/hooks), the preview
  scaffolding and its specs, and sim-core legacy (state, gameLoop, bots,
  quests, duties, roles, legacy survival, systems/*) with their tests.
  Web bundle drops 489 to 359 kB.
- Explicitly kept, pinned by the frozen stack: sim-core intro (kinematics),
  shipAtmosphere, acoustics, fogOfWar, navigation, collision/deck/doors/
  visibility, and protocol v1 render types. Deleting those means remounting
  the viewport first; the cutover notes record the boundary.
