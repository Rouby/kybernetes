import type { DoorState } from '@kybernetes/protocol';

export function createInitialRoomO2(): Record<string, number> {
  return {
    bridge: 100,
    avionics: 100,
    life_support: 100,
    quarters: 100,
    mess: 100,
    airlock_stbd: 100,
    corridor: 100,
    armory: 100,
    airlock_port: 100,
    cargo: 100,
    engineering: 100,
  };
}

export interface VentingSimulationResult {
  nextRoomO2: Record<string, number>;
  ventedRooms: string[];
  activeSuctions: Array<{
    roomId: string;
    targetX: number;
    targetY: number;
    strength: number;
  }>;
}

// fallow-ignore-next-line complexity
export function getVentedRooms(doors: DoorState[]): {
  ventedRooms: string[];
  openAirlocks: DoorState[];
} {
  const openAirlocks = doors.filter((d) => d.isAirlock && d.isOpen);
  const vented = new Set<string>();

  // Any room directly connected to an open airlock is vented
  for (const airlock of openAirlocks) {
    if (airlock.roomA && airlock.roomA !== 'vacuum') vented.add(airlock.roomA);
    if (airlock.roomB && airlock.roomB !== 'vacuum') vented.add(airlock.roomB);
  }

  // Multi-room air equalization: if an interior door is open to a vented room, that room also vents
  let changed = true;
  while (changed) {
    changed = false;
    for (const door of doors) {
      if (!door.isOpen || door.isAirlock) continue;
      if (vented.has(door.roomA) && !vented.has(door.roomB)) {
        vented.add(door.roomB);
        changed = true;
      } else if (vented.has(door.roomB) && !vented.has(door.roomA)) {
        vented.add(door.roomA);
        changed = true;
      }
    }
  }

  return { ventedRooms: Array.from(vented), openAirlocks };
}

// fallow-ignore-next-line complexity
export function tickAirVenting(
  currentO2: Record<string, number>,
  doors: DoorState[],
  dtSeconds: number
): VentingSimulationResult {
  const { ventedRooms, openAirlocks } = getVentedRooms(doors);
  const nextO2 = { ...currentO2 };

  // Deplete O2 in vented rooms rapidly, recover in sealed rooms
  for (const roomId of Object.keys(nextO2)) {
    if (ventedRooms.includes(roomId)) {
      nextO2[roomId] = Math.max(0, Number((nextO2[roomId] - 30 * dtSeconds).toFixed(1)));
    } else {
      nextO2[roomId] = Math.min(100, Number((nextO2[roomId] + 5 * dtSeconds).toFixed(1)));
    }
  }

  // Calculate suction target vectors towards the open airlock doors
  const activeSuctions: VentingSimulationResult['activeSuctions'] = [];
  for (const airlock of openAirlocks) {
    const midX = (airlock.x1 + airlock.x2) / 2;
    const midY = (airlock.y1 + airlock.y2) / 2;
    activeSuctions.push({
      roomId: airlock.roomA,
      targetX: midX,
      targetY: midY,
      strength: 90,
    });
  }

  return {
    nextRoomO2: nextO2,
    ventedRooms,
    activeSuctions,
  };
}

export function applySuctionToPosition(
  x: number,
  y: number,
  suctions: VentingSimulationResult['activeSuctions'],
  currentRoomId: string,
  dtSeconds: number
): { x: number; y: number } {
  const suction = suctions.find((s) => s.roomId === currentRoomId);
  if (!suction) return { x, y };

  const dx = suction.targetX - x;
  const dy = suction.targetY - y;
  const dist = Math.hypot(dx, dy);

  if (dist < 10) return { x, y };

  const pull = suction.strength * dtSeconds;
  const step = Math.min(pull, dist);
  const angle = Math.atan2(dy, dx);

  return {
    x: Number((x + Math.cos(angle) * step).toFixed(2)),
    y: Number((y + Math.sin(angle) * step).toFixed(2)),
  };
}
