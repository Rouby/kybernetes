import { describe, expect, it } from 'vitest';
import { SimulationRecorder } from '../../test-recorder/atmosphere-recorder';
import { GasType, R_GAS } from '../constants';
import { Portal, PortalType } from '../portal';
import { Room } from '../room';
import { AtmosphereSimulation } from '../simulation';

const STANDARD_ATM = 101325;

function air(volumeM3: number) {
  const total = (STANDARD_ATM * volumeM3) / (R_GAS * 293.15);
  return {
    moles: {
      [GasType.Oxygen]: total * 0.21,
      [GasType.Nitrogen]: total * 0.78,
      [GasType.CarbonDioxide]: total * 0.01,
    },
    temperatureK: 293.15,
  };
}

function addDoor(
  sim: AtmosphereSimulation,
  id: string,
  a: Room,
  b: Room | null,
  openRatio: number
) {
  const portal = new Portal({
    id,
    type: PortalType.Door,
    roomA: a,
    roomB: b,
    width: 2,
    height: 2,
    openRatio,
    side: 'east',
    position: 0.5,
  });
  sim.addPortal(portal);
  return portal;
}

function windSpeed(
  frame: { entities: Record<string, { windXMps: number; windYMps: number }> },
  id: string
) {
  const e = frame.entities[id];
  return Math.hypot(e.windXMps, e.windYMps);
}

describe('Wind probe recording', () => {
  it('captures solver wind at probes and renders them in frames', ({ task }) => {
    const sim = new AtmosphereSimulation();
    const vol = 5 * 4 * 2.5;
    const roomA = new Room({ id: 'A', x: 0, y: 0, width: 5, length: 4, height: 2.5 }, air(vol));
    const roomB = new Room({ id: 'B', x: 5, y: 0, width: 5, length: 4, height: 2.5 }, air(vol));
    const roomC = new Room({ id: 'C', x: 10, y: 0, width: 5, length: 4, height: 2.5 }, air(vol));
    for (const room of [roomA, roomB, roomC]) sim.addRoom(room);
    addDoor(sim, 'd_ab', roomA, roomB, 1);
    addDoor(sim, 'd_bc', roomB, roomC, 1);
    const puncture = new Portal({
      id: 'breach_c',
      type: PortalType.Puncture,
      roomA: roomC,
      roomB: null,
      width: 1,
      height: 1,
      openRatio: 1,
      side: 'east',
      position: 0.5,
    });
    sim.addPortal(puncture);

    const recorder = new SimulationRecorder(sim);
    expect(recorder.addProbe('p_near', 'C', 14, 2)).toBe(true);
    expect(recorder.addProbe('p_far', 'A', 1, 2)).toBe(true);
    expect(recorder.addProbe('p_ghost', 'missing', 0, 0)).toBe(false);
    recorder.refreshLayout();
    recorder.runWithRecording(10, 0.05);

    const recording = recorder.getRecording(
      'Probe wind: near vent vs far room (A-B-C chain)',
      0.05
    );
    task.meta.atmosphereRecordings = [recording];

    expect(recording.frames.length).toBeGreaterThan(10);
    for (const frame of recording.frames) {
      expect(Object.keys(frame.entities).sort()).toEqual(['p_far', 'p_near']);
    }
    let maxNear = 0;
    let maxFar = 0;
    for (const frame of recording.frames) {
      maxNear = Math.max(maxNear, windSpeed(frame, 'p_near'));
      maxFar = Math.max(maxFar, windSpeed(frame, 'p_far'));
    }
    expect(maxNear).toBeGreaterThan(1);
    expect(maxNear).toBeGreaterThan(maxFar);
  });

  it('records still air in a sealed hull', ({ task }) => {
    const sim = new AtmosphereSimulation();
    const vol = 4 * 3 * 2.5;
    const room = new Room({ id: 'sealed', x: 0, y: 0, width: 4, length: 3, height: 2.5 }, air(vol));
    sim.addRoom(room);
    const recorder = new SimulationRecorder(sim);
    expect(recorder.addProbe('p_still', 'sealed', 2, 1.5)).toBe(true);
    recorder.runWithRecording(2, 0.05);
    task.meta.atmosphereRecordings = [
      ...(task.meta.atmosphereRecordings ?? []),
      recorder.getRecording('Probe wind: sealed room stays still', 0.05),
    ];
    const frames = recorder.getRecording('x', 0.05).frames;
    const last = frames[frames.length - 1];
    expect(windSpeed(last, 'p_still')).toBeCloseTo(0, 6);
  });
});
