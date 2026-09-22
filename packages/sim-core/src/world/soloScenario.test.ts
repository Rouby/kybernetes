import { describe, expect, it } from 'vitest';
import { createAirAuthority } from './airAuthority.js';
import { pawnWorldPos } from './dockCrossing.js';
import { dockWalkable } from './dockStatus.js';
import {
  bindWorldAir,
  buildSoloShipWorld,
  HARBOR_BEACON,
  HARBOR_SHIP,
  HARBOR_STATION,
  HUB_B_DOCK,
  HUB_B_ORIGIN,
  HUB_B_STATION,
} from './scenarios.js';
import { SHIP_ORIGIN, tickSchedule } from './schedule.js';
import { tickWorld } from './tickWorld.js';

describe('buildSoloShipWorld (M1 solo start)', () => {
  it('assembles station plus docked vessel with fixtures', () => {
    const world = buildSoloShipWorld();
    expect(world.vessels[HARBOR_SHIP]?.beacon).toBe(HARBOR_BEACON);
    expect(world.vessels[HARBOR_SHIP]?.schedule).toBe('docked');
    expect(world.stations[HARBOR_STATION]).toBeDefined();
    expect(world.docks.harbor).toBeDefined();
    expect(Object.keys(world.fixtures).length).toBeGreaterThan(0);
    expect(world.fixtures['ship.reactor_console']?.kind).toBe('reactor_console');
    expect(world.fixtures['ship.engine_console']?.kind).toBe('engine_console');
  });

  it('seeds zero pawns, bots, crew, offers, or transit records', () => {
    const world = buildSoloShipWorld();
    expect(Object.keys(world.pawns)).toEqual([]);
    expect(Object.keys(world.bots)).toEqual([]);
    expect(Object.keys(world.crew)).toEqual([]);
    expect(Object.keys(world.offers)).toEqual([]);
    expect(world.transit[HARBOR_SHIP]).toBeUndefined();
  });

  it('berths a second hub far south with its own dock', () => {
    const world = buildSoloShipWorld();
    expect(world.stations[HUB_B_STATION]?.origin).toEqual({ ...HUB_B_ORIGIN });
    expect(world.docks[HUB_B_DOCK.id]).toBeDefined();
    expect(HUB_B_DOCK.mouthWorld.y1).toBeGreaterThan(4000);
    expect(dockWalkable(world, HUB_B_DOCK.id)).toBe(false);
    expect(dockWalkable(world, 'harbor')).toBe(true);
    const local = { x: 100, y: 100 };
    const pos = pawnWorldPos(world, {
      id: 'p',
      owner: 'p',
      frameId: HUB_B_STATION,
      roomHint: `${HUB_B_STATION}.habitat`,
      pos: local,
      vel: { x: 0, y: 0 },
      facing: 0,
      radius: 12,
      speed: 200,
      health: { hp: 100, maxHp: 100, suitSealed: false, incapacitated: false },
      color: '#fff',
      say: '',
      sayUntilTick: 0,
    });
    expect(pos).toEqual({ x: 100, y: 4100 });
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

  it('binds and simulates air across all trade hub frames', () => {
    const world = buildSoloShipWorld();
    const auth = createAirAuthority();
    bindWorldAir(auth, world);
    const ticked = tickWorld(world, 0.05, [], auth);
    expect(ticked.atmos['station.habitat']?.pressureKpa).toBeCloseTo(101.3, 1);
    expect(ticked.atmos['hub_b.habitat']?.pressureKpa).toBeCloseTo(101.3, 1);
    expect(ticked.atmos['hub_c.labor']?.pressureKpa).toBeCloseTo(101.3, 1);
    expect(ticked.atmos['hub_d.observatorium']?.pressureKpa).toBeCloseTo(101.3, 1);
    expect(ticked.atmos['hub_d.andock_tube']?.pressureKpa).toBeCloseTo(101.3, 1);
  });
});
