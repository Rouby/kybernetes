---
"@kybernetes/protocol": minor
"@kybernetes/sim-core": minor
"@kybernetes/server": minor
"@kybernetes/web": minor
---

### Milestone 4: Hostile Boarding Actions & 2D Tactical Deck Combat

![Kybernetes Milestone 4 Tactical Boarding Combat Viewport](https://raw.githubusercontent.com/Rouby/kybernetes/main/docs/images/milestone4_viewport.png)

- **Hostile Boarding Pod Breaches & 2D Intruder AI (`@kybernetes/sim-core`, `apps/server`)**:
  - Implemented `spawnBoardingEvent`: hostile pods drill through ship hull sections (Cargo Bay, Crew Quarters) and deploy armed raider squads (`Marauder Breacher`, `Marauder Infiltrator`).
  - Intruder AI pathfinding: raiders navigate deck corridors toward priority ship subsystems (Reactor Core in Engineering, Bridge Helm).
  - Sabotage countdown: arriving raiders initiate a 20-second sabotage sequence (`state: 'sabotaging'`). If not neutralized in time, shaped charges detonate inflicting 35% hull damage and severe reactor heat spikes.
- **Tactical Compartment Controls (`@kybernetes/protocol`, `apps/server`, `apps/web`)**:
  - **Bulkhead Lockdown**: Seal heavy blast doors (`[LOCK CARGO GATES]`, `[LOCK ENG GATES]`) to hold and trap intruders behind reinforced blast barriers with yellow/black hazard chevrons.
  - **Atmospheric Depressurization / Venting**: Vent oxygen into the space void (`[VENT CARGO O2]`), asphyxiating intruders lacking environmental suits for 15 HP/sec suffocation damage.
  - **Automated Sentry Turrets**: Deploy automated dual-barrel defense turrets (`[DEPLOY SENTRY (CARGO)]`) that track nearest intruders, rotate in real time, and fire kinetic bursts (25 dmg/sec) with animated muzzle flashes.
- **Close-Quarters Repel Combat**:
  - Direct player attack capability via click or `[F]` key (`ENGAGE_INTRUDER`).
  - Security Private / Marine recruit origin trait bonus applied (+25% combat efficiency).
  - Neutralizing intruders awards credits, clearance XP, and scrap salvage.
- **Canvas 2D Rendering Engine (`renderBoarding.ts`)**:
  - Rimworld-style raider capsule pawns in dark crimson combat armor (`#b71c1c`) with glowing red visors, directional hands, and floating overhead health/sabotage bars.
  - Boarding pod drill clamps on the hull with emergency red klaxon beacons and breach smoke.
  - Cyan decompression vacuum wind particle streams across vented compartments.
  - Swiveling sentry turrets with kinetic tracer bursts and muzzle flashes.
- **Tactical Security Defense HUD (`TelemetryRail.tsx`)**:
  - Live intruder threat roster, compartment lockdown controls, venting switches, sentry deployment buttons, and manual simulation trigger (`+ SIM BOARDING SQUAD`).
