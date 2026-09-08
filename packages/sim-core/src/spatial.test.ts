import type { StartingRole } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import {
  closestPointOnSegment,
  distanceToSegment,
  findNearestStation,
  resolvePawnMovement,
  resolveWallCollision,
} from './spatial/collision';
import {
  createDefaultDeck,
  HESPERIA_LIGHTS,
  HESPERIA_ROOMS,
  HESPERIA_SPAWNS,
  HESPERIA_WALLS,
  ROOM_AMBIENTS,
} from './spatial/deck';
import { createInitialDoors, findNearestDoor, toggleDoor } from './spatial/doors';
import {
  computeVisibilityPolygon,
  getOpaqueWallSegments,
  isImpactVisible,
  isPointInFlashlightCone,
} from './spatial/visibility';

describe('Deck Layout & Geometry', () => {
  it('initializes default CSS Hesperia deck layout', () => {
    const deck = createDefaultDeck();
    expect(deck.width).toBe(2400);
    expect(deck.height).toBe(800);
    expect(deck.walls.length).toBeGreaterThan(15);
    expect(deck.stations).toEqual([]);
    expect(HESPERIA_ROOMS.length).toBe(12);
  });

  it('defines valid spawn points for all 5 starting roles', () => {
    const roles: StartingRole[] = [
      'wiper',
      'galley_hand',
      'security_private',
      'hydro_tender',
      'stevedore',
    ];
    expect(roles).toHaveLength(5);

    for (const role of roles) {
      const spawn = HESPERIA_SPAWNS[role];
      expect(spawn).toBeDefined();
      expect(spawn.x).toBeGreaterThan(0);
      expect(spawn.x).toBeLessThan(2400);
      expect(spawn.y).toBeGreaterThan(0);
      expect(spawn.y).toBeLessThan(800);
    }
  });
});

describe('Spatial Collision & Sliding Math', () => {
  it('computes closest point on segment accurately', () => {
    const a = { x: 100, y: 100 };
    const b = { x: 300, y: 100 };

    // Point perpendicular to segment midpoint
    const closest1 = closestPointOnSegment({ x: 200, y: 150 }, a, b);
    expect(closest1).toEqual({ x: 200, y: 100 });

    // Point before segment start (clamped to A)
    const closest2 = closestPointOnSegment({ x: 50, y: 150 }, a, b);
    expect(closest2).toEqual({ x: 100, y: 100 });

    // Point after segment end (clamped to B)
    const closest3 = closestPointOnSegment({ x: 350, y: 50 }, a, b);
    expect(closest3).toEqual({ x: 300, y: 100 });
  });

  it('calculates distance to segment', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };
    expect(distanceToSegment({ x: 50, y: 20 }, a, b)).toBeCloseTo(20);
    expect(distanceToSegment({ x: 120, y: 0 }, a, b)).toBeCloseTo(20);
  });

  it('resolves wall collision by projecting circle outward along normal', () => {
    const wall = {
      id: 'w1',
      x1: 100,
      y1: 100,
      x2: 300,
      y2: 100,
      isOpaque: true,
      isTraversable: false,
    };
    const radius = 16;

    // Pawn penetrates wall from below (y = 110, distance is 10 < 16)
    const res = resolveWallCollision({ x: 200, y: 110 }, radius, wall);
    expect(res.collided).toBe(true);
    expect(res.resolved.y).toBeCloseTo(116, 1);

    // Pawn far from wall
    const freeRes = resolveWallCollision({ x: 200, y: 200 }, radius, wall);
    expect(freeRes.collided).toBe(false);
    expect(freeRes.resolved.y).toBe(200);
  });

  it('slides pawn along wall when moving diagonally into it', () => {
    const wall = {
      id: 'w1',
      x1: 100,
      y1: 100,
      x2: 300,
      y2: 100,
      isOpaque: true,
      isTraversable: false,
    };
    const radius = 14;

    // Pawn at (150, 120) tries to move diagonally into wall at (170, 105)
    const movement = resolvePawnMovement(150, 120, 170, 105, radius, [wall]);
    expect(movement.collided).toBe(true);
    // X progress is preserved (sliding along wall)
    expect(movement.x).toBe(170);
    // Y position is pushed outside wall
    expect(movement.y).toBeGreaterThanOrEqual(114);
  });

  it('detects nearest interactive station within range and filters by facing angle', () => {
    // Fixture console at (890, 510); the finder math is data-agnostic.
    const stations = [
      {
        id: 'reactor_primary_console',
        deckId: 'deck_d',
        name: 'Reactor Console',
        stationType: 'reactor',
        x: 890,
        y: 510,
        radius: 28,
        prompt: '[E] Access Reactor Console',
      },
    ];
    // Reactor console is at (890, 510)
    const nearby = findNearestStation(870, 510, stations, 50);
    expect(nearby).not.toBeNull();
    expect(nearby?.station.id).toBe('reactor_primary_console');

    // Facing console directly (facing +X, angle = 0): returns station
    const facingConsole = findNearestStation(870, 510, stations, 50, 0);
    expect(facingConsole?.station.id).toBe('reactor_primary_console');

    // Looking away from console (facing -X, angle = Math.PI): returns null
    const facingAway = findNearestStation(870, 510, stations, 50, Math.PI);
    expect(facingAway).toBeNull();

    // Looking perpendicular (facing +Y, angle = Math.PI / 2): returns null
    const facingPerpendicular = findNearestStation(870, 510, stations, 50, Math.PI / 2);
    expect(facingPerpendicular).toBeNull();

    // Far from all stations: central corridor forward at (150, 400)
    const far = findNearestStation(150, 400, stations, 30);
    expect(far).toBeNull();
  });

  it('detects nearest door within range and filters by facing angle', () => {
    const doors = createInitialDoors();
    // ship.door_bridge is at world x: 1560..1600, y: 320
    // Pawn at (1580, 355) in the corridor just south of the door
    const nearWithoutAngle = findNearestDoor(1580, 355, doors, 42);
    expect(nearWithoutAngle?.door.id).toBe('ship.door_bridge');

    // Looking North directly at the door (angle = -Math.PI / 2): returns door
    const facingDoor = findNearestDoor(1580, 355, doors, 42, -Math.PI / 2);
    expect(facingDoor?.door.id).toBe('ship.door_bridge');

    // Looking South away from door into corridor (angle = Math.PI / 2): returns null
    const facingAway = findNearestDoor(1580, 355, doors, 42, Math.PI / 2);
    expect(facingAway).toBeNull();

    // Looking East sideways (angle = 0): returns null
    const facingSideways = findNearestDoor(1580, 355, doors, 42, 0);
    expect(facingSideways).toBeNull();
  });
});

describe('2D Raycast Visibility & Lighting Cones', () => {
  it('generates a closed visibility polygon avoiding occluding walls', () => {
    const origin = { x: 500, y: 400 }; // in central corridor
    const polygon = computeVisibilityPolygon(origin, 200, HESPERIA_WALLS);

    expect(polygon.length).toBeGreaterThan(20);
    for (const pt of polygon) {
      const dist = Math.hypot(pt.x - origin.x, pt.y - origin.y);
      expect(dist).toBeLessThanOrEqual(200.01);
    }
  });

  it('evaluates directional flashlight and ambient cone', () => {
    const origin = { x: 100, y: 100 };
    const facingAngle = 0; // facing Right (+X)

    // Point directly in front within flashlight range
    expect(isPointInFlashlightCone(origin, { x: 200, y: 100 }, facingAngle)).toBe(true);

    // Point directly behind outside ambient range (ambient = 80)
    expect(
      isPointInFlashlightCone(origin, { x: 10, y: 100 }, facingAngle, Math.PI / 2, 320, 80)
    ).toBe(false);

    // Point behind but inside ambient range (radius 50 < 80)
    expect(
      isPointInFlashlightCone(origin, { x: 60, y: 100 }, facingAngle, Math.PI / 2, 320, 80)
    ).toBe(true);
  });

  it('merges closed blast doors as opaque wall occluders', () => {
    const doors = createInitialDoors();
    // Compiled doors start shut: every door contributes an occluder
    const initialOpaque = getOpaqueWallSegments(HESPERIA_WALLS, doors);
    const initialClosedCount = doors.filter((d) => !d.isOpen).length;
    const solidCount = HESPERIA_WALLS.filter((w) => w.isOpaque !== false).length;
    expect(initialClosedCount).toBe(doors.length);
    expect(initialOpaque.length).toBe(solidCount + initialClosedCount);
    expect(initialOpaque.some((w) => w.isWindow)).toBe(false);

    // Open the bridge door: its occluder drops out
    const opened = toggleDoor(doors, 'ship.door_bridge', true);
    const openOpaque = getOpaqueWallSegments(HESPERIA_WALLS, opened);
    expect(openOpaque.length).toBe(initialOpaque.length - 1);
    expect(openOpaque.some((w) => w.id === 'ship.door_bridge')).toBe(false);
  });

  it('occludes visibility polygon across blast doorway when door is closed', () => {
    const doors = createInitialDoors();
    const lightOrigin = { x: 1580, y: 360 }; // In corridor below bridge door (y: 320)

    // With door open, rays should penetrate into Bridge (y < 320)
    const opened = toggleDoor(doors, 'ship.door_bridge', true);
    const openWalls = getOpaqueWallSegments(HESPERIA_WALLS, opened);
    const openPoly = computeVisibilityPolygon(lightOrigin, 150, openWalls);
    const penetratesOpen = openPoly.some((pt) => pt.y < 317 && pt.x >= 1560 && pt.x <= 1600);
    expect(penetratesOpen).toBe(true);

    // With door closed, rays must NOT penetrate past y: 320 into Bridge
    const closedWalls = getOpaqueWallSegments(HESPERIA_WALLS, doors);
    const closedPoly = computeVisibilityPolygon(lightOrigin, 150, closedWalls);
    const penetratesClosed = closedPoly.some((pt) => pt.y < 317 && pt.x >= 1560 && pt.x <= 1600);
    expect(penetratesClosed).toBe(false);
  });

  it('configures dark corridor ambient and spaced corridor lights', () => {
    expect(ROOM_AMBIENTS.corridor[0]).toBeLessThan(0.1);
    const corridorLights = HESPERIA_LIGHTS.filter((l) => l.room === 'corridor');
    expect(corridorLights.length).toBe(1);
    for (const light of corridorLights) {
      expect(light.y).toBe(360);
      expect(light.radius).toBeGreaterThanOrEqual(180);
    }
  });
});

describe('Impact Visibility & Door Proximity', () => {
  it('determines impact visibility based on distance and intervening bulkheads', () => {
    const doors = createInitialDoors();
    const observer = { x: 1600, y: 260 }; // In Bridge (world)

    // 1. Point in same room (Bridge wall hit)
    expect(isImpactVisible(observer, { x: 1650, y: 260 }, doors)).toBe(true);

    // 2. Point far away in Engineering behind multiple bulkheads & closed doors
    expect(isImpactVisible(observer, { x: 2200, y: 470 }, doors)).toBe(false);

    // 3. Point right beside observer
    expect(isImpactVisible(observer, { x: 1605, y: 265 }, doors)).toBe(true);

    // 4. Point beyond max distance (>400)
    expect(isImpactVisible(observer, { x: 2100, y: 260 }, doors, HESPERIA_WALLS, 400)).toBe(false);
  });

  it('detects nearest interactive door when standing directly in front', () => {
    const doors = createInitialDoors();
    // ship.door_bridge is at world x: 1560..1600, y: 320
    // Pawn directly in front of door in corridor (1580, 347)
    const nearby = findNearestDoor(1580, 347, doors, 42);
    expect(nearby).not.toBeNull();
    expect(nearby?.door.id).toBe('ship.door_bridge');
    expect(nearby?.distance).toBeCloseTo(27, 0);

    // Pawn far away inside Bridge at helm (1580, 260)
    const far = findNearestDoor(1580, 260, doors, 42);
    expect(far).toBeNull();

    // Empty doors array returns null
    expect(findNearestDoor(1580, 347, [], 42)).toBeNull();
  });
});
