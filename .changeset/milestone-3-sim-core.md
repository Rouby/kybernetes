---
"@kybernetes/sim-core": minor
---

### Core Simulation Dynamics for Reactor, Atmosphere, Hull & Naval Threats

- Implemented pure reactor thermal math in `src/systems/reactor.ts`: output MW generation, coolant-modulated heat dissipation, status thresholds, and emergency coolant venting.
- Implemented pure life support dynamics in `src/systems/lifeSupport.ts`: O2 consumption, scrubber recycling, scrubber degradation, and fire/breach atmospheric consumption.
- Implemented pure hull & kinetic shield mechanics in `src/systems/hull.ts`: 75% kinetic shield absorption, structural hull stress, breach generation, and emergency hull welding.
- Implemented naval threat resolution in `src/systems/navalCombat.ts`: incoming torpedoes, coronal radiation bursts, micrometeor storms, point-defense turret (PDT) interception rolls, and damage impact consequences.
- Integrated all subsystems into deterministic tick pipeline in `src/state.ts` and added 23 unit tests in `src/subsystems.test.ts`.
