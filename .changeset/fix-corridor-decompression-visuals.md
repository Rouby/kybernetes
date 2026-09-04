---
"@kybernetes/sim-core": patch
"@kybernetes/server": patch
"@kybernetes/web": patch
---

Remove hazard floor shader and fix hallway door interactions and airflow:
- Completely removed hazard floor stripes and vacuum floor shader from `DECK_FLOOR_FS` and `DeckPass`, replacing airlock vestibule floors with clean brushed gunmetal chamber plating.
- Fixed bot navigation across hallway doors in `findNavigationPath`: automatically insert `door_spine_fwd` ($x = 440$) and `door_spine_aft` ($x = 760$) waypoints during corridor transits.
- Enhanced bot door detection in `botManager`: bots recognize and request toggling for any closed door within 42px along their path, allowing bots to open hallway spine doors cleanly and proceed.
- Fixed hallway door airflow drag routing in `atmosGrid`: sub-partitioned the catwalk corridor into zones (`corridor_fwd`, `corridor_mid`, `corridor_aft`) that connect only through open spine doors, guiding drag vectors through door openings and preventing closed hallway doors from leaking suction.
- Aligned cellular decompression wave vectors with neighbor flow paths in `propagateDecompressionWave` instead of pulling diagonally through solid bulkheads.
- Added server-side wall and closed door collision resolution in `server.ts` during wind push.
