import { SimulationRecorder } from '@kybernetes/air-sim/test-recorder/atmosphere-recorder';
import { describe, expect, it } from 'vitest';
import { createInitialDoors, toggleDoor } from './doors';
import {
  addWindProbe,
  createHullAir,
  doorsForHull,
  syncBreachPortals,
  syncDoorsToSim,
  tickShipAir,
  windProbeReading,
} from './shipAtmosphere';

const PX_TO_M = 0.05;

function probeWind(
  frame: { entities: Record<string, { windXMps: number; windYMps: number }> },
  id: string
): number {
  const e = frame.entities[id];
  return Math.hypot(e.windXMps, e.windYMps);
}

describe('hull air wind debug recording', () => {
  it('records solver wind probes around a venting engineering breach', ({ task }) => {
    let doors = toggleDoor(createInitialDoors(), 'airlock_eng', true);
    doors = doorsForHull(doors, 'hesperia');
    const air = createHullAir('hesperia', doors);
    syncDoorsToSim(air, doors);
    syncBreachPortals(air, ['cargo']);

    const recorder = new SimulationRecorder(air.sim);
    expect(recorder.addProbe('eng_near_vent', 'engineering', 1000 * PX_TO_M, 500 * PX_TO_M)).toBe(
      true
    );
    expect(recorder.addProbe('bridge_far', 'bridge', 220 * PX_TO_M, 298 * PX_TO_M)).toBe(true);
    expect(recorder.addProbe('corridor_mid', 'corridor_mid', 600 * PX_TO_M, 400 * PX_TO_M)).toBe(
      true
    );
    recorder.refreshLayout();
    recorder.runWithRecording(20, 0.05);

    const recording = recorder.getRecording(
      'Hesperia debug: probes near engineering vent vs bridge (breach cargo)',
      0.05
    );
    task.meta.atmosphereRecordings = [recording];

    expect(recording.frames.length).toBeGreaterThan(50);
    for (const frame of recording.frames) {
      expect(Object.keys(frame.entities).sort()).toEqual([
        'bridge_far',
        'corridor_mid',
        'eng_near_vent',
      ]);
    }
    let maxNear = 0;
    let maxFar = 0;
    for (const frame of recording.frames) {
      maxNear = Math.max(maxNear, probeWind(frame, 'eng_near_vent'));
      maxFar = Math.max(maxFar, probeWind(frame, 'bridge_far'));
    }
    expect(maxNear).toBeGreaterThan(1);
    expect(maxNear).toBeGreaterThan(maxFar);
  });

  it('exposes live probe readings through the hull tick', () => {
    const doors = toggleDoor(createInitialDoors(), 'airlock_eng', true);
    const air = createHullAir('hesperia', doors);
    expect(addWindProbe(air, 'eng_probe', 1000, 500)).toBe(true);
    expect(addWindProbe(air, 'eng_probe', 1000, 500)).toBe(false);
    expect(addWindProbe(air, 'void_probe', 10, 10)).toBe(false);
    tickShipAir(air, doors, [], [], 0.1);
    const reading = windProbeReading(air, 'eng_probe');
    expect(reading?.roomId).toBe('engineering');
    expect(Math.hypot(reading?.windXMps ?? 0, reading?.windYMps ?? 0)).toBeGreaterThan(0);
    expect(windProbeReading(air, 'missing')).toBeNull();
  });
});
