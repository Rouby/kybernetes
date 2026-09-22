import type { DoorState } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { getWorldDoors, isStationSideDoor } from './doors.js';

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
      y1: 8200,
      x2: 140,
      y2: 8200,
    });
    const ship = door({ roomA: 'ship.bruecke', roomB: 'ship.korridor_schiff' });
    expect(getWorldDoors([ship], { x: 9, y: 9 })[0]).toMatchObject({ x1: 109, y1: 209 });
  });
});
