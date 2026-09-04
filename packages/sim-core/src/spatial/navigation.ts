export interface WaypointNode {
  id: string;
  x: number;
  y: number;
  roomId: string;
  isDoor?: boolean;
  doorId?: string;
}

export const SHIP_WAYPOINTS: Record<string, WaypointNode> = {
  // Upper Rooms Centers
  bridge_center: { id: 'bridge_center', x: 220, y: 290, roomId: 'bridge' },
  avionics_center: { id: 'avionics_center', x: 380, y: 290, roomId: 'avionics' },
  life_support_center: { id: 'life_support_center', x: 520, y: 290, roomId: 'life_support' },
  quarters_center: { id: 'quarters_center', x: 680, y: 290, roomId: 'quarters' },
  mess_center: { id: 'mess_center', x: 840, y: 290, roomId: 'mess' },
  airlock_stbd_center: { id: 'airlock_stbd_center', x: 970, y: 290, roomId: 'airlock_stbd' },

  // Lower Rooms Centers
  armory_center: { id: 'armory_center', x: 220, y: 510, roomId: 'armory' },
  airlock_port_center: { id: 'airlock_port_center', x: 380, y: 510, roomId: 'airlock_port' },
  cargo_center: { id: 'cargo_center', x: 600, y: 510, roomId: 'cargo' },
  eng_center: { id: 'eng_center', x: 890, y: 510, roomId: 'engineering' },

  // Upper Compartment Doors
  door_bridge: {
    id: 'door_bridge',
    x: 220,
    y: 368,
    roomId: 'bridge',
    isDoor: true,
    doorId: 'door_bridge',
  },
  door_avionics: {
    id: 'door_avionics',
    x: 380,
    y: 368,
    roomId: 'avionics',
    isDoor: true,
    doorId: 'door_avionics',
  },
  door_life_support: {
    id: 'door_life_support',
    x: 520,
    y: 368,
    roomId: 'life_support',
    isDoor: true,
    doorId: 'door_life_support',
  },
  door_quarters: {
    id: 'door_quarters',
    x: 680,
    y: 368,
    roomId: 'quarters',
    isDoor: true,
    doorId: 'door_quarters',
  },
  door_mess: {
    id: 'door_mess',
    x: 840,
    y: 368,
    roomId: 'mess',
    isDoor: true,
    doorId: 'door_mess',
  },
  airlock_stbd_inner: {
    id: 'airlock_stbd_inner',
    x: 970,
    y: 368,
    roomId: 'airlock_stbd',
    isDoor: true,
    doorId: 'airlock_stbd_inner',
  },

  // Lower Compartment Doors
  door_armory: {
    id: 'door_armory',
    x: 220,
    y: 432,
    roomId: 'armory',
    isDoor: true,
    doorId: 'door_armory',
  },
  airlock_port_inner: {
    id: 'airlock_port_inner',
    x: 380,
    y: 432,
    roomId: 'airlock_port',
    isDoor: true,
    doorId: 'airlock_port_inner',
  },
  door_cargo: {
    id: 'door_cargo',
    x: 600,
    y: 432,
    roomId: 'cargo',
    isDoor: true,
    doorId: 'door_cargo',
  },
  door_eng: {
    id: 'door_eng',
    x: 890,
    y: 432,
    roomId: 'engineering',
    isDoor: true,
    doorId: 'door_eng',
  },

  // Catwalk Spine Conduit Waypoints (spaced along Y = 400)
  corridor_fwd: { id: 'corridor_fwd', x: 220, y: 400, roomId: 'corridor' },
  corridor_avionics: { id: 'corridor_avionics', x: 380, y: 400, roomId: 'corridor' },
  door_spine_fwd: {
    id: 'door_spine_fwd',
    x: 440,
    y: 400,
    roomId: 'corridor',
    isDoor: true,
    doorId: 'door_spine_fwd',
  },
  corridor_life: { id: 'corridor_life', x: 520, y: 400, roomId: 'corridor' },
  corridor_cargo: { id: 'corridor_cargo', x: 600, y: 400, roomId: 'corridor' },
  corridor_quarters: { id: 'corridor_quarters', x: 680, y: 400, roomId: 'corridor' },
  door_spine_aft: {
    id: 'door_spine_aft',
    x: 760,
    y: 400,
    roomId: 'corridor',
    isDoor: true,
    doorId: 'door_spine_aft',
  },
  corridor_mess: { id: 'corridor_mess', x: 840, y: 400, roomId: 'corridor' },
  corridor_eng: { id: 'corridor_eng', x: 890, y: 400, roomId: 'corridor' },
  corridor_aft: { id: 'corridor_aft', x: 970, y: 400, roomId: 'corridor' },
};

const ADJACENCY: Record<string, string[]> = {
  // Upper rooms
  bridge_center: ['door_bridge'],
  door_bridge: ['bridge_center', 'corridor_fwd'],
  avionics_center: ['door_avionics'],
  door_avionics: ['avionics_center', 'corridor_avionics'],
  life_support_center: ['door_life_support'],
  door_life_support: ['life_support_center', 'corridor_life'],
  quarters_center: ['door_quarters'],
  door_quarters: ['quarters_center', 'corridor_quarters'],
  mess_center: ['door_mess'],
  door_mess: ['mess_center', 'corridor_mess'],
  airlock_stbd_center: ['airlock_stbd_inner'],
  airlock_stbd_inner: ['airlock_stbd_center', 'corridor_aft'],

  // Lower rooms
  armory_center: ['door_armory'],
  door_armory: ['armory_center', 'corridor_fwd'],
  airlock_port_center: ['airlock_port_inner'],
  airlock_port_inner: ['airlock_port_center', 'corridor_avionics'],
  cargo_center: ['door_cargo'],
  door_cargo: ['cargo_center', 'corridor_cargo'],
  eng_center: ['door_eng'],
  door_eng: ['eng_center', 'corridor_eng'],

  // Catwalk spine spine chain
  corridor_fwd: ['door_bridge', 'door_armory', 'corridor_avionics'],
  corridor_avionics: ['corridor_fwd', 'door_avionics', 'airlock_port_inner', 'door_spine_fwd'],
  door_spine_fwd: ['corridor_avionics', 'corridor_life'],
  corridor_life: ['door_spine_fwd', 'door_life_support', 'corridor_cargo'],
  corridor_cargo: ['corridor_life', 'door_cargo', 'corridor_quarters'],
  corridor_quarters: ['corridor_cargo', 'door_quarters', 'door_spine_aft'],
  door_spine_aft: ['corridor_quarters', 'corridor_mess'],
  corridor_mess: ['door_spine_aft', 'door_mess', 'corridor_eng'],
  corridor_eng: ['corridor_mess', 'door_eng', 'corridor_aft'],
  corridor_aft: ['corridor_eng', 'airlock_stbd_inner'],
};

export interface NavigationWaypoint {
  x: number;
  y: number;
  id?: string;
  doorId?: string;
}

export interface RoomPortal {
  doorId: string;
  doorX: number;
  doorY: number;
  corridorX: number;
  corridorY: number;
}

export const ROOM_PORTALS: Record<string, RoomPortal> = {
  bridge: { doorId: 'door_bridge', doorX: 220, doorY: 368, corridorX: 220, corridorY: 400 },
  avionics: { doorId: 'door_avionics', doorX: 380, doorY: 368, corridorX: 380, corridorY: 400 },
  life_support: {
    doorId: 'door_life_support',
    doorX: 520,
    doorY: 368,
    corridorX: 520,
    corridorY: 400,
  },
  quarters: { doorId: 'door_quarters', doorX: 680, doorY: 368, corridorX: 680, corridorY: 400 },
  mess: { doorId: 'door_mess', doorX: 840, doorY: 368, corridorX: 840, corridorY: 400 },
  airlock_stbd: {
    doorId: 'airlock_stbd_inner',
    doorX: 970,
    doorY: 368,
    corridorX: 970,
    corridorY: 400,
  },
  armory: { doorId: 'door_armory', doorX: 220, doorY: 432, corridorX: 220, corridorY: 400 },
  airlock_port: {
    doorId: 'airlock_port_inner',
    doorX: 380,
    doorY: 432,
    corridorX: 380,
    corridorY: 400,
  },
  cargo: { doorId: 'door_cargo', doorX: 600, doorY: 432, corridorX: 600, corridorY: 400 },
  engineering: { doorId: 'door_eng', doorX: 890, doorY: 432, corridorX: 890, corridorY: 400 },
};

function getUpperRoom(x: number): string {
  if (x <= 320) return 'bridge';
  if (x <= 440) return 'avionics';
  if (x <= 600) return 'life_support';
  if (x <= 760) return 'quarters';
  if (x <= 920) return 'mess';
  return 'airlock_stbd';
}

function getLowerRoom(x: number): string {
  if (x <= 320) return 'armory';
  if (x <= 440) return 'airlock_port';
  if (x <= 760) return 'cargo';
  return 'engineering';
}

export function getRoomAt(x: number, y: number): string {
  if (y >= 368 && y <= 432) return 'corridor';
  if (y < 368) return getUpperRoom(x);
  return getLowerRoom(x);
}

function appendCorridorTransit(
  path: NavigationWaypoint[],
  fromX: number,
  toX: number,
  corridorY: number
): void {
  if (Math.abs(fromX - toX) > 10) {
    path.push({ x: toX, y: corridorY });
  }
}

// fallow-ignore-next-line complexity
export function findNavigationPath(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number
): NavigationWaypoint[] {
  const startRoom = getRoomAt(startX, startY);
  const targetRoom = getRoomAt(targetX, targetY);

  if (startRoom === targetRoom) {
    return [{ x: targetX, y: targetY }];
  }

  const path: NavigationWaypoint[] = [];

  if (startRoom === 'corridor') {
    const tp = ROOM_PORTALS[targetRoom];
    if (tp) {
      appendCorridorTransit(path, startX, tp.corridorX, tp.corridorY);
      path.push({ x: tp.doorX, y: tp.doorY, doorId: tp.doorId });
    }
  } else if (targetRoom === 'corridor') {
    const sp = ROOM_PORTALS[startRoom];
    if (sp) {
      path.push({ x: sp.doorX, y: sp.doorY, doorId: sp.doorId });
      path.push({ x: sp.corridorX, y: sp.corridorY });
    }
  } else {
    const sp = ROOM_PORTALS[startRoom];
    const tp = ROOM_PORTALS[targetRoom];
    if (sp && tp) {
      path.push({ x: sp.doorX, y: sp.doorY, doorId: sp.doorId });
      path.push({ x: sp.corridorX, y: sp.corridorY });
      appendCorridorTransit(path, sp.corridorX, tp.corridorX, tp.corridorY);
      path.push({ x: tp.doorX, y: tp.doorY, doorId: tp.doorId });
    }
  }

  path.push({ x: targetX, y: targetY });

  while (path.length > 1 && Math.hypot(startX - path[0].x, startY - path[0].y) < 14) {
    path.shift();
  }

  return path;
}

export function getNearestWaypointId(x: number, y: number): string {
  let bestId = 'corridor_cargo';
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
    avionics: 'avionics_center',
    life_support: 'life_support_center',
    quarters: 'quarters_center',
    mess: 'mess_center',
    airlock_stbd: 'airlock_stbd_center',
    corridor: 'corridor_cargo',
    armory: 'armory_center',
    airlock_port: 'airlock_port_center',
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
