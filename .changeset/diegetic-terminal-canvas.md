---
"@kybernetes/web": patch
---

Diegetic canvas terminal menu plus shell hardening:
- web: Menu lives in one 2D canvas (starfield, panel, buttons) with HudHitTester pointer input and mirrored keyboard controls (arrows/Home/End, Enter, E/C/M shortcuts, aria-live focus announcements); test zones published for pointer e2e. Master audio hook shared by canvas volume buttons and the DOM settings panel, which now lives in the pause overlay. Game shell mounts the terminal with no socket until Embark. E2E boards through canvas hit zones and covers pause/resume/quit-to-menu; the corridor-door smoke failure is pre-existing on the pristine tree.
