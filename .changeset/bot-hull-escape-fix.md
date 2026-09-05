---
"@kybernetes/sim-core": patch
---

Fix bots walking out of the ship through the mess hall ceiling. Rest targets were hardcoded at y=160, above the top hull line (y=228) in vacuum. Rest spots are now derived from room interiors, and all bot movement (stepwise, arrival teleport, work shuffle) is clamped to the hull interior as a guardrail.
