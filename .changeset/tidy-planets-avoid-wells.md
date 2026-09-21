---
"@kybernetes/sim-core": patch
"@kybernetes/web": patch
---

Route torch arcs around third-body wells instead of threading them: sim guidance checks moving bodies at epoch time with segment-based clearance and gated sidesteps, and the chart flip search scores body wells alongside the stellar exclusion, so committed and previewed legs no longer fly straight through another celestial body.
