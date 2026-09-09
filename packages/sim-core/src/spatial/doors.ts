/**
 * Legacy door view rebacked on compiled harbor portals. DoorStates carry
 * world-space segments with namespaced ids ('station.habitat_korridor') so live
 * snapshot portals join directly. Pure helpers (toggle/find/collide) keep
 * their semantics; the data now comes from the compiler, not hand lists.
 */

import type { DoorState, WallSegment } from '@kybernetes/protocol';
import { HesperiaV2Spec } from '../world/content/HesperiaV2.hull.js';
import { StationHubSpec } from '../world/content/StationHub.hull.js';
import { compileHull } from '../world/hullCompiler.js';
import type { PortalEdge } from '../world/types.js';
import { closestPointOnSegment, resolvePawnMovement } from './collision';
import {
  type DockFrameOffset,
  getShipFrameWalls,
  getStationFrameWalls,
  isAboardShip,
} from './deck';

interface CompiledDoorSeed {
  id: string;
  roomA: string;
  roomB: string;
  kind: string;
  segment: { x1: number; y1: number; x2: number; y2: number };
  frame: 'station' | 'ship';
}

function isDoorPortal(portal: Pick<PortalEdge, 'kind'>): boolean {
  return portal.kind === 'door' || portal.kind === 'airlock';
}

function frameRoomId(frame: 'station' | 'ship', room: string): string {
  if (room === 'space' || room === 'vacuum') return 'vacuum';
  return `${frame}.${room}`;
}

function collectFrameSeeds(
  portals: readonly PortalEdge[],
  frame: 'station' | 'ship',
  seeds: CompiledDoorSeed[]
): void {
  for (const portal of portals) {
    if (!isDoorPortal(portal)) continue;
    seeds.push({
      id: `${frame}.${portal.id}`,
      roomA: `${frame}.${portal.roomA}`,
      roomB: frameRoomId(frame, portal.roomB),
      kind: portal.kind,
      segment: { ...portal.segment },
      frame,
    });
  }
}

function collectDoorSeeds(): CompiledDoorSeed[] {
  const seeds: CompiledDoorSeed[] = [];
  const station = compileHull({ ...StationHubSpec, frameId: 'station' });
  const ship = compileHull({ ...HesperiaV2Spec, frameId: 'ship' });
  collectFrameSeeds(station.portals, 'station', seeds);
  collectFrameSeeds(ship.portals, 'ship', seeds);
  return seeds;
}

function doorName(id: string, isAirlock: boolean): string {
  const bare = id.includes('.') ? (id.split('.').pop() ?? id) : id;
  const titled = bare
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return isAirlock ? `${titled} Airlock` : `${titled} Hatch`;
}

const DOOR_SEEDS = collectDoorSeeds();

/**
 * Door segments stay frame-LOCAL (like walls): consumers offset ship
 * doors themselves via getWorldDoors. IDs stay namespaced to join snapshots.
 */
export function createInitialDoors(): DoorState[] {
  return DOOR_SEEDS.map((seed) => {
    return {
      id: seed.id,
      name: doorName(seed.id, seed.kind === 'airlock'),
      x1: seed.segment.x1,
      y1: seed.segment.y1,
      x2: seed.segment.x2,
      y2: seed.segment.y2,
      isOpen: false,
      isAirlock: seed.kind === 'airlock',
      roomA: seed.roomA,
      roomB: seed.roomB,
      health: 100,
    };
  });
}

export const GAUNTLET_DOOR_IDS: readonly string[] = [
  'station.korridor_ost_andock',
  'ship.schiff_mund',
] as const;

export function isGauntletDoorId(doorId: string): boolean {
  return (GAUNTLET_DOOR_IDS as readonly string[]).includes(doorId);
}

export function isStationSideDoor(door: DoorState): boolean {
  const stationSide = (roomId: string): boolean => roomId.startsWith('station.');
  return stationSide(door.roomA) && stationSide(door.roomB);
}

export function getWorldDoors(doors: DoorState[], offset: DockFrameOffset): DoorState[] {
  return doors.map((d) => {
    if (isStationSideDoor(d)) return d;
    return {
      ...d,
      x1: d.x1 + offset.x,
      y1: d.y1 + offset.y,
      x2: d.x2 + offset.x,
      y2: d.y2 + offset.y,
    };
  });
}

function closedDoorSegments(doors: DoorState[], stationSide: boolean): WallSegment[] {
  return doors
    .filter((d) => !d.isOpen && isStationSideDoor(d) === stationSide)
    .map((d) => ({
      id: `door_wall_${d.id}`,
      x1: d.x1,
      y1: d.y1,
      x2: d.x2,
      y2: d.y2,
      isOpaque: true,
      isTraversable: false,
    }));
}

export function resolveFramedMovement(
  x: number,
  y: number,
  targetX: number,
  targetY: number,
  radius: number,
  doors: DoorState[],
  offset: DockFrameOffset
): { x: number; y: number; collided: boolean } {
  if (isAboardShip(x, y, offset)) {
    const walls = [...getShipFrameWalls(), ...closedDoorSegments(doors, false)];
    const res = resolvePawnMovement(
      x - offset.x,
      y - offset.y,
      targetX - offset.x,
      targetY - offset.y,
      radius,
      walls
    );
    return {
      x: Number((res.x + offset.x).toFixed(2)),
      y: Number((res.y + offset.y).toFixed(2)),
      collided: res.collided,
    };
  }
  const walls = [...getStationFrameWalls(), ...closedDoorSegments(doors, true)];
  return resolvePawnMovement(x, y, targetX, targetY, radius, walls);
}

export function toggleDoor(doors: DoorState[], doorId: string, forceState?: boolean): DoorState[] {
  const target = doors.find((d) => d.id === doorId);
  if (!target) return doors;

  const nextState = forceState !== undefined ? forceState : !target.isOpen;

  return doors.map((d) => {
    if (d.id === doorId) {
      return { ...d, isOpen: nextState };
    }
    return d;
  });
}

export function findNearestDoor(
  pawnX: number,
  pawnY: number,
  doors: DoorState[],
  maxDistance = 42,
  facingAngle?: number
): { door: DoorState; distance: number } | null {
  let nearest: { door: DoorState; distance: number } | null = null;
  let minDist = maxDistance;
  const p = { x: pawnX, y: pawnY };

  for (const door of doors) {
    const a = { x: door.x1, y: door.y1 };
    const b = { x: door.x2, y: door.y2 };
    const closest = closestPointOnSegment(p, a, b);
    const dx = closest.x - pawnX;
    const dy = closest.y - pawnY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= maxDistance && dist < minDist) {
      if (facingAngle !== undefined && dist > 6) {
        const dot = (Math.cos(facingAngle) * dx + Math.sin(facingAngle) * dy) / dist;
        if (dot < 0.35) continue;
      }
      minDist = dist;
      nearest = { door, distance: Number(dist.toFixed(2)) };
    }
  }

  return nearest;
}
