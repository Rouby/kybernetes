import type { LifeSupportTelemetry, SubsystemStatus } from '@kybernetes/protocol';

export function calculateLifeSupportStatus(o2Percent: number): SubsystemStatus {
  if (o2Percent < 70) return 'critical';
  if (o2Percent < 90) return 'degraded';
  return 'nominal';
}

export function createInitialLifeSupport(): LifeSupportTelemetry {
  return {
    o2LevelPercent: 99.4,
    co2LevelPercent: 0.04,
    scrubberEfficiencyPercent: 100,
    status: 'nominal',
  };
}

export function tickLifeSupport(
  current: LifeSupportTelemetry,
  dtSeconds: number,
  breachCount: number = 0,
  fireCount: number = 0
): LifeSupportTelemetry {
  const baseConsumption = 0.01 * dtSeconds;
  const breachDrain = breachCount * 0.15 * dtSeconds;
  const fireConsumption = fireCount * 0.04 * dtSeconds;
  const totalDrain = baseConsumption + breachDrain + fireConsumption;

  // Replenishment from operational scrubbers
  const efficiency = current.scrubberEfficiencyPercent / 100;
  const replenishment = 0.008 * efficiency * dtSeconds;

  const nextO2 = Math.min(100, Math.max(0, current.o2LevelPercent - totalDrain + replenishment));
  const roundedO2 = Number(nextO2.toFixed(2));

  // Slow scrubber wear (or steady state)
  const nextEfficiency = Math.max(10, current.scrubberEfficiencyPercent - 0.001 * dtSeconds);

  return {
    ...current,
    o2LevelPercent: roundedO2,
    scrubberEfficiencyPercent: Number(nextEfficiency.toFixed(2)),
    status: calculateLifeSupportStatus(roundedO2),
  };
}

export function calibrateScrubbers(current: LifeSupportTelemetry): LifeSupportTelemetry {
  return {
    ...current,
    scrubberEfficiencyPercent: 100,
  };
}
