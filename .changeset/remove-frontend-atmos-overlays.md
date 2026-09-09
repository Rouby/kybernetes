---
"@kybernetes/protocol": minor
"@kybernetes/web": patch
---

Remove atmos room overlays from the frontend viewport; the debug world view keeps its own overlays:
- web: HarborViewport no longer owns an overlay mode or `o` toggle; WebGL2Renderer drops the atmos overlay pass; the HUD loses the SENSOR toggle button and O2 legend panel (DISEMBARK slides left); deleted the overlay pass, geometry builders, sensor legend config, and their tests/shaders.
- protocol: removed the now-unused UI-only `AtmosOverlayMode` type (never appeared on the wire; TELEMETRY atmos data still flows for vitals, frost, audio, and the debug view).
