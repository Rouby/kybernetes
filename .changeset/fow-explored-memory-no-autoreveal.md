---
"@kybernetes/sim-core": patch
"@kybernetes/web": patch
---

Fix Fog of War auto-reveal and persist explored memory per player:
- sim-core: Add origin-aware FOW stamp matrix plus pure exploration-grid serialization (visible demotes to explored, corrupt payloads reject).
- web: Gate omni room/dynamic/reactor light fans per-fragment against the exploration mask in-shader (static lamps keep their full wall-clipped fans so spill around corners stays visible), so lit but unexplored rooms stay void and explored rooms rest as gray tactical memory.
- web: Fix the FOW stamper origin offset and persist the CPU exploration grid to localStorage per beacon/user, rehydrating the GPU mask on load.
