import type { ReactorTelemetry, SubsystemStatus } from '@kybernetes/protocol';

export function calculateReactorStatus(tempKelvin: number): SubsystemStatus {
  if (tempKelvin >= 900) return 'critical';
  if (tempKelvin >= 600) return 'degraded';
  return 'nominal';
}

export function createInitialReactor(): ReactorTelemetry {
  return {
    tempKelvin: 320,
    maxTempKelvin: 1200,
    outputMw: 45.5,
    coolantLevelPercent: 100,
    status: 'nominal',
  };
}

export function tickReactor(
  current: ReactorTelemetry,
  dtSeconds: number,
  extraHeatKPerSec: number = 0
): ReactorTelemetry {
  const targetFloor = 300;
  // Slow coolant loss and thermal drift under operational load
  const coolantDrain = (current.tempKelvin > 450 ? 0.08 : 0.02) * dtSeconds;
  const nextCoolant = Math.max(10, current.coolantLevelPercent - coolantDrain);
  const coolantFactor = Math.max(0.1, nextCoolant / 100);

  // Moderate baseline heat generation drift (+0.5 K/s)
  const baselineDrift = 0.5;
  const heatGen = (current.outputMw * 0.05 + baselineDrift + extraHeatKPerSec) * dtSeconds;
  const tempDiff = current.tempKelvin - targetFloor;
  const heatDissipation = tempDiff * 0.055 * coolantFactor * dtSeconds;

  const nextTemp = Math.max(targetFloor, current.tempKelvin + heatGen - heatDissipation);
  const roundedTemp = Number(nextTemp.toFixed(2));
  const roundedCoolant = Number(nextCoolant.toFixed(2));

  return {
    ...current,
    tempKelvin: roundedTemp,
    coolantLevelPercent: roundedCoolant,
    status: calculateReactorStatus(roundedTemp),
  };
}

export function scrubPlasmaGrid(current: ReactorTelemetry): ReactorTelemetry {
  const tempDrop = Math.min(50, Math.max(10, current.tempKelvin - 310));
  const nextTemp = Math.max(300, Number((current.tempKelvin - tempDrop).toFixed(2)));
  return {
    ...current,
    tempKelvin: nextTemp,
    coolantLevelPercent: Math.min(100, current.coolantLevelPercent + 10),
    status: calculateReactorStatus(nextTemp),
  };
}

export function purgeReactorCoolant(current: ReactorTelemetry): ReactorTelemetry {
  const tempDrop = Math.min(75, Math.max(20, current.tempKelvin - 305));
  const nextTemp = Math.max(300, Number((current.tempKelvin - tempDrop).toFixed(2)));
  return {
    ...current,
    tempKelvin: nextTemp,
    coolantLevelPercent: 100,
    status: calculateReactorStatus(nextTemp),
  };
}

export function ventReactorCoolant(current: ReactorTelemetry): {
  nextReactor: ReactorTelemetry;
  success: boolean;
  tempDrop: number;
} {
  if (current.coolantLevelPercent < 15) {
    return { nextReactor: current, success: false, tempDrop: 0 };
  }

  const tempDrop = Math.min(150, Math.max(0, current.tempKelvin - 300));
  const nextTemp = Number((current.tempKelvin - tempDrop).toFixed(2));
  const nextCoolant = Math.max(0, current.coolantLevelPercent - 20);

  const nextReactor: ReactorTelemetry = {
    ...current,
    tempKelvin: nextTemp,
    coolantLevelPercent: nextCoolant,
    status: calculateReactorStatus(nextTemp),
  };

  return { nextReactor, success: true, tempDrop };
}

export function refillReactorCoolant(
  current: ReactorTelemetry,
  amountPercent: number = 25
): ReactorTelemetry {
  const nextCoolant = Math.min(100, current.coolantLevelPercent + amountPercent);
  return {
    ...current,
    coolantLevelPercent: nextCoolant,
  };
}
