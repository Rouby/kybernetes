---
'@kybernetes/sim-core': patch
'@kybernetes/web': minor
---

Snappier walking and client-predicted bullets with fire shake

- Movement tune (shared server/prediction model): base accel 900 -> 1300
  and damping 6 -> 7, so cruise rises ~150 -> ~186 px/s with a quicker ramp
  and shorter coast. Fixes the heavy/rampy feel and most of the perceived
  press delay (own motion is predicted locally; the ramp was the lag).
- Key presses now send their INPUT on the same frame instead of waiting for
  the 50ms pump, trimming the remaining server-apply latency.
- Fired rounds are predicted locally from the same muzzle/speed/life
  constants as the server and render immediately; predictions the server
  takes over are dropped in its favour, refused shots clear on the FIRE_*
  notice, and anything unconfirmed expires past projectile life. Bullets no
  longer wait a snapshot round-trip.
- Slight camera shake (3px, 120ms decay) on local fire for gun feel.
