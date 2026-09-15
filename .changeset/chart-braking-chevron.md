---
'@kybernetes/web': patch
---

Galaxy chart: lead burn chevron follows the live burn phase

- The chevron riding the ship always showed the departure (prograde) burn, so braking past the flip still read as burning toward the target.
- Frozen live legs now carry a `flipPassed` phase flag and the lead chevron renders the retrograde burn vector once the flip is behind the ship.
