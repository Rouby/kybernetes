---
'@kybernetes/air-sim': patch
'@kybernetes/sim-core': patch
'@kybernetes/web': patch
---

Vent widened breaches at their live size and prove the wall breach end to end

Combat widens a live breach in place, but the air authority froze each linked throat at its birth size, so every widened hole kept venting like a fresh puncture. Air-sim `Portal` gains a height-preserving `resizeThroat`, and the per-tick area sync follows hole `areaM2` growth, so sustained fire actually tears walls open faster. Covered by a widen-sync unit test. The harbor wall-breach journey fires a sealed-suited close-range burst (muzzles past the collider never touch it; lone punctures cannot vent the bay+lobby complex on a sane timeout) and asserts vent, spend, and reload.
