import type { PlayerVitals } from '@kybernetes/protocol';
import type { CellAtmosphere } from './spatial/atmosGrid';

export function createInitialPlayerVitals(): PlayerVitals {
  return {
    hunger: 100,
    thirst: 100,
    fatigue: 0,
    stamina: 100,
    maxStamina: 100,
    health: 100,
    suit: {
      isSealed: false,
      o2RemainingSeconds: 600,
      maxO2Seconds: 600,
      integrityPercent: 100,
      batteryPercent: 100,
    },
    incapacitated: {
      isIncapacitated: false,
      cause: 'hypoxia',
      bleedoutSecondsRemaining: 45,
    },
    bodyTempCelsius: 37.0,
    hypoxiaPercent: 0,
  };
}

export function toggleHelmet(vitals: PlayerVitals, sealed?: boolean): PlayerVitals {
  const nextSealed = sealed !== undefined ? sealed : !vitals.suit.isSealed;
  return {
    ...vitals,
    suit: {
      ...vitals.suit,
      isSealed: nextSealed,
    },
  };
}

export function refillSuitO2(vitals: PlayerVitals, amountSeconds = 600): PlayerVitals {
  return {
    ...vitals,
    suit: {
      ...vitals.suit,
      o2RemainingSeconds: Math.min(
        vitals.suit.maxO2Seconds,
        vitals.suit.o2RemainingSeconds + amountSeconds
      ),
    },
  };
}

export function patchSuitIntegrity(vitals: PlayerVitals): PlayerVitals {
  return {
    ...vitals,
    suit: {
      ...vitals.suit,
      integrityPercent: 100,
    },
  };
}

export function reviveCrew(vitals: PlayerVitals): PlayerVitals {
  return {
    ...vitals,
    health: Math.max(25, vitals.health),
    hypoxiaPercent: 0,
    incapacitated: {
      isIncapacitated: false,
      cause: 'hypoxia',
      bleedoutSecondsRemaining: 45,
    },
  };
}

function updateCaloricAndFatigue(
  vitals: PlayerVitals,
  dtSeconds: number,
  isSleeping: boolean,
  isOperating: boolean
): { hunger: number; thirst: number; fatigue: number; stamina: number; maxStamina: number } {
  let { hunger, thirst, fatigue, stamina } = vitals;

  if (isSleeping) {
    fatigue = Math.max(0, fatigue - dtSeconds * 5.0);
    stamina = Math.min(vitals.maxStamina, stamina + dtSeconds * 8.0);
    hunger = Math.max(0, hunger - dtSeconds * 0.05);
    thirst = Math.max(0, thirst - dtSeconds * 0.08);
  } else {
    const drainMultiplier = isOperating ? 1.5 : 1.0;
    hunger = Math.max(0, hunger - dtSeconds * 0.1 * drainMultiplier);
    thirst = Math.max(0, thirst - dtSeconds * 0.2 * drainMultiplier);
    fatigue = Math.min(100, fatigue + dtSeconds * 0.15 * drainMultiplier);
    stamina = isOperating
      ? Math.max(0, stamina - dtSeconds * 2.0)
      : Math.min(vitals.maxStamina, stamina + dtSeconds * 1.0);
  }

  const starvationPenalty = hunger < 20 ? 0.5 : 1.0;
  const dehydrationPenalty = thirst < 20 ? 0.5 : 1.0;
  const hypoxiaPenalty = vitals.hypoxiaPercent > 30 ? 1 - (vitals.hypoxiaPercent - 30) / 100 : 1.0;
  const maxStamina = Math.max(10, 100 * starvationPenalty * dehydrationPenalty * hypoxiaPenalty);

  return { hunger, thirst, fatigue, stamina: Math.min(stamina, maxStamina), maxStamina };
}

function updateRespiration(
  vitals: PlayerVitals,
  localAtmos: CellAtmosphere,
  dtSeconds: number,
  isOperating: boolean
): { suit: PlayerVitals['suit']; hypoxiaPercent: number; envHealthDrain: number } {
  const suit = { ...vitals.suit };
  let hypoxia = vitals.hypoxiaPercent;
  let envHealthDrain = 0;

  if (suit.isSealed) {
    // Sealed suit respiration
    const drain = dtSeconds * (isOperating ? 1.5 : 1.0);
    const leak = (100 - suit.integrityPercent) * 0.05 * dtSeconds;
    suit.o2RemainingSeconds = Math.max(0, suit.o2RemainingSeconds - drain - leak);

    if (suit.o2RemainingSeconds <= 0) {
      hypoxia = Math.min(100, hypoxia + dtSeconds * 15.0);
    } else {
      hypoxia = Math.max(0, hypoxia - dtSeconds * 20.0);
    }
  } else {
    // Ambient breathing keys on oxygen partial pressure (sea level ~21.2 kPa).
    // Low total pressure and oxygen-depleted mixes both drive hypoxia through pO2.
    const pO2kPa = localAtmos.pressureKpa * (localAtmos.o2Percent / 100);
    const isHypoxic = pO2kPa < 14.0;
    if (isHypoxic) {
      hypoxia = Math.min(100, hypoxia + dtSeconds * 25.0);
      if (localAtmos.pressureKpa < 20.0) {
        // Vacuum ebullism damage
        envHealthDrain += dtSeconds * 18.0;
      }
    } else {
      hypoxia = Math.max(0, hypoxia - dtSeconds * 25.0);
    }

    if (localAtmos.toxicSmokePercent > 15.0) {
      envHealthDrain += dtSeconds * (localAtmos.toxicSmokePercent * 0.1);
    }
  }

  if (hypoxia >= 100) {
    envHealthDrain += dtSeconds * 10.0;
  }

  return { suit, hypoxiaPercent: Number(hypoxia.toFixed(1)), envHealthDrain };
}

export const STATION_AMBIENT_ATMOS: CellAtmosphere = {
  pressureKpa: 101.3,
  o2Percent: 20.9,
  co2Ppm: 400,
  tempCelsius: 21.0,
  toxicSmokePercent: 0,
  velX: 0,
  velY: 0,
  roomId: 'station_lobby',
  condensationPlume: 0,
};

export const SPACE_VACUUM_ATMOS: CellAtmosphere = {
  pressureKpa: 0,
  o2Percent: 0,
  co2Ppm: 0,
  tempCelsius: -270.0,
  toxicSmokePercent: 0,
  velX: 0,
  velY: 0,
  roomId: null,
  condensationPlume: 0,
};

// fallow-ignore-next-line complexity
export function updatePlayerVitals(
  vitals: PlayerVitals,
  dtSeconds: number,
  isSleeping: boolean,
  isOperating: boolean,
  localAtmos?: CellAtmosphere
): PlayerVitals {
  const atmos: CellAtmosphere = localAtmos ?? STATION_AMBIENT_ATMOS;

  // If already incapacitated, tick bleedout
  if (vitals.incapacitated.isIncapacitated) {
    const nextBleedout = Math.max(0, vitals.incapacitated.bleedoutSecondsRemaining - dtSeconds);
    return {
      ...vitals,
      health: nextBleedout <= 0 ? 0 : vitals.health,
      incapacitated: {
        ...vitals.incapacitated,
        bleedoutSecondsRemaining: Number(nextBleedout.toFixed(1)),
      },
    };
  }

  const cal = updateCaloricAndFatigue(vitals, dtSeconds, isSleeping, isOperating);
  const resp = updateRespiration(vitals, atmos, dtSeconds, isOperating);

  let health = vitals.health;
  if (cal.hunger === 0 || cal.thirst === 0) health -= dtSeconds * 0.5;
  health = Math.max(0, health - resp.envHealthDrain);

  let incapacitated = vitals.incapacitated;
  if (health <= 0) {
    incapacitated = {
      isIncapacitated: true,
      cause: resp.hypoxiaPercent >= 90 ? 'hypoxia' : 'decompression',
      bleedoutSecondsRemaining: 45,
    };
    health = 1; // Stay at 1 HP during bleedout window
  }

  return {
    hunger: cal.hunger,
    thirst: cal.thirst,
    fatigue: cal.fatigue,
    stamina: cal.stamina,
    maxStamina: cal.maxStamina,
    health: Number(health.toFixed(1)),
    suit: resp.suit,
    incapacitated,
    bodyTempCelsius: vitals.bodyTempCelsius,
    hypoxiaPercent: resp.hypoxiaPercent,
  };
}
