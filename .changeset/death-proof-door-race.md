---
"@kybernetes/server": patch
"@kybernetes/web": patch
---

Death proof over real sockets plus deterministic door e2e:
- server: HarborDaemon integration test kills a pawn through the real combat path over two live sockets and asserts the authoritative DEATH broadcast, dead VITALS, and a RESTART back to alive VITALS.
- web: Debug HUD exposes the shared viewport target (target:door/target:fixture), and the corridor-door journey waits for that target and presses before keyup, fixing the position-guess race against coasting (3/3 clean repeats).
