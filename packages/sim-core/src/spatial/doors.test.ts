import type { DoorState } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { createInitialDoors, getWorldDoors, isStationSideDoor } from './doors.js';

function door(over: Partial<DoorState>): DoorState {
  return {
    id: 'test',
    name: 'test',
    x1: 100,
    y1: 200,
    x2: 140,
    y2: 200,
    isOpen: false,
    isAirlock: false,
    roomA: 'station.habitat',
    roomB: 'station.korridor_mitte',
    ...over,
  };
}

describe('framed doors', () => {
  it('classifies station doors on every hub frame', () => {
    expect(isStationSideDoor(door({}))).toBe(true);
    expect(isStationSideDoor(door({ roomA: 'hub_c.habitat', roomB: 'hub_c.korridor_mitte' }))).toBe(
      true
    );
    expect(isStationSideDoor(door({ roomA: 'ship.bruecke', roomB: 'ship.korridor_schiff' }))).toBe(
      false
    );
  });

  it('offsets hub doors to world space and leaves home untouched', () => {
    const home = door({});
    expect(getWorldDoors([home], { x: 9, y: 9 })[0]).toBe(home);
    const cinder = door({
      id: 'hub_c.habitat_korridor',
      roomA: 'hub_c.habitat',
      roomB: 'hub_c.korridor_mitte',
    });
    expect(getWorldDoors([cinder], { x: 9, y: 9 })[0]).toMatchObject({
      x1: 100,
      y1: 200,
      x2: 140,
      y2: 200,
    });
    const ship = door({ roomA: 'ship.bruecke', roomB: 'ship.korridor_schiff' });
    expect(getWorldDoors([ship], { x: 9, y: 9 })[0]).toMatchObject({ x1: 109, y1: 209 });
  });

  it('seeds doors for every hub frame', () => {
    const doors = createInitialDoors();
    const vesperMouth = doors.find((door) => door.id === 'hub_d.andock_tube_mund');
    expect(vesperMouth).toMatchObject({ roomA: 'hub_d.andock_tube', roomB: 'vacuum' });
    const vesperObs = doors.find((door) => door.id === 'hub_d.observatorium_kommando');
    expect(vesperObs).toMatchObject({ roomA: 'hub_d.observatorium', roomB: 'hub_d.kommando' });
    const cinderLab = doors.find((door) => door.id === 'hub_c.labor_korridor');
    expect(cinderLab).toMatchObject({ roomA: 'hub_c.labor', roomB: 'hub_c.korridor_mitte' });
    const ids = doors.map((door) => door.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
