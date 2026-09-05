import type { DoorState, WallSegment } from '@kybernetes/protocol';
import { closestPointOnSegment, resolvePawnMovement } from './collision';
import {
  type DockFrameOffset,
  getShipFrameWalls,
  getStationFrameWalls,
  isAboardShip,
} from './deck';

export function createInitialDoors(): DoorState[] {
  return [
    // Upper Compartment Blast Doors (Connect rooms to central catwalk spine at y=368)
    {
      id: 'door_bridge',
      name: 'Bridge Blast Gate',
      x1: 200,
      y1: 368,
      x2: 240,
      y2: 368,
      isOpen: true,
      isAirlock: false,
      roomA: 'bridge',
      roomB: 'corridor',
      health: 100,
    },
    {
      id: 'door_avionics',
      name: 'Avionics Access Hatch',
      x1: 360,
      y1: 368,
      x2: 400,
      y2: 368,
      isOpen: true,
      isAirlock: false,
      roomA: 'avionics',
      roomB: 'corridor',
      health: 100,
    },
    {
      id: 'door_life_support',
      name: 'Life Support Pressure Hatch',
      x1: 500,
      y1: 368,
      x2: 540,
      y2: 368,
      isOpen: true,
      isAirlock: false,
      roomA: 'life_support',
      roomB: 'corridor',
      health: 100,
    },
    {
      id: 'door_quarters',
      name: 'Berthing Pods Blast Gate',
      x1: 660,
      y1: 368,
      x2: 700,
      y2: 368,
      isOpen: true,
      isAirlock: false,
      roomA: 'quarters',
      roomB: 'corridor',
      health: 100,
    },
    {
      id: 'door_mess',
      name: 'Mess Hall Pressure Door',
      x1: 820,
      y1: 368,
      x2: 860,
      y2: 368,
      isOpen: true,
      isAirlock: false,
      roomA: 'mess',
      roomB: 'corridor',
      health: 100,
    },
    {
      id: 'airlock_stbd_inner',
      name: 'Starboard Airlock Inner Hatch',
      x1: 950,
      y1: 368,
      x2: 990,
      y2: 368,
      isOpen: true,
      isAirlock: false,
      roomA: 'airlock_stbd',
      roomB: 'corridor',
      health: 100,
    },

    // Lower Compartment Blast Doors (Connect rooms to central catwalk spine at y=432)
    {
      id: 'door_armory',
      name: 'Armory Security Blast Gate',
      x1: 200,
      y1: 432,
      x2: 240,
      y2: 432,
      isOpen: true,
      isAirlock: false,
      roomA: 'armory',
      roomB: 'corridor',
      health: 100,
    },
    {
      id: 'airlock_port_inner',
      name: 'Port Airlock Inner Hatch',
      x1: 360,
      y1: 432,
      x2: 400,
      y2: 432,
      isOpen: true,
      isAirlock: false,
      roomA: 'airlock_port',
      roomB: 'corridor',
      health: 100,
    },
    {
      id: 'door_cargo',
      name: 'Cargo Bay Heavy Roller Gate',
      x1: 580,
      y1: 432,
      x2: 620,
      y2: 432,
      isOpen: true,
      isAirlock: false,
      roomA: 'cargo',
      roomB: 'corridor',
      health: 100,
    },
    {
      id: 'door_eng',
      name: 'Engineering Radiation Gate',
      x1: 870,
      y1: 432,
      x2: 910,
      y2: 432,
      isOpen: true,
      isAirlock: false,
      roomA: 'engineering',
      roomB: 'corridor',
      health: 100,
    },

    // Catwalk Spine Pressure Bulkhead Gates (Vertical dividers along catwalk)
    {
      id: 'door_spine_fwd',
      name: 'Forward Spine Bulkhead Gate',
      x1: 440,
      y1: 368,
      x2: 440,
      y2: 432,
      isOpen: true,
      isAirlock: false,
      roomA: 'corridor',
      roomB: 'corridor',
      health: 100,
    },
    {
      id: 'door_spine_aft',
      name: 'Aft Spine Bulkhead Gate',
      x1: 760,
      y1: 368,
      x2: 760,
      y2: 432,
      isOpen: true,
      isAirlock: false,
      roomA: 'corridor',
      roomB: 'corridor',
      health: 100,
    },

    // Exterior Outer Hull Hatches (Open directly to vacuum)
    {
      id: 'airlock_stbd_outer',
      name: 'Starboard Outer Hull EVA Hatch',
      x1: 950,
      y1: 228,
      x2: 990,
      y2: 228,
      isOpen: false,
      isAirlock: true,
      roomA: 'airlock_stbd',
      roomB: 'vacuum',
    },
    {
      id: 'airlock_port_outer',
      name: 'Port Outer Hull EVA Hatch',
      x1: 360,
      y1: 572,
      x2: 400,
      y2: 572,
      isOpen: false,
      isAirlock: true,
      roomA: 'airlock_port',
      roomB: 'vacuum',
    },
    // Docking gauntlet hatches (driven by the docking cycle, sealed unless docked)
    {
      id: 'gauntlet_ship_door',
      name: 'Gauntlet Ship-Side Hatch',
      x1: 580,
      y1: 572,
      x2: 620,
      y2: 572,
      isOpen: false,
      isSealed: true,
      isAirlock: false,
      roomA: 'cargo',
      roomB: 'gauntlet',
      health: 100,
    },
    {
      id: 'gauntlet_station_door',
      name: 'Gauntlet Station-Side Hatch',
      x1: 580,
      y1: 650,
      x2: 620,
      y2: 650,
      isOpen: false,
      isSealed: true,
      isAirlock: false,
      roomA: 'gauntlet',
      roomB: 'station_lobby',
      health: 100,
    },
    {
      id: 'airlock_eng',
      name: 'Aft Engineering Emergency Purge Vent',
      x1: 1020,
      y1: 480,
      x2: 1020,
      y2: 520,
      isOpen: false,
      isAirlock: true,
      roomA: 'engineering',
      roomB: 'vacuum',
    },
  ];
}

export const GAUNTLET_DOOR_IDS: readonly string[] = [
  'gauntlet_ship_door',
  'gauntlet_station_door',
] as const;

export function isGauntletDoorId(doorId: string): boolean {
  return (GAUNTLET_DOOR_IDS as readonly string[]).includes(doorId);
}

export function isStationSideDoor(door: DoorState): boolean {
  const stationSide = (roomId: string): boolean =>
    roomId === 'gauntlet' || roomId.startsWith('station_');
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
