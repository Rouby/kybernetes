---
"@kybernetes/sim-core": patch
---

Bind pawns and shots to their vessel: local positions no longer inherit frame velocity (the renderer adds the frame origin), and vessel origins ease exactly once per tick instead of double-stepping.
