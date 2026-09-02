import type { HullTelemetry, ShieldTelemetry, SubsystemStatus } from '@kybernetes/protocol';

export function calculateHullStatus(integrity: number, stress: number): SubsystemStatus {
  if (integrity < 40 || stress >= 85) return 'critical';
  if (integrity < 75 || stress >= 50) return 'degraded';
  return 'nominal';
}

export function calculateShieldStatus(integrity: number): SubsystemStatus {
  if (integrity <= 20) return 'critical';
  if (integrity <= 65) return 'degraded';
  return 'nominal';
}

export function createInitialHull(): HullTelemetry {
  return {
    integrityPercent: 100,
    stressPercent: 5,
    breaches: [],
    status: 'nominal',
  };
}

export function createInitialShields(): ShieldTelemetry {
  return {
    integrityPercent: 100,
    chargeMw: 25,
    status: 'nominal',
  };
}

export function tickShields(
  shields: ShieldTelemetry,
  dtSeconds: number,
  reactorOutputMw: number = 45.5
): ShieldTelemetry {
  if (shields.integrityPercent >= 100 || reactorOutputMw < 10) {
    return shields;
  }
  const rechargeRate = 0.5 * dtSeconds;
  const nextIntegrity = Math.min(100, shields.integrityPercent + rechargeRate);
  const rounded = Number(nextIntegrity.toFixed(2));
  return {
    ...shields,
    integrityPercent: rounded,
    status: calculateShieldStatus(rounded),
  };
}

export function applyDamageToDefenses(
  shields: ShieldTelemetry,
  hull: HullTelemetry,
  rawDamage: number,
  targetRoomId?: string
): {
  nextShields: ShieldTelemetry;
  nextHull: HullTelemetry;
  absorbedByShields: number;
  dealtToHull: number;
  breachOccurred: boolean;
} {
  let absorbedByShields = 0;
  let dealtToHull = rawDamage;

  if (shields.integrityPercent > 0) {
    absorbedByShields = Math.min(shields.integrityPercent, rawDamage * 0.75);
    dealtToHull = rawDamage - absorbedByShields;
  }

  const nextShieldIntegrity = Math.max(0, shields.integrityPercent - absorbedByShields);
  const nextHullIntegrity = Math.max(0, hull.integrityPercent - dealtToHull);
  const nextStress = Math.min(100, hull.stressPercent + dealtToHull * 0.5);

  const breaches = [...hull.breaches];
  let breachOccurred = false;
  if (targetRoomId && (dealtToHull >= 15 || nextStress >= 75) && !breaches.includes(targetRoomId)) {
    breaches.push(targetRoomId);
    breachOccurred = true;
  }

  const roundedShields = Number(nextShieldIntegrity.toFixed(2));
  const roundedHull = Number(nextHullIntegrity.toFixed(2));
  const roundedStress = Number(nextStress.toFixed(2));

  return {
    nextShields: {
      ...shields,
      integrityPercent: roundedShields,
      status: calculateShieldStatus(roundedShields),
    },
    nextHull: {
      ...hull,
      integrityPercent: roundedHull,
      stressPercent: roundedStress,
      breaches,
      status: calculateHullStatus(roundedHull, roundedStress),
    },
    absorbedByShields: Number(absorbedByShields.toFixed(2)),
    dealtToHull: Number(dealtToHull.toFixed(2)),
    breachOccurred,
  };
}

export function repairHullPlating(
  hull: HullTelemetry,
  targetRoomId?: string
): { nextHull: HullTelemetry; patchedBreach: boolean } {
  let breaches = [...hull.breaches];
  let patchedBreach = false;

  if (targetRoomId && breaches.includes(targetRoomId)) {
    breaches = breaches.filter((b) => b !== targetRoomId);
    patchedBreach = true;
  } else if (breaches.length > 0) {
    breaches.pop();
    patchedBreach = true;
  }

  const nextIntegrity = Math.min(100, hull.integrityPercent + 15);
  const nextStress = Math.max(0, hull.stressPercent - 20);
  const roundedIntegrity = Number(nextIntegrity.toFixed(2));
  const roundedStress = Number(nextStress.toFixed(2));

  return {
    nextHull: {
      ...hull,
      integrityPercent: roundedIntegrity,
      stressPercent: roundedStress,
      breaches,
      status: calculateHullStatus(roundedIntegrity, roundedStress),
    },
    patchedBreach,
  };
}
