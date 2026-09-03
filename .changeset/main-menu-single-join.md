---
"@kybernetes/server": patch
"@kybernetes/web": patch
---

Eliminate duplicate vessel joining and introduce diegetic Main Menu:
- Prevent auto-registration of raw WebSocket connections into sessions on the server daemon; sockets remain unassigned until an explicit JOIN_VESSEL packet is received.
- Remove unconditional JOIN_VESSEL packet dispatch on ws.onopen in useVesselSocket.
- Add MainMenu component providing player dossier customization (callsign, starting role) and two primary vessel commissioning modes: "Commission New Vessel" (random 6-char Beacon frequency) and "Board Existing Vessel" (Subspace Beacon code input).
- Quick board button conditionally rendered only in E2E testing mode.
- Add "Disembark" action in shipboard HUD allowing players to leave an active vessel and return to the Main Menu.
- Synchronize active dual-operator protocols and collaborative shifts upon new client admission.
- Update full Playwright test suite to board via Main Menu or test helper.
