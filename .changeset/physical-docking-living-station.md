---
"@kybernetes/protocol": minor
"@kybernetes/sim-core": minor
"@kybernetes/server": minor
"@kybernetes/web": minor
---

Make station-to-ship boarding physical and the station worth being in:
- protocol: New `DOCK_STATUS` channel (phase, walkable, secondsToSeal, gate ids); hire remains role-only, frame changes happen exclusively via dock volumes.
- sim-core: Station hub grows from 3 to 7 rooms (concourse, security, overlook gallery with window, lounge) with departures/kiosk/vendor fixtures and new spawns; dock transfer is seal-aware with portal-anchored facing-preserving egress; ambient concourse crowd (3 wandering NPCs) joins the captain aboard.
- server: Broadcasts `DOCK_STATUS` (immediate on change, 1Hz heartbeat) and crossing notices; hire never teleports.
- web: Gauntlet tube visual (connected walkway vs sealed blinking gates), HUD dock chip (`DOCKED / BOARDING seals in Ns / SEALED`), concourse fixtures, snapshot-driven crowd rendering.
