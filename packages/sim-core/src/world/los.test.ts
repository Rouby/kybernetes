import { describe, expect, it } from 'vitest';
import { assembleWorld, spawnPawn } from './assemble.js';
import { HesperiaV2Spec } from './content/HesperiaV2.hull.js';
import { StationHubSpec } from './content/StationHub.hull.js';
import { tryToggleDoor } from './doors.js';
import { hasLineOfSight, sightBlockers, unionRooms, visibleRooms } from './los.js';
import { tickWorld } from './tickWorld.js';
import type { World } from './types.js';

function shipWorld(): World {
  const assembled = assembleWorld([
    { frameId: 'ship', hull: HesperiaV2Spec, vessel: { name: 'Hesperia', beacon: 'HESP' } },
  ]);
  return spawnPawn(assembled, {
    id: 'p1',
    owner: 'u1',
    frameId: 'ship',
    roomId: 'ship.corridor',
    x: 480,
    y: 360,
    color: '#fff',
  });
}

describe('world line of sight', () => {
  it('sees across open space and stops at walls', () => {
    const wall = [{ x1: 0, y1: 0, x2: 0, y2: 100 }];
    expect(hasLineOfSight([], { x: -10, y: 50 }, { x: 10, y: 50 })).toBe(true);
    expect(hasLineOfSight(wall, { x: -10, y: 50 }, { x: 10, y: 50 })).toBe(false);
    expect(hasLineOfSight(wall, { x: -10, y: 50 }, { x: -20, y: 60 })).toBe(true);
  });

  it('sees through window panes but not shut doors', () => {
    const world = assembleWorld([{ frameId: 'station', hull: StationHubSpec }]);
    const blockers = sightBlockers(world, 'station');
    const pane = blockers.filter(
      (blocker) => blocker.x1 === 100 && blocker.x2 === 500 && blocker.y1 === 0
    );
    expect(pane).toHaveLength(0);
    expect(hasLineOfSight(blockers, { x: 300, y: 40 }, { x: 300, y: -40 })).toBe(true);
    expect(hasLineOfSight(blockers, { x: 300, y: 200 }, { x: 700, y: 200 })).toBe(false);
  });
});

describe('world room visibility', () => {
  it('reveals neighbors through open doors only', () => {
    const world = shipWorld();
    expect(visibleRooms(world, 'p1')).toEqual(['ship.corridor']);
    const toggled = tryToggleDoor(world, 'ship.door_cargo', true, 0);
    if (!toggled.ok) throw new Error('door toggle failed');
    const opened: World = {
      ...world,
      portals: { ...world.portals, [toggled.portal.id]: toggled.portal },
    };
    expect(visibleRooms(opened, 'p1').sort()).toEqual(['ship.cargo', 'ship.corridor']);
  });

  it('sees through interior windows without connecting rooms', () => {
    const world = shipWorld();
    expect(visibleRooms(world, 'ghost')).toEqual([]);
    expect(unionRooms(['a'], ['b', 'a'])).toEqual(['a', 'b']);
  });

  it('remembers explored rooms after doors close', () => {
    const world = shipWorld();
    const toggled = tryToggleDoor(world, 'ship.door_cargo', true, 0);
    if (!toggled.ok) throw new Error('door toggle failed');
    const opened: World = {
      ...world,
      portals: { ...world.portals, [toggled.portal.id]: toggled.portal },
    };
    const explored = tickWorld(opened, 1 / 20, []);
    expect(explored.memory.p1).toContain('ship.cargo');
    const shut: World = {
      ...explored,
      portals: {
        ...explored.portals,
        [toggled.portal.id]: { ...toggled.portal, state: 'closed' as const },
      },
    };
    const later = tickWorld(shut, 1 / 20, []);
    expect(visibleRooms(later, 'p1')).toEqual(['ship.corridor']);
    expect(later.memory.p1).toContain('ship.cargo');
  });
});
