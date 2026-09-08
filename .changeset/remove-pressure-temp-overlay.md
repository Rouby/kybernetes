---
'@kybernetes/web': patch
---

Remove the pressure/temp tints and wind arrows from the WebGL renderer: the atmos overlay pass now draws room quads for the O2 sensor mode only (pressure and temp stay transparent), and neither room wind arrows nor breach throat arrows are emitted. The sensor control cycles `off`/`O2` (defaulting to O2) and the HUD legend only covers O2. Wind data still flows to particles (ambient drift, breach plumes), and the `?debug-world=1` air view keeps its own pressure/o2/temp coloring.
