import { describe, expect, it } from 'vitest';
import {
  calculateDutyRewards,
  getDutiesForStation,
  getDutyById,
  startDuty,
  tickActiveDuty,
} from './duties';
import { getAllRoles, getRoleDefinition } from './roles';
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
  HESPERIA_STATIONS,
  HESPERIA_WALLS,
  ROOM_AMBIENTS,
} from './spatial/deck';
import { createInitialDoors, findNearestDoor } from './spatial/doors';
import {
  computeVisibilityPolygon,
  getOpaqueWallSegments,
  isImpactVisible,
  isPointInFlashlightCone,
} from './spatial/visibility';
import { createInitialPlayerVitals } from './survival';

describe('Deck Layout & Geometry', () => {
  it('initializes default CSS Hesperia deck layout', () => {
    const deck = createDefaultDeck();
    expect(deck.width).toBe(1200);
    expect(deck.height).toBe(800);
    expect(deck.walls.length).toBeGreaterThan(15);
    expect(deck.stations.length).toBe(13);
    expect(HESPERIA_ROOMS.length).toBe(11);
  });

  it('defines valid spawn points for all 5 starting roles', () => {
    const roles = getAllRoles();
    expect(roles).toHaveLength(5);

    for (const roleDef of roles) {
      const spawn = HESPERIA_SPAWNS[roleDef.role];
      expect(spawn).toBeDefined();
      expect(spawn.x).toBeGreaterThan(60);
      expect(spawn.x).toBeLessThan(1140);
      expect(spawn.y).toBeGreaterThan(60);
      expect(spawn.y).toBeLessThan(740);
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
    const stations = HESPERIA_STATIONS;
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
    // door_bridge is at x: 200..240, y: 368
    // Pawn at (220, 385) in the corridor just south of the door
    const nearWithoutAngle = findNearestDoor(220, 385, doors, 42);
    expect(nearWithoutAngle?.door.id).toBe('door_bridge');

    // Looking North directly at the door (angle = -Math.PI / 2): returns door
    const facingDoor = findNearestDoor(220, 385, doors, 42, -Math.PI / 2);
    expect(facingDoor?.door.id).toBe('door_bridge');

    // Looking South away from door into corridor (angle = Math.PI / 2): returns null
    const facingAway = findNearestDoor(220, 385, doors, 42, Math.PI / 2);
    expect(facingAway).toBeNull();

    // Looking East sideways (angle = 0): returns null
    const facingSideways = findNearestDoor(220, 385, doors, 42, 0);
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
    // Initially interior doors are open, 3 exterior airlocks are closed
    const initialOpaque = getOpaqueWallSegments(HESPERIA_WALLS, doors);
    const initialClosedCount = doors.filter((d) => !d.isOpen).length;
    expect(initialOpaque.length).toBe(HESPERIA_WALLS.length + initialClosedCount);

    // Close the bridge door
    doors[0].isOpen = false;
    const closedOpaque = getOpaqueWallSegments(HESPERIA_WALLS, doors);
    expect(closedOpaque.length).toBe(initialOpaque.length + 1);
    expect(closedOpaque.some((w) => w.id === 'door_bridge')).toBe(true);
  });

  it('occludes visibility polygon across blast doorway when door is closed', () => {
    const doors = createInitialDoors();
    const lightOrigin = { x: 220, y: 400 }; // In corridor right below bridge door (y: 368)

    // With door open, rays should penetrate into Bridge (y < 368)
    const openWalls = getOpaqueWallSegments(HESPERIA_WALLS, doors);
    const openPoly = computeVisibilityPolygon(lightOrigin, 150, openWalls);
    const penetratesOpen = openPoly.some((pt) => pt.y < 365 && pt.x >= 200 && pt.x <= 240);
    expect(penetratesOpen).toBe(true);

    // With door closed, rays must NOT penetrate past y: 368 into Bridge
    doors[0].isOpen = false;
    const closedWalls = getOpaqueWallSegments(HESPERIA_WALLS, doors);
    const closedPoly = computeVisibilityPolygon(lightOrigin, 150, closedWalls);
    const penetratesClosed = closedPoly.some((pt) => pt.y < 365 && pt.x >= 200 && pt.x <= 240);
    expect(penetratesClosed).toBe(false);
  });

  it('configures dark corridor ambient and spaced corridor lights', () => {
    expect(ROOM_AMBIENTS.corridor[0]).toBeLessThan(0.1);
    const corridorLights = HESPERIA_LIGHTS.filter((l) => l.room === 'corridor');
    expect(corridorLights.length).toBe(3);
    for (const light of corridorLights) {
      expect(light.y).toBe(400);
      expect(light.radius).toBeGreaterThanOrEqual(180);
    }
  });
});

describe('Role Definitions & Duty Progression', () => {
  it('returns valid definitions for Wiper and Stevedore', () => {
    const wiper = getRoleDefinition('wiper');
    expect(wiper.name).toBe('Maintenance Wiper');
    expect(wiper.department).toBe('Engineering');
    expect(wiper.duties.length).toBeGreaterThan(0);

    const stevedore = getRoleDefinition('stevedore');
    expect(stevedore.name).toBe('Cargo Stevedore');
    expect(stevedore.badge).toBe('HLD-3');
  });

  it('ticks active duty and awards credits upon completion', () => {
    const wiperDuties = getDutiesForStation('reactor');
    expect(wiperDuties.length).toBeGreaterThan(0);

    const activeDuty = startDuty(wiperDuties[0].id, 'reactor_primary_console');
    expect(activeDuty).not.toBeNull();
    if (!activeDuty) return;

    const vitals = createInitialPlayerVitals();

    // Tick 5 seconds
    const tick1 = tickActiveDuty(activeDuty, 5, 'wiper', vitals);
    expect(tick1.completed).toBe(false);
    expect(tick1.nextDuty.progressSeconds).toBeGreaterThan(0);
    expect(tick1.staminaCost).toBeGreaterThan(0);

    // Tick to completion
    const tick2 = tickActiveDuty(tick1.nextDuty, 15, 'wiper', vitals);
    expect(tick2.completed).toBe(true);
    expect(tick2.nextDuty.isCompleted).toBe(true);

    const rewards = calculateDutyRewards(wiperDuties[0].id, 'wiper');
    expect(rewards.credits).toBeGreaterThan(0);
    expect(rewards.xp).toBeGreaterThan(0);
  });

  it('halves duty speed when player is starving or dehydrated', () => {
    const dutyDef = getDutyById('scrub_plasma');
    expect(dutyDef).toBeDefined();

    const activeDuty = startDuty('scrub_plasma', 'reactor_primary_console');
    expect(activeDuty).toBeDefined();
    if (!activeDuty) return;

    const normalVitals = createInitialPlayerVitals();
    const starvingVitals = { ...normalVitals, hunger: 10 };

    const tickNormal = tickActiveDuty(activeDuty, 2, 'wiper', normalVitals);
    const tickStarving = tickActiveDuty(activeDuty, 2, 'wiper', starvingVitals);

    expect(tickStarving.nextDuty.progressSeconds).toBeLessThan(tickNormal.nextDuty.progressSeconds);
  });

  it('determines impact visibility based on distance and intervening bulkheads', () => {
    const doors = createInitialDoors();
    const observer = { x: 200, y: 290 }; // In Bridge

    // 1. Point in same room (Bridge wall hit)
    expect(isImpactVisible(observer, { x: 250, y: 290 }, doors)).toBe(true);

    // 2. Point far away in Engineering behind multiple bulkheads & closed doors
    expect(isImpactVisible(observer, { x: 890, y: 510 }, doors)).toBe(false);

    // 3. Point right beside observer
    expect(isImpactVisible(observer, { x: 205, y: 295 }, doors)).toBe(true);

    // 4. Point beyond max distance (>400)
    expect(isImpactVisible(observer, { x: 900, y: 290 }, doors, HESPERIA_WALLS, 400)).toBe(false);
  });

  it('detects nearest interactive door when standing directly in front', () => {
    const doors = createInitialDoors();
    // door_bridge is at x: 200..240, y: 368
    // Pawn directly in front of door in corridor (220, 395)
    const nearby = findNearestDoor(220, 395, doors, 42);
    expect(nearby).not.toBeNull();
    expect(nearby?.door.id).toBe('door_bridge');
    expect(nearby?.distance).toBeCloseTo(27, 0);

    // Pawn far away inside Bridge at helm (220, 290)
    const far = findNearestDoor(220, 290, doors, 42);
    expect(far).toBeNull();

    // Empty doors array returns null
    expect(findNearestDoor(220, 395, [], 42)).toBeNull();
  });
});
