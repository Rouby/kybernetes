---
"@kybernetes/air-sim": patch
---

Split `AtmosphereSimulation.calculateRoomDragForce` (cognitive 30) into pure, unit-tested helpers — `dragGasProperties`, `portalWindAt` (sink/source wind with Mach-1 cap), and `dragForceFromWind` — leaving a thin orchestration method. No physics changes; resolves the Fallow complexity target. Covered by 9 new tests including an end-to-end vent-room drag direction check.
