/** @vitest-environment node */

import type { PlayerVitals, TelemetryDeltaBroadcast } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { assessSuffocation, heartbeatTempo, mapperTelemetrySnapshot } from './TelemetryAudioMapper';

function telemetry(over: Record<string, unknown> = {}): TelemetryDeltaBroadcast {
  return { tick: 1, ...over } as unknown as TelemetryDeltaBroadcast;
}

function vitals(over: Partial<PlayerVitals> = {}): PlayerVitals {
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
    incapacitated: { isIncapacitated: false, cause: 'hypoxia', bleedoutSecondsRemaining: 0 },
    bodyTempCelsius: 37,
    hypoxiaPercent: 0,
    ...over,
  } as unknown as PlayerVitals;
}

describe('mapperTelemetrySnapshot', () => {
  it('derives loads with legacy fallbacks', () => {
    const { snapshot, alertLevel } = mapperTelemetrySnapshot(
      telemetry({ reactorOutputMw: 40 }),
      undefined,
      'nominal'
    );
    expect(snapshot.reactorLoad).toBe(40);
    expect(snapshot.oxygen).toBe(100);
    expect(snapshot.hullPct).toBe(100);
    expect(snapshot.roomPressureKpa).toBe(101.3);
    expect(snapshot.venting).toBe(false);
    expect(alertLevel).toBe('nominal');
  });

  it('reports alert transitions once', () => {
    const first = mapperTelemetrySnapshot(telemetry({ alertLevel: 'red' }), undefined, 'nominal');
    expect(first.snapshot.alertChanged).toBe('red');
    expect(first.alertLevel).toBe('red');
    const repeat = mapperTelemetrySnapshot(telemetry({ alertLevel: 'red' }), undefined, 'red');
    expect(repeat.snapshot.alertChanged).toBeNull();
  });

  it('reads the current room atmosphere', () => {
    const { snapshot } = mapperTelemetrySnapshot(
      telemetry({ roomAtmospheres: { cabin: { pressureKpa: 20, isVenting: true } } }),
      'cabin',
      'nominal'
    );
    expect(snapshot.roomPressureKpa).toBe(20);
    expect(snapshot.venting).toBe(true);
  });
});

describe('assessSuffocation', () => {
  it('stays quiet when healthy', () => {
    expect(assessSuffocation(vitals(), 100, 101.3)).toBeNull();
  });

  it('grades hypoxia severity with faster breaths when critical', () => {
    const mild = assessSuffocation(vitals({ hypoxiaPercent: 40 }), 100, 101.3);
    expect(mild?.breathIntervalMs).toBe(1400);
    const critical = assessSuffocation(vitals({ hypoxiaPercent: 80 }), 100, 101.3);
    expect(critical?.breathIntervalMs).toBe(900);
    expect(critical?.severityRatio ?? 0).toBeGreaterThan(mild?.severityRatio ?? 1);
  });

  it('flags unsealed vacuum exposure', () => {
    expect(assessSuffocation(vitals(), 100, 10)).not.toBeNull();
  });
});

describe('heartbeatTempo', () => {
  it('stays quiet when rested and healthy', () => {
    expect(heartbeatTempo(vitals())).toBeNull();
  });

  it('races when critical', () => {
    expect(heartbeatTempo(vitals({ health: 20 }))).toEqual({ bpm: 120, intervalMs: 500 });
    expect(heartbeatTempo(vitals({ fatigue: 80 }))?.bpm).toBe(90);
  });
});
