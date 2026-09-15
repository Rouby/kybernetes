---
'@kybernetes/sim-core': minor
'@kybernetes/protocol': minor
'@kybernetes/server': minor
---

Draft throttle for torch voyages

- Sim flies legs on a per-voyage throttle (10-100% of the 1g band):
  brachistochrone leg clocks with near-linear fractional fuel burns.
  Full thrust reproduces legacy timings and integer burns exactly.
- NAV_PLOT accepts an optional thrust01 (validated 0-1, clamped to the
  flyable band); NAV_STATE broadcasts the live throttle.
- Server forwards the draft throttle on both plot paths.
