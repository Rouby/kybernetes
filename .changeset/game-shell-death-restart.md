---
"@kybernetes/protocol": patch
"@kybernetes/sim-core": patch
"@kybernetes/server": patch
"@kybernetes/web": patch
---

Game shell foundation: server-declared death, full-run restart, appearance identity:
- protocol: Add PawnTrim/ThrusterTint appearance wire (appearance.ts), optional trim/thruster on HELLO, RESTART intent with validator and rate limit, DeathCause plus DEATH broadcast, dead flags on SnapshotPawn and VITALS.
- sim-core: Add authoritative death module (isDead, deathCauseFor with bleedout/hypoxia/vacuum/thermal/starvation/dehydration/combat priority, restartRun fresh-run respawn preserving identity), store trim/thruster on pawns, expose dead/appearance in snapshots and vitals, add buildDeath.
- server: Carry appearance from HELLO through beacon join onto pawns, handle RESTART with station-spawn respawn and latch cleanup, track and broadcast DEATH events once per pawn via drainDeaths in the vitals clock.
- web: Persist callsign/color/trim/thruster identity to localStorage, send appearance in HELLO, handle DEATH channel into state plus critical notice, add pure death-screen copy helpers for the upcoming diegetic terminal.
