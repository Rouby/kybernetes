---
"@kybernetes/sim-core": patch
"@kybernetes/web": patch
---

Fix corridor decompression rendering and local atmospheric awareness:
- Restored dynamic scrolling FTL red/pink decompression hazard warning stripes in `DECK_FLOOR_FS` when `u_isVacuum > 0.5`.
- Split catwalk spine corridor floor rendering into 3 physical segments (`corridor_fwd`, `corridor_mid`, `corridor_aft`) in `DeckPass`, evaluating vacuum state per segment so isolated sections remain protected while breached/vented sections immediately display decompression hazard stripes.
- Connected `AtmosOverlayPass.getGrid()` into `DeckPass.renderDeckFloors` to sample exact local cell pressures rather than masking vacuum behind macro-averages.
- Prevented `AtmosOverlayPass.syncRoomAverages` from overwriting locally evacuated cells with macro room pressure averages.
- Updated `vitalsFormatters` to trigger `VACUUM HAZARD` warning whenever `atmos.isVenting` is true or pressure falls below 30 kPa.
