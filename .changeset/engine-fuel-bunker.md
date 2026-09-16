---
'@kybernetes/sim-core': minor
'@kybernetes/protocol': minor
'@kybernetes/server': minor
'@kybernetes/web': minor
---

Slotted engine fuel: fuel cells are now loaded into the engine bunker (starter engine has 2 slots, 1 cell = 1000 fuel) and flights burn fuel-value scaled by leg distance, thrust, and tier instead of one flat cell per burn. Shop crates and unpacking still yield loose cells, but they must be loaded at the engine console (new ENGINE_FUEL load/unload intent, docked only) before plotting. Nav and chart previews show bunker fuel HAVE vs NEED with a LOAD CELLS warning, and flameout/rescue now triggers on empty bunkers mid-chain.
