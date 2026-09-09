---
"@kybernetes/protocol": minor
"@kybernetes/sim-core": minor
"@kybernetes/web": patch
"@kybernetes/server": patch
---

Seamless station-to-ship walk, no teleport volumes:
- protocol: DOCK_STATUS carries tubeGate, tubeRoom, and world-space mouthWorld for the tube draw.
- sim-core: new station.andock_tube room bridging Andockschleuse A to the mated ship mouth at world x=1210; DockLink drops radius/egress volumes for tubePortal/tubeRoom/mouthWorld; new dockCrossing.ts preserves world position across the mouth line; tickWorld steps movement then cross-frame; LOS reveals tube <-> corridor while walkable; transferThroughDock and transferCooldownUntilTick deleted.
- web/server: three-leaf dock gates, solid tube link in debug view, world-continuous prediction/camera with no snap.
