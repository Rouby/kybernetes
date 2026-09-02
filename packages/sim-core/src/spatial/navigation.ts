export interface WaypointNode {
  id: string;
  x: number;
  y: number;
  roomId: string;
  isDoor?: boolean;
  doorId?: string;
}

export const SHIP_WAYPOINTS: Record<string, WaypointNode> = {
  // Deck A / B Upper Rooms
  bridge_center: { id: 'bridge_center', x: 220, y: 170, roomId: 'bridge' },
  door_bridge: {
    id: 'door_bridge',
    x: 220,
    y: 280,
    roomId: 'bridge',
    isDoor: true,
    doorId: 'door_bridge',
  },
  quarters_center: { id: 'quarters_center', x: 590, y: 170, roomId: 'quarters' },
  door_quarters: {
    id: 'door_quarters',
    x: 590,
    y: 280,
    roomId: 'quarters',
    isDoor: true,
    doorId: 'door_quarters',
  },
  mess_center: { id: 'mess_center', x: 970, y: 170, roomId: 'mess' },
  door_mess: { id: 'door_mess', x: 970, y: 280, roomId: 'mess', isDoor: true, doorId: 'door_mess' },

  // Central Corridor Transit Conduits
  corridor_west: { id: 'corridor_west', x: 220, y: 340, roomId: 'corridor' },
  corridor_mid: { id: 'corridor_mid', x: 590, y: 340, roomId: 'corridor' },
  corridor_east: { id: 'corridor_east', x: 970, y: 340, roomId: 'corridor' },

  // Deck C / D Lower Rooms
  door_armory: {
    id: 'door_armory',
    x: 220,
    y: 400,
    roomId: 'armory',
    isDoor: true,
    doorId: 'door_armory',
  },
  armory_center: { id: 'armory_center', x: 220, y: 570, roomId: 'armory' },
  door_cargo: {
    id: 'door_cargo',
    x: 590,
    y: 400,
    roomId: 'cargo',
    isDoor: true,
    doorId: 'door_cargo',
  },
  cargo_center: { id: 'cargo_center', x: 590, y: 570, roomId: 'cargo' },
  door_eng: {
    id: 'door_eng',
    x: 970,
    y: 400,
    roomId: 'engineering',
    isDoor: true,
    doorId: 'door_eng',
  },
  eng_center: { id: 'eng_center', x: 970, y: 570, roomId: 'engineering' },
};

const ADJACENCY: Record<string, string[]> = {
  bridge_center: ['door_bridge'],
  door_bridge: ['bridge_center', 'corridor_west'],
  quarters_center: ['door_quarters'],
  door_quarters: ['quarters_center', 'corridor_mid'],
  mess_center: ['door_mess'],
  door_mess: ['mess_center', 'corridor_east'],

  corridor_west: ['door_bridge', 'door_armory', 'corridor_mid'],
  corridor_mid: ['door_quarters', 'door_cargo', 'corridor_west', 'corridor_east'],
  corridor_east: ['door_mess', 'door_eng', 'corridor_mid'],

  door_armory: ['corridor_west', 'armory_center'],
  armory_center: ['door_armory'],
  door_cargo: ['corridor_mid', 'cargo_center'],
  cargo_center: ['door_cargo'],
  door_eng: ['corridor_east', 'eng_center'],
  eng_center: ['door_eng'],
};

export function getNearestWaypointId(x: number, y: number): string {
  let bestId = 'corridor_mid';
  let bestDist = Number.POSITIVE_INFINITY;

  for (const [id, wp] of Object.entries(SHIP_WAYPOINTS)) {
    const d = Math.hypot(wp.x - x, wp.y - y);
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }

  return bestId;
}

export function getRoomCenterWaypointId(roomId: string): string {
  const map: Record<string, string> = {
    bridge: 'bridge_center',
    quarters: 'quarters_center',
    mess: 'mess_center',
    corridor: 'corridor_mid',
    armory: 'armory_center',
    cargo: 'cargo_center',
    engineering: 'eng_center',
  };
  return map[roomId] || 'eng_center';
}

// fallow-ignore-next-line complexity
export function findWaypointPath(
  startX: number,
  startY: number,
  targetRoomId: string
): Array<{ x: number; y: number; id: string }> {
  const startWpId = getNearestWaypointId(startX, startY);
  const endWpId = getRoomCenterWaypointId(targetRoomId);

  if (startWpId === endWpId) {
    const end = SHIP_WAYPOINTS[endWpId];
    return [{ x: end.x, y: end.y, id: end.id }];
  }

  // BFS search
  const queue: string[][] = [[startWpId]];
  const visited = new Set<string>([startWpId]);
  let foundPath: string[] | null = null;

  while (queue.length > 0) {
    const currentPath = queue.shift();
    if (!currentPath) break;
    const lastNode = currentPath[currentPath.length - 1];

    if (lastNode === endWpId) {
      foundPath = currentPath;
      break;
    }

    const neighbors = ADJACENCY[lastNode] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...currentPath, neighbor]);
      }
    }
  }

  if (!foundPath) {
    const end = SHIP_WAYPOINTS[endWpId];
    return [{ x: end.x, y: end.y, id: end.id }];
  }

  return foundPath.map((id) => {
    const wp = SHIP_WAYPOINTS[id];
    return { x: wp.x, y: wp.y, id: wp.id };
  });
}
