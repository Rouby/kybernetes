---
"@kybernetes/web": patch
---

Slice 4 WebGL2 rendering and tactical HUD: HudRenderer.dispose covering all GL objects and wired into WebGL2Renderer.dispose, visor-margin-stacked center alerts, two-line ammunition readout with condensed incap notice plus text-budget tests, clearance/credit header chips, pre-baked monochrome glyph atlas with zero gameplay texImage2D, pre-allocated HUD scratch buffers with bufferSubData uploads, single-draw instanced particle batching, five widget classes with zero complexity suppressions, and subsystem bars plus watch progress ring.
