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
  const coolantFactor = Math.max(0.1, current.coolantLevelPercent / 100);
  const heatGen = (current.outputMw * 0.05 + extraHeatKPerSec) * dtSeconds;
  const tempDiff = current.tempKelvin - targetFloor;
  const heatDissipation = tempDiff * 0.06 * coolantFactor * dtSeconds;

  const nextTemp = Math.max(targetFloor, current.tempKelvin + heatGen - heatDissipation);
  const roundedTemp = Number(nextTemp.toFixed(2));

  return {
    ...current,
    tempKelvin: roundedTemp,
    status: calculateReactorStatus(roundedTemp),
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
