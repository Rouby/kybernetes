import type { PlayerVitals } from '@kybernetes/protocol';

export function createInitialPlayerVitals(): PlayerVitals {
  return {
    hunger: 100,
    thirst: 100,
    fatigue: 0,
    stamina: 100,
    maxStamina: 100,
    health: 100,
  };
}

export function updatePlayerVitals(
  vitals: PlayerVitals,
  dtSeconds: number,
  isSleeping: boolean,
  isOperating: boolean
): PlayerVitals {
  let hunger = vitals.hunger;
  let thirst = vitals.thirst;
  let fatigue = vitals.fatigue;
  let stamina = vitals.stamina;
  let health = vitals.health;

  if (isSleeping) {
    // Sleeping restores fatigue and stamina, slowly consumes hunger and thirst
    fatigue = Math.max(0, fatigue - dtSeconds * 5.0);
    stamina = Math.min(vitals.maxStamina, stamina + dtSeconds * 8.0);
    hunger = Math.max(0, hunger - dtSeconds * 0.05);
    thirst = Math.max(0, thirst - dtSeconds * 0.08);
  } else {
    // Awake consumption
    const drainMultiplier = isOperating ? 1.5 : 1.0;
    hunger = Math.max(0, hunger - dtSeconds * 0.1 * drainMultiplier);
    thirst = Math.max(0, thirst - dtSeconds * 0.2 * drainMultiplier);
    fatigue = Math.min(100, fatigue + dtSeconds * 0.15 * drainMultiplier);

    if (isOperating) {
      stamina = Math.max(0, stamina - dtSeconds * 2.0);
    } else {
      stamina = Math.min(vitals.maxStamina, stamina + dtSeconds * 1.0);
    }
  }

  // Starvation & Dehydration impacts max stamina and health
  const starvationPenalty = hunger < 20 ? 0.5 : 1.0;
  const dehydrationPenalty = thirst < 20 ? 0.5 : 1.0;
  const maxStamina = 100 * starvationPenalty * dehydrationPenalty;

  if (hunger === 0 || thirst === 0) {
    health = Math.max(0, health - dtSeconds * 0.5);
  }

  return {
    hunger,
    thirst,
    fatigue,
    stamina: Math.min(stamina, maxStamina),
    maxStamina,
    health,
  };
}
