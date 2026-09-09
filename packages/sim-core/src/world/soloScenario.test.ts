import { describe, expect, it } from 'vitest';
import { dockWalkable } from './dockStatus.js';
import { buildSoloShipWorld, HARBOR_BEACON, HARBOR_SHIP, HARBOR_STATION } from './scenarios.js';
import { SHIP_ORIGIN, tickSchedule } from './schedule.js';

describe('buildSoloShipWorld (M1 solo start)', () => {
  it('assembles station plus docked vessel with fixtures', () => {
    const world = buildSoloShipWorld();
    expect(world.vessels[HARBOR_SHIP]?.beacon).toBe(HARBOR_BEACON);
    expect(world.vessels[HARBOR_SHIP]?.schedule).toBe('docked');
    expect(world.stations[HARBOR_STATION]).toBeDefined();
    expect(world.docks.harbor).toBeDefined();
    expect(Object.keys(world.fixtures).length).toBeGreaterThan(0);
  });

  it('seeds zero pawns, bots, crew, offers, or transit records', () => {
    const world = buildSoloShipWorld();
    expect(Object.keys(world.pawns)).toEqual([]);
    expect(Object.keys(world.bots)).toEqual([]);
    expect(Object.keys(world.crew)).toEqual([]);
    expect(Object.keys(world.offers)).toEqual([]);
    expect(world.transit[HARBOR_SHIP]).toBeUndefined();
  });

  it('never auto-departs: the ship holds docked station-keeping', () => {
    let world = buildSoloShipWorld();
    for (let second = 0; second < 120; second += 1) {
      world = tickSchedule(world, 1);
    }
    expect(world.vessels[HARBOR_SHIP]?.schedule).toBe('docked');
    expect(world.vessels[HARBOR_SHIP]?.origin).toEqual({ ...SHIP_ORIGIN });
    expect(dockWalkable(world, 'harbor')).toBe(true);
  });
});
