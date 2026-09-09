import { describe, expect, it } from 'vitest';
import { dockPhaseOf, dockStatusOf, dockWalkable } from './dockStatus.js';
import { buildHarborWorld } from './scenarios.js';

describe('physical dock status', () => {
  it('is walkable while docked with unsealed gates', () => {
    const world = buildHarborWorld();
    expect(dockPhaseOf(world, 'ship')).toBe('docked');
    expect(dockWalkable(world, 'harbor')).toBe(true);
    const status = dockStatusOf(world, 'harbor', 1000);
    expect(status?.walkable).toBe(true);
    expect(status?.stationGate).toBe('station.korridor_ost_andock');
    expect(status?.tubeGate).toBe('station.andock_tube_mund');
    expect(status?.vesselGate).toBe('ship.schiff_mund');
    expect(status?.tubeRoom).toBe('station.andock_tube');
    expect(status?.mouthWorld).toEqual({ x1: 1210, y1: 240, x2: 1210, y2: 280 });
  });

  it('enters boarding_closing inside the final 5s docked', () => {
    let world = buildHarborWorld();
    const transit = world.transit.ship;
    if (transit === undefined) throw new Error('missing transit');
    world = {
      ...world,
      transit: { ...world.transit, ship: { ...transit, timerS: 3 } },
    };
    expect(dockPhaseOf(world, 'ship')).toBe('boarding_closing');
    expect(dockStatusOf(world, 'harbor', 1000)?.secondsToSeal).toBeCloseTo(3, 5);
  });

  it('is not walkable once departing', () => {
    let world = buildHarborWorld();
    const vessel = world.vessels.ship;
    if (vessel === undefined) throw new Error('missing vessel');
    world = {
      ...world,
      vessels: { ...world.vessels, ship: { ...vessel, schedule: 'departing' } },
    };
    expect(dockWalkable(world, 'harbor')).toBe(false);
    expect(dockStatusOf(world, 'harbor', 1000)?.walkable).toBe(false);
  });
});
