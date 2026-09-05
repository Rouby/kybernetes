---
"@kybernetes/protocol": minor
"@kybernetes/sim-core": minor
"@kybernetes/server": minor
"@kybernetes/web": minor
---

Implement thin intro docking and captain hire loop:
- Wire contract for station spawn, simulated fly-in/out docking phases, 2-of-3 captain job offers (Engineer, Cook, Deckhand), hire acceptance, and transit updates.
- Deterministic sim-core intro state machine with docked-only hiring, departure countdown, transit progress, NPC crew fill-ins, and next-leg restart.
- Authoritative server hire flow with per-session offer counter, phase-change docking broadcasts, and departure alerts.
- Web docking banner, E-to-talk captain flow, two-card hire modal, and Playwright intro journey coverage.
