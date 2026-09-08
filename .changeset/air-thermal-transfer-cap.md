---
'@kybernetes/air-sim': patch
---

Clamp transfers against the thermal crossing point, not just mole equalization

The pairwise capacity clamp allowed 90% of mole-level equalization per tick, but the outflow energy debit cools the source while heating the target, so pressures crossed on the first violent tick. The clamp is now the tighter of the mole bound and a bisection-solved thermal crossing point using the exact outflow-energy formulas, which also calms filling transients in chained rooms. The solver step is carved into single-purpose stages with no behavior change. Also delete the unused `Room.predictPressure`/`predictMoles` helpers and make the ship-atmosphere frame lookup tolerant to recorder float dust.
