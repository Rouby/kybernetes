import { describe, expect, it } from 'vitest';
import { GasType } from './constants';
import { Portal, PortalType } from './portal';
import { Room } from './room';
import {
  AtmosphereSimulation,
  dragForceFromWind,
  dragGasProperties,
  portalWindAt,
} from './simulation';

function createRoom(id: string, moles: number, temperatureK = 300, volume = 1) {
  return new Room(
    { id, x: 0, y: 0, width: volume, length: 1, height: 1 },
    {
      moles: {
        [GasType.Oxygen]: 0,
        [GasType.Nitrogen]: moles,
        [GasType.CarbonDioxide]: 0,
      },
      temperatureK,
    }
  );
}

function eastDoor(source: Room, target: Room | null, area = 1) {
  return new Portal({
    id: `${source.id}-door`,
    type: PortalType.Door,
    roomA: source,
    roomB: target,
    width: area,
    height: 1,
    openRatio: 1,
    side: 'east',
    position: 0.5,
  });
}

describe('dragGasProperties', () => {
  it('reports positive density and speed of sound for room air', () => {
    const { density, soundSpeed } = dragGasProperties(createRoom('r', 100));
    expect(density).toBeGreaterThan(0);
    expect(soundSpeed).toBeGreaterThan(100);
  });

  it('stays finite as the room approaches vacuum', () => {
    const { density, soundSpeed } = dragGasProperties(createRoom('r', 0));
    expect(Number.isFinite(density)).toBe(true);
    expect(Number.isFinite(soundSpeed)).toBe(true);
  });
});

describe('portalWindAt', () => {
  it('pulls outflow targets toward the portal', () => {
    const room = createRoom('r', 100);
    const portal = eastDoor(room, null);
    const { density, soundSpeed } = dragGasProperties(room);
    const wind = portalWindAt(
      { portal, molarRate: 1, isOutflow: true },
      { x: 0, y: 0 },
      room.averageMolarMass,
      density,
      soundSpeed
    );
    expect(wind.x).toBeGreaterThan(0);
  });

  it('pushes inflow targets away from the portal', () => {
    const room = createRoom('r', 100);
    const portal = eastDoor(room, null);
    const { density, soundSpeed } = dragGasProperties(room);
    const wind = portalWindAt(
      { portal, molarRate: 1, isOutflow: false },
      { x: 0, y: 0 },
      room.averageMolarMass,
      density,
      soundSpeed
    );
    expect(wind.x).toBeLessThan(0);
  });

  it('ignores stalled or sealed portals', () => {
    const room = createRoom('r', 100);
    const portal = eastDoor(room, null);
    const { density, soundSpeed } = dragGasProperties(room);
    expect(
      portalWindAt(
        { portal, molarRate: 0, isOutflow: true },
        { x: 0, y: 0 },
        room.averageMolarMass,
        density,
        soundSpeed
      )
    ).toEqual({ x: 0, y: 0 });
    portal.openRatio = 0;
    expect(
      portalWindAt(
        { portal, molarRate: 5, isOutflow: true },
        { x: 0, y: 0 },
        room.averageMolarMass,
        density,
        soundSpeed
      )
    ).toEqual({ x: 0, y: 0 });
  });

  it('caps throat velocity at local Mach 1', () => {
    const room = createRoom('r', 100);
    const portal = eastDoor(room, null);
    const { density, soundSpeed } = dragGasProperties(room);
    const wind = portalWindAt(
      { portal, molarRate: 1e9, isOutflow: true },
      { x: 0, y: 0 },
      room.averageMolarMass,
      density,
      soundSpeed
    );
    expect(Math.hypot(wind.x, wind.y)).toBeLessThanOrEqual(soundSpeed + 1e-9);
  });
});

describe('dragForceFromWind', () => {
  it('reports zero force in still air', () => {
    const { force, dynamicPressure } = dragForceFromWind(1.2, 1.1, 0.6, 0, 0);
    expect(force).toEqual({ x: 0, y: 0 });
    expect(dynamicPressure).toBe(0);
  });

  it('aligns force with the relative wind at 0.5·rho·v^2·Cd·A', () => {
    const { force, dynamicPressure } = dragForceFromWind(1.2, 1.0, 1.0, 3, 4);
    expect(dynamicPressure).toBeCloseTo(0.5 * 1.2 * 25, 10);
    expect(force.x).toBeCloseTo(dynamicPressure * 0.6, 10);
    expect(force.y).toBeCloseTo(dynamicPressure * 0.8, 10);
  });
});

describe('room drag end to end', () => {
  it('drags a vent-room entity toward the outflow portal', () => {
    const room = createRoom('r', 100);
    const sim = new AtmosphereSimulation();
    sim.addRoom(room);
    const portal = eastDoor(room, null);
    sim.addPortal(portal);
    const seen: { x: number; y: number }[] = [];
    sim.addEntity({
      room,
      position: { x: 0, y: 0 },
      projectedArea: 0.6,
      applyDrag: (drag) => seen.push({ ...drag.force }),
    });
    sim.step(0.01);
    expect(seen.length).toBeGreaterThan(0);
    const last = seen[seen.length - 1];
    expect(last).toBeDefined();
    expect(last?.x ?? 0).toBeGreaterThan(0);
  });
});
