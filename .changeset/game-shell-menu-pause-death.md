---
"@kybernetes/protocol": patch
"@kybernetes/web": patch
---

Playable game shell: menu, customization, pause, death, settings, accents:
- protocol: Carry optional trim/thruster on PawnState for the v2 renderer path (additive).
- web: Full-screen terminal menu (Embark/Customize/audio settings) over a 2D starfield backdrop with no socket until Embark; character customization (callsign, pawn tint, hull trim, thruster drive) auto-persisted; Esc pause overlay gating all but RESTART while the world ticks; server-declared death overlay with restart/quit; master volume plus mute settings over AudioBusManager; trim-inked shoulder chevrons and thruster-tinted exhaust in the WebGL pawn pass via pure accent tables; session split into controls/actions/fire hooks with key-map, starfield, accent, and death-channel Vitest cover.
