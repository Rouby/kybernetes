---
'@kybernetes/web': patch
---

Cutover C5: fullscreen viewport, debug panel behind a flag

- The WebGL viewport fills its container via ResizeObserver instead of a
  fixed 980x640 frame, restoring the fullscreen feel of the old client.
- The harbor debug readout panel only renders with `?debug=1` (the e2e
  suite passes it); the default route shows the visor alone.
