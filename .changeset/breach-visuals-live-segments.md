---
"@kybernetes/protocol": minor
"@kybernetes/sim-core": minor
"@kybernetes/server": patch
"@kybernetes/web": minor
---

Visualize punctures, breaches, and air loss from live sim state instead of room-top anchor guesses. Snapshot portals now carry breach geometry (area, birth tick, frame-local segment, room) so deltas fire when holes widen; sim-core gains a pure breachView module (render models, flow-axis math, exact segment carving shared by the renderer and LOS); the viewport renders area-scaled molten rims that cool into frost over 10 s, black vacuum insets, puncture decals, directional breach plumes with throat collars, wind-driven dust drift, throat arrows and vent shimmer on the atmos overlay, plus live per-room breach counts and wind vectors.
