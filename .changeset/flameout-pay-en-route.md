---
'@kybernetes/sim-core': minor
---

Continuous in-flight fuel burn

- The torch bunker now drains continuously while underway at
  fuelRateForLeg(tier, thrust) per real second instead of subtracting
  full-hop lump sums on departure and hop boundaries. Departure still
  gates on the full first-hop cost, and previews still project the same
  voyage totals, so only the timing of the burn changed, not the budget.
- Running dry mid-leg flames out with an empty bunker on the same tick;
  an unaffordable mid-leg heat penalty also flames out and drains the
  bunker, so flameout always means empty and any restored fuel resumes
  the burn with no extra charge.
- A hailed rescue drone refuels the estimated remainder of the live hop
  on arrival instead of waiving it.
