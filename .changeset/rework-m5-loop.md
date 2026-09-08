---
'@kybernetes/protocol': patch
'@kybernetes/sim-core': minor
'@kybernetes/server': minor
'@kybernetes/web': patch
---

M5 core loop: station to hire to watch to grade to redock on the world kernel

- New hire loop (world/crew.ts): captains per vessel, talk for a two-job offer,
  hire aboard as one of the four unified roles, NPC fill-ins for unchosen jobs,
  and immediate departure. Watch rotation (world/watch.ts) advances role tasks
  while crew are aboard, grades S/A/B/C with credits, XP, and clearance.
  Vessel schedule (world/schedule.ts) cycles docked to departing to in_transit
  to inbound with gauntlet seal discipline and positional dock transfers.
- tickWorld drives schedule and watches as small delegates; the harbor scenario
  stages station plus docked reference vessel with captain, transit, and dock
  link. SimHost owns air, sessions (beacon join, resume by userId, co-op on one
  beacon), and TALK/HIRE handling; snapshotter adds WATCH and HIRE_OFFER.
- JOIN_BEACON gains an optional userId for resume. Legacy duties, roles,
  checklist, Dual/Collab, bots, intro, and the v1 action router are deprecated
  and frozen; deletion follows the server migration.
- Playable preview runs the harbor journey in-browser (walk aboard, talk, hire,
  watch, grade, redock) with Playwright acceptance coverage.
