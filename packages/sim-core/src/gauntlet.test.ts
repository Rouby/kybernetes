import type { WallSegment } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { createInitialIntroState, getShipDockingOffset, tickIntroState } from './intro';
import { resolvePawnMovement, resolveWallCollision } from './spatial/collision';
import {
  applyShipOffsetToWalls,
  findWorldRoom,
  HESPERIA_ROOMS,
  HESPERIA_WALLS,
  isAboardShip,
  isShipSideRoom,
  STATION_BAY_SPAWN,
} from './spatial/deck';
import {
  createInitialDoors,
  GAUNTLET_DOOR_IDS,
  getWorldDoors,
  isGauntletDoorId,
  resolveFramedMovement,
  toggleDoor,
} from './spatial/doors';
import {
  computeVisibilityPolygon,
  getOpaqueWallSegments,
  getWorldOpaqueWalls,
} from './spatial/visibility';

function walkPath(
  points: Array<{ x: number; y: number }>,
  walls: WallSegment[]
): { x: number; y: number } {
  let pos = { ...points[0] };
  for (const target of points.slice(1)) {
    for (let i = 0; i < 80; i++) {
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 4) break;
      const step = Math.min(10, dist);
      const res = resolvePawnMovement(
        pos.x,
        pos.y,
        pos.x + (dx / dist) * step,
        pos.y + (dy / dist) * step,
        14,
        walls
      );
      pos = { x: res.x, y: res.y };
    }
  }
  return pos;
}

const BAY_TO_SHIP = [
  { x: 560, y: 880 },
  { x: 650, y: 880 },
  { x: 650, y: 760 },
  { x: 600, y: 760 },
  { x: 600, y: 540 },
];

describe('docking gauntlet', () => {
  it('defines two sealed gauntlet hatches', () => {
    const doors = createInitialDoors();
    for (const id of GAUNTLET_DOOR_IDS) {
      const door = doors.find((d) => d.id === id);
      expect(door).toBeDefined();
      expect(door?.isOpen).toBe(false);
      expect(door?.isSealed).toBe(true);
      expect(isGauntletDoorId(id)).toBe(true);
    }
    expect(isGauntletDoorId('door_bridge')).toBe(false);
  });

  it('walks the bay-to-ship path when docked', () => {
    let doors = createInitialDoors();
    for (const id of GAUNTLET_DOOR_IDS) {
      doors = toggleDoor(doors, id, true);
    }
    const walls = getOpaqueWallSegments(HESPERIA_WALLS, doors);
    expect(walkPath(BAY_TO_SHIP, walls).y).toBeLessThan(560);
  });

  it('blocks the tube while sealed', () => {
    const walls = getOpaqueWallSegments(HESPERIA_WALLS, createInitialDoors());
    expect(walkPath(BAY_TO_SHIP, walls).y).toBeGreaterThan(660);
  });

  it('exposes station rooms and a bay spawn', () => {
    const ids = HESPERIA_ROOMS.map((r) => r.id);
    expect(ids).toContain('gauntlet');
    expect(ids).toContain('station_lobby');
    expect(ids).toContain('station_bay');
    expect(STATION_BAY_SPAWN.y).toBeGreaterThan(800);
  });

  it('slides the ship in from alternating sides and holds it off-screen away', () => {
    const west = {
      ...createInitialIntroState(),
      phase: 'inbound' as const,
      etaSeconds: 20,
      legIndex: 0,
    };
    expect(getShipDockingOffset(west).x).toBe(-1400);
    const east = { ...west, legIndex: 1 };
    expect(getShipDockingOffset(east).x).toBe(1400);
    const docked = { ...west, phase: 'docked' as const, etaSeconds: 0 };
    expect(getShipDockingOffset(docked)).toEqual({ x: 0, y: 0 });
    const away = { ...west, phase: 'in_transit' as const, progressPercent: 50 };
    expect(getShipDockingOffset(away).x).toBe(1400);
  });

  it('classifies ship and station frames with world lookups', () => {
    expect(isShipSideRoom('cargo')).toBe(true);
    expect(isShipSideRoom('station_bay')).toBe(false);
    expect(isShipSideRoom('gauntlet')).toBe(false);
    expect(findWorldRoom(600, 500, { x: 0, y: 0 })).toBe('cargo');
    expect(findWorldRoom(600, 500, { x: -1400, y: 0 })).toBeNull();
    expect(isAboardShip(600, 500, { x: 0, y: 0 })).toBe(true);
    expect(isAboardShip(600, 875, { x: 0, y: 0 })).toBe(false);
  });

  it('shifts only ship-side walls and doors with the offset', () => {
    const walls = applyShipOffsetToWalls(HESPERIA_WALLS, { x: -1400, y: 0 });
    expect(walls.find((w) => w.id === 'hull_top_l')?.x1).toBe(-1280);
    expect(walls.find((w) => w.id === 'st_hull_bottom')?.x1).toBe(120);
    const doors = getWorldDoors(createInitialDoors(), { x: -1400, y: 0 });
    expect(doors.find((d) => d.id === 'door_bridge')?.x1).toBe(-1200);
    expect(doors.find((d) => d.id === 'gauntlet_station_door')?.x1).toBe(580);
  });

  it('resolves movement in the correct frame under offset', () => {
    const doors = createInitialDoors();
    const free = resolveFramedMovement(-100, 500, -110, 500, 14, doors, { x: -700, y: 0 });
    expect(free.collided).toBe(false);
    expect(free.x).toBeCloseTo(-110, 1);
    const shut = toggleDoor(doors, 'door_cargo', false);
    const blocked = resolveFramedMovement(-100, 420, -100, 460, 14, shut, { x: -700, y: 0 });
    expect(blocked.collided).toBe(true);
    expect(blocked.y).toBeLessThan(430);
    const station = resolveFramedMovement(560, 875, 560, 865, 14, doors, { x: -700, y: 0 });
    expect(station.collided).toBe(false);
    expect(station.y).toBeCloseTo(865, 1);
  });

  it('composes world-space occluders across frames', () => {
    const doors = createInitialDoors();
    const shut = toggleDoor(doors, 'door_bridge', false);
    const world = getWorldOpaqueWalls(HESPERIA_WALLS, shut, [], { x: -1400, y: 0 });
    const bridgeSeg = world.find((w) => w.id === 'door_bridge');
    expect(bridgeSeg?.x1).toBe(-1200);
    expect(world.some((w) => w.id === 'station_bay')).toBe(false);
  });

  it('sees through windows but cannot walk through them', () => {
    const walls = getOpaqueWallSegments(HESPERIA_WALLS, createInitialDoors());
    const poly = computeVisibilityPolygon({ x: 200, y: 685 }, 150, walls);
    expect(poly.some((pt) => pt.x < 118)).toBe(true);
    const winWall = HESPERIA_WALLS.find((w) => w.id === 'st_win_west_alpha');
    expect(winWall).toBeDefined();
    const bump = resolveWallCollision({ x: 130, y: 685 }, 14, winWall ?? HESPERIA_WALLS[0]);
    expect(bump.collided).toBe(true);
  });

  it('cycles arrived back to inbound for the next docking', () => {
    let s = { ...createInitialIntroState(), phase: 'arrived' as const, progressPercent: 100 };
    s = tickIntroState(s, 29);
    expect(s.phase).toBe('arrived');
    s = tickIntroState(s, 2);
    expect(s.phase).toBe('inbound');
    expect(s.legIndex).toBe(1);
    expect(s.etaSeconds).toBe(20);
  });
});
