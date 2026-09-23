---
'@kybernetes/sim-core': patch
'@kybernetes/web': patch
---

Main torch now lights once clear of the dock and cuts ahead of the docking glide: undocking and docking fly on cold-gas RCS alone, with fully dark bells (no particles, glow cone, or stern light) outside the lit window. Adds `deadExhaustParams` for the dark state. Short legs without room for a lit window stay thruster-only throughout.
