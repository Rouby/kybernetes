---
'@kybernetes/protocol': minor
'@kybernetes/server': patch
'@kybernetes/web': minor
---

Cutover C2: v2 web client alongside at ?harbor=1 with migrated e2e

- Protocol gains the JOINED handshake identifying the joining pawn.
  The daemon answers admissions with it.
- New harbor client: v2 socket hook (channels, auto-seq intents, reconnect
  with resume by stored userId), predicted movement with authoritative
  reconcile, static compiled geometry with live snapshot dynamics, and HUD
  readouts for status, vitals, watch, manifest, offers, and notices.
- Server door toggles now enforce a reach check against the authoritative
  pawn position; fresh spawns prefer the designated fresh_spawn point.
- E2E suite swaps to the harbor client (smoke plus acceptance journey);
  legacy v1 specs are deleted and files run serially against the shared
  single-vessel daemon. The default route still serves the old client.
