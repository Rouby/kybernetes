---
'@kybernetes/web': minor
'@kybernetes/sim-core': patch
---

Unfreeze renderer rework: live exhaust plumes and seated furniture

- Lifts the WebGL rework freeze: renderer, passes, and models under
  `apps/web/src/webgl/` are editable again (AGENTS.md Step 4 updated,
  frozen annotations removed from harbor adapters and sim-core render data).
  v1-protocol deletion freezes are untouched.
- Thruster plumes are real particles now: `ParticleSystem.emitExhaust`
  streams white-hot/cyan exhaust from the three aft bells through the
  existing additive pool (capped), replacing the static quads that burned
  at full scale even while docked. Emission is motion-gated by a new
  `shipUnderway` render flag (wired from the watch phase: full burn in
  transit, idle trickle docked).
- Seats every ship furniture group inside its room rect (crates, reactor
  shielding, avionics racks, life-support vats, mess dining, armory racks
  all bled through bulkheads) and pins placement with
  `SHIP_FURNITURE_BOUNDS` containment tests plus thruster-bell mounting
  tests against the hull spec.
