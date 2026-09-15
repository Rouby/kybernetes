---
'@kybernetes/protocol': minor
'@kybernetes/sim-core': minor
'@kybernetes/server': minor
---

Drift Captain triage slice 4: stranded rescue loop

- Sim: flamed-out legs tick a 75s HAIL drone countdown to auto-recovery
  and resume immediately when a restored cell plus a hot reactor covers
  the owed burn. HAIL re-hails no-op; tows and dockings stand the drone
  down. NAV_STATE carries hailS.
- Wire/server: HAIL intent (2Hz, nav-console gated) with HAIL_ok/denied
  notices; DISTRESS tow unchanged as the paid fallback.
- Console: stranded panel swaps to HAIL RESCUE plus a DRONE IN countdown
  row while adrift.
