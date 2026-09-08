---
'@kybernetes/web': patch
---

Fix jumpy authoritative bullets: extrapolate from snapshot arrival, not wall clock

Projectile smoothing subtracted the server wall-clock `serverTimeMs` from the client's monotonic `performance.now()`, which is always hugely negative and pinned the forward extrapolation to zero. Authority rounds therefore rendered at their last 10Hz-delta positions (≈60px steps at 600px/s) while local predictions flew ahead in real time, so confirmed shots visibly snapped backward. The viewport now stamps each snapshot tick's arrival on the client clock and extrapolates up to the 0.15s cap from there, via the unit-tested `snapshotAgeS` helper.
