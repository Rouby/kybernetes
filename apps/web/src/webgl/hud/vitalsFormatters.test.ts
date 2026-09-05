import type { PlayerVitals, RoomAtmosphereSummary } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import {
  formatAtmosphereStatus,
  formatIncapacitatedNotice,
  formatSuitStatus,
  STATION_ATMOS_SUMMARY,
  VACUUM_ATMOS_SUMMARY,
} from './vitalsFormatters';

function makeVitals(
  suit: Record<string, number | boolean>,
  incapacitated: Record<string, number | boolean | string> = { isIncapacitated: false }
): PlayerVitals {
  return { suit, incapacitated } as unknown as PlayerVitals;
}

function makeAtmos(overrides: Record<string, number | boolean | string>): RoomAtmosphereSummary {
  return {
    roomId: 'engineering',
    pressureKpa: 101,
    o2Percent: 21,
    co2Ppm: 400,
    tempCelsius: 21,
    toxicSmokePercent: 0,
    isVenting: false,
    isRepressurizing: false,
    activeFires: 0,
    activeBreaches: 0,
    ...overrides,
  } as unknown as RoomAtmosphereSummary;
}

describe('formatSuitStatus', () => {
  it('reports an open visor with amber label', () => {
    const status = formatSuitStatus(
      makeVitals({
        isSealed: false,
        o2RemainingSeconds: 600,
        maxO2Seconds: 600,
        integrityPercent: 100,
      })
    );
    expect(status.visorLabel).toBe('[H] VISOR: OPEN');
    expect(status.visorColor).toBe('#ffb000');
  });

  it('reports a sealed visor with cyan label', () => {
    const status = formatSuitStatus(
      makeVitals({
        isSealed: true,
        o2RemainingSeconds: 600,
        maxO2Seconds: 600,
        integrityPercent: 100,
      })
    );
    expect(status.visorLabel).toBe('[H] VISOR: SEALED');
    expect(status.visorColor).toBe('#00e5ff');
  });

  it('computes O2 percent and cyan bar at nominal levels', () => {
    const status = formatSuitStatus(
      makeVitals({
        isSealed: true,
        o2RemainingSeconds: 300,
        maxO2Seconds: 600,
        integrityPercent: 100,
      })
    );
    expect(status.o2Percent).toBe(50);
    expect(status.o2Text).toBe('SUIT O2: 300s / 600s');
    expect(status.o2BarColor).toEqual([0.0, 0.9, 1.0]);
  });

  it('flags low O2 reserves with a red bar', () => {
    const status = formatSuitStatus(
      makeVitals({
        isSealed: true,
        o2RemainingSeconds: 30,
        maxO2Seconds: 600,
        integrityPercent: 100,
      })
    );
    expect(status.o2BarColor).toEqual([1.0, 0.13, 0.27]);
  });

  it('flags a depleting tank with an amber bar before the critical threshold', () => {
    const status = formatSuitStatus(
      makeVitals({
        isSealed: true,
        o2RemainingSeconds: 120,
        maxO2Seconds: 600,
        integrityPercent: 100,
      })
    );
    expect(status.o2BarColor).toEqual([1.0, 0.69, 0.0]);
  });

  it('marks suit leaks in the integrity readout', () => {
    const intact = formatSuitStatus(
      makeVitals({
        isSealed: true,
        o2RemainingSeconds: 600,
        maxO2Seconds: 600,
        integrityPercent: 100,
      })
    );
    expect(intact.integrityText).toBe('INTEG: 100%');
    expect(intact.isLeaking).toBe(false);

    const leaking = formatSuitStatus(
      makeVitals({
        isSealed: true,
        o2RemainingSeconds: 600,
        maxO2Seconds: 600,
        integrityPercent: 72,
      })
    );
    expect(leaking.integrityText).toBe('INTEG: 72% [LEAK]');
    expect(leaking.isLeaking).toBe(true);
  });
});

describe('formatAtmosphereStatus', () => {
  it('falls back to nominal ambient text without data', () => {
    const status = formatAtmosphereStatus(undefined);
    expect(status.ambientText).toBe('AMB: 101.3 kPa • 20.9% O2 • 21°C');
    expect(status.hazardBanner).toBeNull();
    expect(status.isHazard).toBe(false);
  });

  it('flags venting compartments as a vacuum hazard', () => {
    const status = formatAtmosphereStatus(makeAtmos({ isVenting: true, pressureKpa: 5 }));
    expect(status.hazardBanner).toBe('VACUUM HAZARD');
    expect(status.isHazard).toBe(true);
  });

  it('flags depressurized compartments even before venting is flagged', () => {
    const status = formatAtmosphereStatus(makeAtmos({ pressureKpa: 10 }));
    expect(status.hazardBanner).toBe('VACUUM HAZARD');
    expect(status.isHazard).toBe(true);
  });

  it('flags hypoxia, toxic smoke, and temperature extremes', () => {
    expect(formatAtmosphereStatus(makeAtmos({ o2Percent: 10 })).hazardBanner).toBe(
      'HYPOXIA WARNING'
    );
    expect(formatAtmosphereStatus(makeAtmos({ toxicSmokePercent: 40 })).hazardBanner).toBe(
      'TOXIC SMOKE'
    );
    expect(formatAtmosphereStatus(makeAtmos({ tempCelsius: 80 })).hazardBanner).toBe(
      'EXTREME HEAT'
    );
    expect(formatAtmosphereStatus(makeAtmos({ tempCelsius: -10 })).hazardBanner).toBe(
      'FREEZING COLD'
    );
  });

  it('reports repressurization as non-hazard crew information', () => {
    const status = formatAtmosphereStatus(makeAtmos({ isRepressurizing: true, pressureKpa: 80 }));
    expect(status.hazardBanner).toBe('ECS REPRESSURIZING');
    expect(status.isHazard).toBe(false);
  });

  it('formats vacuum environment as hazardous space vacuum', () => {
    const status = formatAtmosphereStatus(VACUUM_ATMOS_SUMMARY);
    expect(status.ambientText).toBe('VACUUM // 0 kPa • 0% O2 • -270°C');
    expect(status.hazardBanner).toBe('VACUUM HAZARD');
    expect(status.isHazard).toBe(true);
  });

  it('formats station environment as nominal habitat atmosphere', () => {
    const status = formatAtmosphereStatus(STATION_ATMOS_SUMMARY);
    expect(status.ambientText).toBe('AMB: 101 kPa • 21% O2 • 21°C');
    expect(status.hazardBanner).toBeNull();
    expect(status.isHazard).toBe(false);
  });
});

describe('formatIncapacitatedNotice', () => {
  it('returns null for conscious crew', () => {
    expect(formatIncapacitatedNotice(makeVitals({}))).toBeNull();
  });

  it('renders a bleedout countdown for incapacitated crew', () => {
    const vitals = makeVitals(
      {},
      { isIncapacitated: true, cause: 'vacuum', bleedoutSecondsRemaining: 12.4 }
    );
    expect(formatIncapacitatedNotice(vitals)).toBe(
      'CRITICAL: INCAPACITATED (VACUUM) - BLEEDOUT: 12s'
    );
  });
});
