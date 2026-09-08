---
"@kybernetes/protocol": minor
"@kybernetes/sim-core": minor
"@kybernetes/server": patch
"@kybernetes/web": minor
---

Add a synced world-plus-air debug view on a separate client URL with live portal wind on the wire:
- protocol: New optional `AirFlow` table on `TELEMETRY` (q1 portal throat velocity, signed on the roomA-to-roomB axis); absent on pre-flow senders so old clients keep working.
- sim-core: New `readAirFlows` authority reader plus `quantizeAirFlow` / `significantFlows` helpers; `buildTelemetry` carries the still-air-filtered wind table while staying byte-stable idle.
- server: Harbor daemon ships the live wind table on every TELEMETRY (full and delta) and on join baselines.
- web: New `?debug-world=1` (alias `?view=debug`) top-down 2D debug canvas reusing the connected player socket session: rooms colored by pressure/o2/temp overlay, portals by state, cyan wind arrows, pawns with own-player ring, impacts, and a tick/air status panel. Camera follows the owned pawn (F toggles overview, O cycles overlay); `?debug=1` text HUD still composes on top.
