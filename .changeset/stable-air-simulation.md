---
'@kybernetes/air-sim': patch
---

Fix atmospheric flow rates and stabilize gas transport across connected rooms.

- Include mixture molar mass in compressible flow and keep the choked/subsonic transition continuous.
- Limit aggregate pressure response at both portal endpoints to avoid overshoot and negative inventories.
- Apply gas species and thermal-content transfers simultaneously, independent of portal order.
- Ignore nonpositive and nonfinite timesteps and add regression coverage for stability and conservation.
- Add visual playback scenarios for empty-airlock repressurization and hot/cold gas mixing, with pressure and conservation assertions.
- Schedule deterministic door opening/closing events at exact simulation times, record door states, and show event timelines during playback.
- Add staged vacuum-cascade and bulkhead-isolation/repressurization scenarios, plus scheduler and portal-layout regression tests.
