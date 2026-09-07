import { describe, expect, it } from 'vitest';
import {
  type AtmosphereRecording,
  type ScheduledPortalEvent,
  SimulationRecorder,
} from '../../test-recorder/atmosphere-recorder';
import { AtmosphereSimulation, GasType, Portal, PortalType, Room } from '..';
import { R_GAS } from '../constants';
import type { PortalConfig } from '../portal';

const STANDARD_ATM = 101325; // 101.325 kPa

function createAir(
  volumeM3: number,
  { pressurePa = STANDARD_ATM, tempK = 293.15, oxygenFraction = 0.21 } = {}
) {
  const totalMoles = (pressurePa * volumeM3) / (R_GAS * tempK);
  return {
    moles: {
      [GasType.Oxygen]: totalMoles * oxygenFraction,
      [GasType.Nitrogen]: totalMoles * (0.99 - oxygenFraction),
      [GasType.CarbonDioxide]: totalMoles * 0.01,
    },
    temperatureK: tempK,
  };
}

function addDoor(
  sim: AtmosphereSimulation,
  roomA: Room,
  roomB: Room | null,
  options: Partial<Pick<PortalConfig, 'openRatio' | 'width' | 'height' | 'side'>> = {}
) {
  const portal = new Portal({
    id: `${roomA.id}-${roomB?.id ?? 'Space'}`,
    type: PortalType.Door,
    roomA,
    roomB,
    width: 2,
    height: 2,
    openRatio: 1,
    side: 'east',
    position: 0.5,
    ...options,
  });
  sim.addPortal(portal);
  return portal;
}

function recordScenario(
  sim: AtmosphereSimulation,
  title: string,
  {
    durationSeconds = 20,
    events = [],
  }: { durationSeconds?: number; events?: ScheduledPortalEvent[] } = {}
) {
  const recorder = new SimulationRecorder(sim);
  const dt = 0.01;
  recorder.runWithRecording(durationSeconds, dt, events);
  return recorder.getRecording(title, dt);
}

function addCompartment(sim: AtmosphereSimulation, id: string, x: number, y = 0) {
  const room = new Room({ id, x, y, width: 4, length: 3, height: 2.5 }, createAir(30));
  sim.addRoom(room);
  return room;
}

function frameAt(recording: AtmosphereRecording, time: number) {
  const frame = recording.frames.find((entry) => entry.time === time);
  if (!frame) throw new Error(`Missing frame at scheduled time ${time}`);
  return frame;
}

function expectSealedConservation(recording: AtmosphereRecording) {
  const totals = recording.frames.map((frame) => {
    const rooms = Object.values(frame.rooms);
    return {
      moles: rooms.reduce((sum, room) => sum + room.totalMoles, 0),
      thermalContent: rooms.reduce((sum, room) => sum + room.totalMoles * room.tempK, 0),
      oxygen: rooms.reduce((sum, room) => sum + (room.totalMoles * room.o2Pct) / 100, 0),
    };
  });
  for (const total of totals) {
    expect(total.moles).toBeCloseTo(totals[0].moles, 6);
    expect(total.thermalContent).toBeCloseTo(totals[0].thermalContent, 5);
    expect(total.oxygen).toBeCloseTo(totals[0].oxygen, 6);
  }
}

describe('Recorded Atmospheric Scenarios', () => {
  it('records catastrophic puncture and compartment cascade', ({ task }) => {
    const sim = new AtmosphereSimulation();

    // 1. Setup Rooms
    const bridge = new Room(
      { id: 'Bridge', x: 0, y: 0, width: 5, length: 4, height: 2.5 },
      createAir(50)
    );
    const corridor = new Room(
      { id: 'Corridor', x: 5, y: 1, width: 6, length: 2, height: 2.5 },
      createAir(30)
    );
    const airlock = new Room(
      { id: 'Airlock', x: 11, y: 0.5, width: 3, length: 3, height: 2.5 },
      createAir(22.5)
    );

    // 2. Setup Portals
    const doorBridge = new Portal({
      id: 'd_bridge',
      type: PortalType.Door,
      roomA: bridge,
      roomB: corridor,
      width: 2.0,
      height: 2.0,
      openRatio: 1.0,
      side: 'east',
      position: 0.5,
    });
    const doorAirlock = new Portal({
      id: 'd_airlock',
      type: PortalType.Door,
      roomA: corridor,
      roomB: airlock,
      width: 2.0,
      height: 2.0,
      openRatio: 0.005, // Cracked seal
      side: 'east',
      position: 0.5,
    });
    const puncture = new Portal({
      id: 'hull_breach',
      type: PortalType.Puncture,
      roomA: airlock,
      roomB: null, // Vent to space
      width: 0.5,
      height: 0.5,
      openRatio: 1,
      side: 'east',
      position: 0.2,
    });

    sim.addRoom(bridge);
    sim.addRoom(corridor);
    sim.addRoom(airlock);
    sim.addPortal(doorBridge);
    sim.addPortal(doorAirlock);
    sim.addPortal(puncture);

    // 3. Record simulation
    const recorder = new SimulationRecorder(sim);
    const dt = 0.05;
    recorder.runWithRecording(60.0, dt); // 60 seconds of simulated time

    // 4. Attach to Vitest Task Metadata
    task.meta.atmosphereRecordings = [
      recorder.getRecording('Catastrophic Hull Breach (Airlock -> Corridor -> Bridge)', dt),
    ];
  });

  it('records a large cabin repressurizing an empty airlock without overshoot', ({ task }) => {
    const sim = new AtmosphereSimulation();
    const cabin = new Room(
      { id: 'Cabin', x: 0, y: 0, width: 6, length: 4, height: 2.5 },
      createAir(60)
    );
    const airlock = new Room({ id: 'Airlock', x: 6, y: 1, width: 3, length: 2, height: 2.5 });
    sim.addRoom(cabin);
    sim.addRoom(airlock);
    addDoor(sim, cabin, airlock);

    // A sealed 4:1 volume pair: the empty airlock fills while cabin pressure falls.
    const recording = recordScenario(
      sim,
      'Empty Airlock Repressurization (60 m³ Cabin -> 15 m³ Airlock)'
    );
    task.meta.atmosphereRecordings = [recording];
    const equilibriumPa = (STANDARD_ATM * cabin.volume) / (cabin.volume + airlock.volume);
    let previousPressure = 0;
    for (const frame of recording.frames) {
      expect(frame.rooms.Airlock.pressurePa).toBeGreaterThanOrEqual(previousPressure - 1e-6);
      expect(frame.rooms.Airlock.pressurePa).toBeLessThanOrEqual(equilibriumPa + 1e-6);
      expect(frame.rooms.Cabin.pressurePa).toBeGreaterThanOrEqual(equilibriumPa - 1e-6);
      previousPressure = frame.rooms.Airlock.pressurePa;
    }
    expect(Math.abs(cabin.pressure - airlock.pressure)).toBeLessThan(0.1);
    expectSealedConservation(recording);
  });

  it('records hot oxygen-rich gas mixing through a cold low-pressure compartment chain', ({
    task,
  }) => {
    const sim = new AtmosphereSimulation();
    const hot = new Room(
      { id: 'Hot Supply', x: 0, y: 0, width: 4, length: 3, height: 2.5 },
      createAir(30, { pressurePa: 160000, tempK: 360, oxygenFraction: 0.8 })
    );
    const cabin = new Room(
      { id: 'Cabin', x: 4, y: 0, width: 4, length: 3, height: 2.5 },
      createAir(30, { pressurePa: 80000 })
    );
    const cold = new Room(
      { id: 'Cold Hold', x: 8, y: 0, width: 4, length: 3, height: 2.5 },
      createAir(30, { pressurePa: 20000, tempK: 240, oxygenFraction: 0.02 })
    );
    for (const room of [hot, cabin, cold]) sim.addRoom(room);
    addDoor(sim, hot, cabin);
    addDoor(sim, cabin, cold);

    // Watch pressure, O₂ fraction and temperature travel through the middle room.
    // This models pressure-driven mixing, not diffusion after pressures equalize.
    const recording = recordScenario(
      sim,
      'Hot / Cold Gas Mixing (O₂-rich Supply -> Cabin -> Cold Hold)'
    );
    task.meta.atmosphereRecordings = [recording];
    expect(cold.gas.temperatureK).toBeGreaterThan(240);
    expect(cold.gas.moles[GasType.Oxygen] / cold.totalMoles).toBeGreaterThan(0.02);
    expect(Math.abs(hot.pressure - cabin.pressure)).toBeLessThan(1);
    expect(Math.abs(cabin.pressure - cold.pressure)).toBeLessThan(1);
    for (const frame of recording.frames) {
      for (const room of Object.values(frame.rooms)) {
        expect(room.tempK).toBeGreaterThanOrEqual(240 - 1e-6);
        expect(room.tempK).toBeLessThanOrEqual(360 + 1e-6);
        expect(room.pressurePa).toBeGreaterThanOrEqual(20000 - 1e-6);
        expect(room.pressurePa).toBeLessThanOrEqual(160000 + 1e-6);
      }
    }
    expectSealedConservation(recording);
  });

  it('records sequential vacuum decompression after opening previously sealed doors', ({
    task,
  }) => {
    const sim = new AtmosphereSimulation();
    const habitat = addCompartment(sim, 'Habitat', 0);
    const corridor = addCompartment(sim, 'Corridor', 4);
    const airlock = addCompartment(sim, 'Airlock', 8);
    const habitatDoor = addDoor(sim, habitat, corridor, { openRatio: 0, width: 0.35 });
    const airlockDoor = addDoor(sim, corridor, airlock, { openRatio: 0, width: 0.35 });
    addDoor(sim, airlock, null, { width: 1 });

    const recording = recordScenario(
      sim,
      'Sequential Vacuum Cascade (Airlock -> Corridor -> Habitat)',
      {
        durationSeconds: 60,
        events: [
          {
            atSeconds: 10,
            portalId: airlockDoor.id,
            openRatio: 1,
            label: 'Airlock empty: open Corridor door',
          },
          {
            atSeconds: 30,
            portalId: habitatDoor.id,
            openRatio: 1,
            label: 'Corridor empty: open Habitat door',
          },
        ],
      }
    );
    task.meta.atmosphereRecordings = [recording];
    // Empty means below 1 Pa: the solver deliberately stops negligible flow near vacuum.
    const firstOpening = frameAt(recording, 10);
    expect(firstOpening.rooms.Airlock.pressurePa).toBeLessThan(1);
    expect(firstOpening.rooms.Corridor.pressurePa).toBeCloseTo(STANDARD_ATM, 5);
    const secondOpening = frameAt(recording, 30);
    expect(secondOpening.rooms.Corridor.pressurePa).toBeLessThan(1);
    expect(secondOpening.rooms.Habitat.pressurePa).toBeCloseTo(STANDARD_ATM, 5);
    for (const room of sim.rooms.values()) expect(room.pressure).toBeLessThan(1);
    for (const frame of recording.frames) {
      if (frame.time <= 10) expect(frame.rooms.Corridor.pressurePa).toBeCloseTo(STANDARD_ATM, 5);
      if (frame.time <= 30) expect(frame.rooms.Habitat.pressurePa).toBeCloseTo(STANDARD_ATM, 5);
    }
  });

  it('records emergency bulkhead isolation followed by controlled repressurization', ({ task }) => {
    const sim = new AtmosphereSimulation();
    const habitat = addCompartment(sim, 'Habitat', 0);
    const corridor = addCompartment(sim, 'Corridor', 4);
    const airlock = addCompartment(sim, 'Airlock', 8);
    const lab = addCompartment(sim, 'Lab', 4, 3);
    const habitatDoor = addDoor(sim, habitat, corridor, { width: 2 });
    addDoor(sim, corridor, airlock, { width: 2 });
    const labDoor = addDoor(sim, corridor, lab, { side: 'south', width: 2 });
    const outerDoor = addDoor(sim, airlock, null, { openRatio: 0, width: 1 });

    const recording = recordScenario(sim, 'Bulkhead Isolation & Controlled Repressurization', {
      durationSeconds: 35,
      events: [
        {
          atSeconds: 2,
          portalId: outerDoor.id,
          openRatio: 1,
          label: 'Outer airlock opens to vacuum',
        },
        {
          atSeconds: 2.2,
          portalId: habitatDoor.id,
          openRatio: 0,
          label: 'Emergency isolation: seal Habitat',
        },
        {
          atSeconds: 2.2,
          portalId: labDoor.id,
          openRatio: 0,
          label: 'Emergency isolation: seal Lab',
        },
        { atSeconds: 5, portalId: outerDoor.id, openRatio: 0, label: 'Seal the vacuum outlet' },
        {
          atSeconds: 6,
          portalId: habitatDoor.id,
          openRatio: 0.15,
          label: 'Crack Habitat door to refill empty compartments',
        },
        {
          atSeconds: 7,
          portalId: habitatDoor.id,
          openRatio: 1,
          label: 'Fully reopen Habitat door',
        },
        {
          atSeconds: 8,
          portalId: labDoor.id,
          openRatio: 0.25,
          label: 'Crack Lab door for equalization',
        },
        { atSeconds: 26, portalId: labDoor.id, openRatio: 1, label: 'Fully reopen Lab door' },
      ],
    });
    task.meta.atmosphereRecordings = [recording];
    const isolated = frameAt(recording, 2.2);
    expect(isolated.rooms.Habitat.pressurePa).toBeGreaterThan(1000);
    expect(isolated.rooms.Lab.pressurePa).toBeGreaterThan(1000);
    expect(frameAt(recording, 12).rooms.Airlock.pressurePa).toBeLessThan(1);
    for (const frame of recording.frames) {
      if (frame.time >= 3.5 && frame.time <= 14) {
        expect(frame.rooms.Habitat.pressurePa).toBe(isolated.rooms.Habitat.pressurePa);
      }
      if (frame.time >= 3.5 && frame.time <= 22) {
        expect(frame.rooms.Lab.pressurePa).toBe(isolated.rooms.Lab.pressurePa);
      }
    }
    // Repressurization redistributes saved gas, rather than creating a fresh atmosphere.
    const pressures = [...sim.rooms.values()].map((room) => room.pressure);
    expect(Math.max(...pressures) - Math.min(...pressures)).toBeLessThan(1);
    expect(airlock.pressure).toBeGreaterThan(1000);
    expectSealedConservation({
      ...recording,
      frames: recording.frames.filter((frame) => frame.time >= 12),
    });
  });

  it('simulates a big ship', ({ task }) => {
    const sim = new AtmosphereSimulation();
    const cabin1 = new Room(
      { id: 'Cabin1', x: 0, y: 0, width: 6, length: 4, height: 2.5 },
      createAir(60)
    );
    const cabin2 = new Room(
      { id: 'Cabin2', x: 6, y: 0, width: 6, length: 4, height: 2.5 },
      createAir(60)
    );
    const cabin3 = new Room(
      { id: 'Cabin3', x: 12, y: 0, width: 6, length: 4, height: 2.5 },
      createAir(60)
    );
    const cabin4 = new Room(
      { id: 'Cabin4', x: 18, y: 0, width: 6, length: 4, height: 2.5 },
      createAir(60)
    );
    const corridor1 = new Room(
      { id: 'Corridor1', x: 0, y: 4, width: 24, length: 2, height: 2.5 },
      createAir(120)
    );
    const cabin5 = new Room(
      { id: 'Cabin5', x: 0, y: 6, width: 4, length: 4, height: 2.5 },
      createAir(40)
    );
    const airlock = new Room(
      { id: 'Airlock', x: 4, y: 6, width: 4, length: 4, height: 2.5 },
      createAir(40)
    );
    const cabin6 = new Room(
      { id: 'Cabin6', x: 8, y: 6, width: 5, length: 4, height: 2.5 },
      createAir(50)
    );
    const cabin7 = new Room(
      { id: 'Cabin7', x: 13, y: 6, width: 5, length: 4, height: 2.5 },
      createAir(50)
    );
    const cabin8 = new Room(
      { id: 'Cabin8', x: 18, y: 6, width: 6, length: 4, height: 2.5 },
      createAir(60)
    );

    sim.addRoom(cabin1);
    sim.addRoom(cabin2);
    sim.addRoom(cabin3);
    sim.addRoom(cabin4);
    sim.addRoom(corridor1);
    sim.addRoom(cabin5);
    sim.addRoom(airlock);
    sim.addRoom(cabin6);
    sim.addRoom(cabin7);
    sim.addRoom(cabin8);

    addDoor(sim, cabin1, corridor1, { side: 'south' });
    addDoor(sim, cabin2, corridor1, { side: 'south' });
    addDoor(sim, cabin3, corridor1, { side: 'south' });
    addDoor(sim, cabin4, corridor1, { side: 'south' });
    addDoor(sim, cabin5, corridor1, { side: 'north' });
    addDoor(sim, airlock, corridor1, { side: 'north' });
    addDoor(sim, airlock, null, { side: 'south', openRatio: 1, width: 2 });
    addDoor(sim, cabin6, corridor1, { side: 'north' });
    addDoor(sim, cabin7, corridor1, { side: 'north' });
    addDoor(sim, cabin8, corridor1, { side: 'north' });

    const recording = recordScenario(sim, 'Big ship', {
      durationSeconds: 20,
    });
    task.meta.atmosphereRecordings = [recording];
  });
});
