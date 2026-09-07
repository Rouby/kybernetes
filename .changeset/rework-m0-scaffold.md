---
'@kybernetes/protocol': minor
'@kybernetes/sim-core': minor
'@kybernetes/server': minor
---

M0 rework scaffold: protocol v2, world kernel, and SimHost shells land alongside legacy code

- Protocol v2 (additive, legacy wire untouched): envelope with v/tick/serverTimeMs plus
  HELLO_MISMATCH, input-only ClientIntent union (HELLO, JOIN_BEACON, INPUT, INTERACT,
  DOOR, HIRE, TALK, SUIT, CONSUME, SLEEP, FIRE), ticked ServerSnapshot channels
  (SNAPSHOT 10Hz, TELEMETRY 2Hz, VITALS 5Hz, NOTICE, HIRE_OFFER, MANIFEST, WATCH),
  the single Role enum with legacy role mapping, and runtime validate guards plus
  per-intent rate limits.
- World kernel scaffold in sim-core: pure types (World, VesselFrame, StationFrame,
  RoomNode, PortalEdge, PawnBody with limb/organ seam), frame transforms, server-side
  movement integration, portal doors with cooldown and destroyed-to-hole transition,
  hullCompiler room-grid DSL with airtightness and connectivity checks, airAuthority
  portal-area mapping, fixed-step tickWorld, and StationHub / HesperiaV2 hull specs.
- Server host scaffold: SimHost with 20Hz accumulator and 10/5/2Hz broadcast clocks,
  beacon registry with per-beacon caps and join cooldown, validatePipe
  (parse, version check, schema guard, rate limit), ticked snapshotter builders, and
  a thin intent router. Frozen renderers, HUD, air-sim core, tokens, and audio untouched.
