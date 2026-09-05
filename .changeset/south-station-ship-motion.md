---
"@kybernetes/protocol": minor
"@kybernetes/sim-core": minor
"@kybernetes/server": minor
"@kybernetes/web": minor
---

South station with real alternating ship motion:
- Station relocated to a full-width south block with a vertical docking gauntlet and west approach windows; east wing removed.
- Deterministic dock offset (west entry on even legs, east on odd, through-exit, off-screen hold) with ship/station frame seams across walls, rooms, stations, lights, doors, and visibility.
- Server carries aboard crew and bots, samples and collides frame-aware, and guards gauntlet hatches.
- Web renders every layer offset, predicts and carries the local pawn, tracks live docking eta for smooth approach, and proves motion end-to-end via the offset sweep journey.
- `legIndex` on the docking broadcast; quick-board honors the URL beacon so parallel sessions stay isolated.
