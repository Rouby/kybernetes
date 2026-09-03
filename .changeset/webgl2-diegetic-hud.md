---
'@kybernetes/web': minor
---

Migrated all gameplay HUD elements into full-screen diegetic WebGL2 rendering and stripped immersion-breaking debug clutter:
- Implemented spherical helmet visor curvature via vertex shader barrel distortion (`u_curvature = 0.055`) and tessellated quad/border geometry
- Added dynamic aspect ratio safe positioning for top and bottom HUD panels to prevent clipping across ultra-wide and custom displays
- Rendered authentic 30-round double-stack brass & copper ammunition cartridges with live spending, low-ammo warnings, and reload animations
- Added magazine capacity and tactical reloading mechanics to the kinetic carbine with manual reload (`[R]`), auto-reload on empty, reserve pool (`120`), and reload progress
- Rebound Crew Manifest / Origin selection to `[P]` (`KeyP`) or `Shift+R` to dedicate `[R]` to weapon reloading
- Inverse-distortion mouse uncurving in `HudHitTester` for pixel-accurate click and hover detection on curved interactive widgets
- Removed debug cheat buttons (+PASTE, +WATER, +REST), debug battlestation status toggles, and ship console telemetry from personal suit visor
- Replaced DOM sidebars with edge-to-edge 100vw x 100vh WebGL2 viewport, preserving external React modals for lobbies and manifests


