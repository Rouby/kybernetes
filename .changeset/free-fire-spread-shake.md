---
'@kybernetes/protocol': minor
'@kybernetes/sim-core': minor
'@kybernetes/server': patch
'@kybernetes/web': patch
---

Free the trigger: remove weapon overheating, cost sustained fire with bloom and shake

- sim-core: delete the heat record, `tickHeat`, and the `overheated` fire block. Each shot now adds `SPREAD_PER_SHOT` (0.03 rad) of aim bloom up to `SPREAD_MAX` (0.2 rad), applied to the round's direction with deterministic tick-parity alternation so bursts stay centered while groups widen; bloom bleeds off at `SPREAD_DECAY_PER_S` when not firing. Magazines are the only thing that stop the gun.
- protocol/server: drop `heat` from `VITALS` and the `FIRE_overheated` notice; the fire gate is down/reloading/empty only.
- web: the fire mirror no longer reads heat, the debug vitals line and heat-driven muzzle logic are gone, and camera shake accumulates trauma per shot (decaying over time) on top of a stronger base kick (5px over 170ms, up to ~12px at full trauma).
