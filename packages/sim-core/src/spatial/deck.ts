/**
 * Render-data adapter. Every export keeps its legacy name and shape, but all
 * DATA is compiled from the harbor hull specs (station at origin, ship
 * frame-LOCAL: consumers add the ship offset themselves, so baking it
 * here would double the offset). Passes, audio, and shared math
 * consume this file; the compiler guarantees door gaps.
 *
 * ID conventions: rooms, lights, ambients, and breach locations use BARE ids
 * (e.g. 'bruecke', 'habitat') so existing color/type maps keep
 * hitting. Doors use NAMESPACED ids ('station.habitat_korridor') to join live
 * snapshot portals directly. harborStatic() exposes the framed, namespaced
 * view (local coords + origins) for new clients.
 */

import type {
  DeckDefinition,
  StartingRole,
  StationFixture,
  WallSegment,
} from '@kybernetes/protocol';
import { HesperiaV2Spec } from '../world/content/HesperiaV2.hull.js';
import { StationHubSpec } from '../world/content/StationHub.hull.js';
import { compileHull, toLegacyWalls } from '../world/hullCompiler.js';
import { SHIP_ORIGIN } from '../world/schedule.js';

export interface RoomDefinition {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tag: string;
}

interface LocalRoom {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  frame: 'station' | 'ship';
}

const ROOM_NAMES: Record<string, string> = {
  habitat: 'Habitat 1-4',
  medizin: 'Medbay',
  sicherheit_nord: 'Security North',
  korridor_mitte: 'Central Corridor',
  kommando: 'Command Bridge',
  hydroponik: 'Hydroponics',
  frachthalle: 'Freight Hall',
  reaktorraum: 'Reactor Room',
  sicherheit_sued: 'Security South',
  korridor_ost: 'East Dock Spine',
  andock_a: 'Docking Airlock A',
  bruecke: 'Ship Bridge',
  kajute_nord: 'Cabin North',
  kajute_sued: 'Cabin South',
  korridor_schiff: 'Ship Corridor',
  reaktor_antrieb: 'Reactor & Drive',
};

function titleize(id: string): string {
  const named = ROOM_NAMES[id];
  if (named !== undefined) return named;
  return id
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const stationHull = compileHull({ ...StationHubSpec, frameId: 'station' });
const shipHull = compileHull({ ...HesperiaV2Spec, frameId: 'ship' });

const LOCAL_ROOMS: LocalRoom[] = [
  ...stationHull.rooms.map((room) => ({
    id: room.id,
    name: titleize(room.id),
    x: room.rect.x,
    y: room.rect.y,
    width: room.rect.w,
    height: room.rect.h,
    frame: 'station' as const,
  })),
  ...shipHull.rooms.map((room) => ({
    id: room.id,
    name: titleize(room.id),
    x: room.rect.x,
    y: room.rect.y,
    width: room.rect.w,
    height: room.rect.h,
    frame: 'ship' as const,
  })),
];

const STATION_WALLS: WallSegment[] = toLegacyWalls(stationHull);
const SHIP_WALLS_LOCAL: WallSegment[] = toLegacyWalls(shipHull);

const SHIP_WALL_IDS = new Set(SHIP_WALLS_LOCAL.map((wall) => wall.id));

export const HESPERIA_ROOMS: RoomDefinition[] = LOCAL_ROOMS.map((room) => ({
  id: room.id,
  name: room.name,
  x: room.x,
  y: room.y,
  width: room.width,
  height: room.height,
  tag: room.frame,
}));

export const STATION_BAY_SPAWN = { x: 410, y: 380 };

/**
 * Ship walls stay frame-LOCAL: every consumer (renderer, DeckPass,
 * visibility, framed movement) adds the ship offset itself. World-baking here
 * would double the offset. Station walls sit at the origin either way.
 */
export const HESPERIA_WALLS: WallSegment[] = [...STATION_WALLS, ...SHIP_WALLS_LOCAL];

/**
 * Fixtures compiled from harbor rooms (frame-LOCAL like walls/doors; the
 * renderer offsets ship fixtures via getWorldStations). deckId tags the
 * frame: 'station' fixtures stay fixed, everything else rides the ship.
 */
export const HESPERIA_STATIONS: StationFixture[] = [
  {
    id: 'bridge_helm',
    deckId: 'ship',
    name: 'Ship Bridge Helm',
    stationType: 'bridge',
    x: 140,
    y: 65,
    radius: 28,
    prompt: '[E] Access Navigation Helm',
  },
  {
    id: 'kajute_nord_pods',
    deckId: 'ship',
    name: 'Cabin North Pods',
    stationType: 'bunk',
    x: 140,
    y: 205,
    radius: 28,
    prompt: '[E] Rest In Pod',
  },
  {
    id: 'kajute_sued_pods',
    deckId: 'ship',
    name: 'Cabin South Pods',
    stationType: 'bunk',
    x: 140,
    y: 355,
    radius: 28,
    prompt: '[E] Rest In Pod',
  },
  {
    id: 'korridor_airlock_console',
    deckId: 'ship',
    name: 'Corridor Airlock Console',
    stationType: 'airlock',
    x: 30,
    y: 340,
    radius: 24,
    prompt: '[E] Cycle Airlock',
  },
  {
    id: 'reaktor_antrieb_console',
    deckId: 'ship',
    name: 'Reactor Drive Monitor',
    stationType: 'reactor',
    x: 140,
    y: 565,
    radius: 28,
    prompt: '[E] Access Reactor Console',
  },
  {
    id: 'habitat_bunks',
    deckId: 'station',
    name: 'Habitat Bunks',
    stationType: 'bunk',
    x: 160,
    y: 100,
    radius: 28,
    prompt: '[E] Rest In Pod',
  },
  {
    id: 'korridor_job_board',
    deckId: 'station',
    name: 'Central Job Board',
    stationType: 'job_board',
    x: 460,
    y: 240,
    radius: 30,
    prompt: '[E] Browse Contracts',
  },
  {
    id: 'andock_console',
    deckId: 'station',
    name: 'Airlock A Console',
    stationType: 'airlock',
    x: 1080,
    y: 260,
    radius: 24,
    prompt: '[E] Cycle Airlock',
  },
  {
    id: 'medizin_beds',
    deckId: 'station',
    name: 'Medbay Beds',
    stationType: 'bunk',
    x: 480,
    y: 100,
    radius: 28,
    prompt: '[E] Rest In Bed',
  },
  {
    id: 'medizin_terminal',
    deckId: 'station',
    name: 'Medbay Terminal',
    stationType: 'avionics',
    x: 580,
    y: 60,
    radius: 22,
    prompt: '[E] Calibrate Med Systems',
  },
  {
    id: 'hydroponik_trays',
    deckId: 'station',
    name: 'Hydroponics Trays',
    stationType: 'hydroponics',
    x: 220,
    y: 380,
    radius: 28,
    prompt: '[E] Tend Trays',
  },
  {
    id: 'fracht_winch',
    deckId: 'station',
    name: 'Freight Winch',
    stationType: 'cargo',
    x: 410,
    y: 380,
    radius: 28,
    prompt: '[E] Operate Winch',
  },
  {
    id: 'reaktorraum_console',
    deckId: 'station',
    name: 'Reactor Core Monitor',
    stationType: 'reactor',
    x: 620,
    y: 380,
    radius: 28,
    prompt: '[E] Access Reactor Console',
  },
  {
    id: 'kommando_helm',
    deckId: 'station',
    name: 'Command Helm',
    stationType: 'bridge',
    x: 70,
    y: 380,
    radius: 28,
    prompt: '[E] Access Command Helm',
  },
  {
    id: 'sicherheit_nord_locker',
    deckId: 'station',
    name: 'Security North Locker',
    stationType: 'armory',
    x: 780,
    y: 100,
    radius: 24,
    prompt: '[E] Open Arms Locker',
  },
  {
    id: 'sicherheit_sued_locker',
    deckId: 'station',
    name: 'Security South Locker',
    stationType: 'armory',
    x: 820,
    y: 380,
    radius: 24,
    prompt: '[E] Open Arms Locker',
  },
];

export const HESPERIA_SPAWNS: Record<StartingRole, { x: number; y: number }> = {
  wiper: { x: 1035, y: 260 },
  galley_hand: { x: 100, y: 240 },
  security_private: { x: 140, y: 65 },
  hydro_tender: { x: 220, y: 380 },
  stevedore: { x: 140, y: 565 },
};

export const DEFAULT_DECK: DeckDefinition = {
  id: 'harbor_main',
  name: 'Harbor + CSS Hesperia',
  width: 2400,
  height: 800,
  walls: HESPERIA_WALLS,
  stations: HESPERIA_STATIONS,
  spawnPoints: HESPERIA_SPAWNS,
};

export function createDefaultDeck(): DeckDefinition {
  return { ...DEFAULT_DECK };
}

export interface LightDefinition {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  intensity: number;
  color: [number, number, number];
  room?: string;
  flickerSpeed?: number;
  flickerAmount?: number;
}

export const HESPERIA_LIGHTS: LightDefinition[] = LOCAL_ROOMS.map((room) => ({
  id: `light_${room.id}`,
  name: `${room.name} Lamp`,
  x: room.x + room.width / 2,
  y: room.y + room.height / 2,
  radius: Math.min(Math.max(room.width, room.height) * 0.8, 220),
  intensity: 1.05,
  color: [1.0, 0.88, 0.72],
  room: room.id,
  ...(room.id === 'reaktor_antrieb' || room.id === 'reaktorraum'
    ? { flickerSpeed: 7, flickerAmount: 0.12 }
    : {}),
}));

export const ROOM_AMBIENTS: Record<string, [number, number, number]> = {
  korridor_mitte: [0.06, 0.07, 0.1],
  korridor_schiff: [0.06, 0.07, 0.1],
  korridor_ost: [0.08, 0.09, 0.12],
  bruecke: [0.22, 0.28, 0.35],
  kommando: [0.22, 0.28, 0.35],
  hydroponik: [0.2, 0.28, 0.22],
  habitat: [0.26, 0.24, 0.22],
  kajute_nord: [0.26, 0.24, 0.22],
  kajute_sued: [0.26, 0.24, 0.22],
  medizin: [0.3, 0.3, 0.28],
  sicherheit_nord: [0.22, 0.22, 0.26],
  sicherheit_sued: [0.22, 0.22, 0.26],
  frachthalle: [0.2, 0.2, 0.2],
  reaktor_antrieb: [0.24, 0.2, 0.2],
  reaktorraum: [0.24, 0.2, 0.2],
  andock_a: [0.16, 0.2, 0.26],
};

export interface BreachLocation {
  roomId: string;
  wallId: string;
  x: number;
  y: number;
  normalX: number;
  normalY: number;
}

function nearestWall(x: number, y: number): WallSegment | undefined {
  let best: WallSegment | undefined;
  let bestDist = 8;
  for (const wall of HESPERIA_WALLS) {
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    const t = Math.min(1, Math.max(0, ((x - wall.x1) * dx + (y - wall.y1) * dy) / lenSq));
    const dist = Math.hypot(x - (wall.x1 + dx * t), y - (wall.y1 + dy * t));
    if (dist < bestDist) {
      bestDist = dist;
      best = wall;
    }
  }
  return best;
}

function wallNormal(
  wall: WallSegment,
  roomX: number,
  roomY: number
): { normalX: number; normalY: number } {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy) || 1;
  const midX = (wall.x1 + wall.x2) / 2;
  const midY = (wall.y1 + wall.y2) / 2;
  const nx = -dy / len;
  const ny = dx / len;
  const dot = (midX + nx - roomX) * nx + (midY + ny - roomY) * ny;
  return dot >= 0 ? { normalX: nx, normalY: ny } : { normalX: -nx, normalY: -ny };
}

export function normalizeBreachRoomId(breachId: string): string {
  const bare = breachId.includes('.') ? (breachId.split('.').pop() ?? breachId) : breachId;
  if (bare.startsWith('puncture_')) {
    const parts = bare.split('_');
    if (parts.length >= 4) {
      const yStr = parts[parts.length - 1];
      const xStr = parts[parts.length - 2];
      if (!Number.isNaN(Number(xStr)) && !Number.isNaN(Number(yStr))) {
        const roomParts = parts.slice(1, parts.length - 2);
        const clean = roomParts.join('_');
        return clean === 'reactor' ? 'engineering' : clean;
      }
    }
    const clean = bare.replace('puncture_', '');
    return clean === 'reactor' ? 'engineering' : clean;
  }
  return bare === 'reactor' ? 'engineering' : bare;
}

export function getBreachLocation(breachId: string): BreachLocation | null {
  if (!breachId) return null;
  const bare = breachId.includes('.') ? (breachId.split('.').pop() ?? breachId) : breachId;
  if (bare.startsWith('puncture_')) {
    const parts = bare.split('_');
    if (parts.length >= 4) {
      const y = Number.parseInt(parts[parts.length - 1], 10);
      const x = Number.parseInt(parts[parts.length - 2], 10);
      if (!Number.isNaN(x) && !Number.isNaN(y)) {
        const roomId = normalizeBreachRoomId(breachId);
        const wall = nearestWall(x, y);
        const room = HESPERIA_ROOMS.find((entry) => entry.id === roomId);
        const normal =
          wall === undefined || room === undefined
            ? { normalX: 0, normalY: -1 }
            : wallNormal(wall, room.x + room.width / 2, room.y + room.height / 2);
        return {
          roomId,
          wallId: wall ? wall.id : 'hull_top_l',
          x,
          y,
          normalX: normal.normalX,
          normalY: normal.normalY,
        };
      }
    }
  }
  const norm = normalizeBreachRoomId(breachId);
  return HESPERIA_BREACH_LOCATIONS[norm] || null;
}

function roomTopAnchor(room: LocalRoom): { x: number; y: number } {
  return { x: room.x + room.width / 2, y: room.y };
}

export const HESPERIA_BREACH_LOCATIONS: Record<string, BreachLocation> = Object.fromEntries(
  LOCAL_ROOMS.map((room) => {
    const anchor = roomTopAnchor(room);
    const wall = nearestWall(anchor.x, anchor.y);
    const normal =
      wall === undefined
        ? { normalX: 0, normalY: -1 }
        : wallNormal(wall, anchor.x, anchor.y + room.height / 2);
    return [
      room.id,
      {
        roomId: room.id,
        wallId: wall?.id ?? 'hull_top_l',
        x: anchor.x,
        y: anchor.y,
        normalX: normal.normalX,
        normalY: normal.normalY,
      },
    ];
  })
);

export function carveBreachedWallSegments(
  walls: WallSegment[],
  breaches: string[] = [],
  gapSize = 18
): WallSegment[] {
  if (!breaches || breaches.length === 0) return walls;

  const halfGap = gapSize / 2;
  const activeLocs = breaches
    .map((b) => getBreachLocation(b))
    .filter((loc): loc is BreachLocation => Boolean(loc));

  if (activeLocs.length === 0) return walls;

  const carved: WallSegment[] = [];
  for (const wall of walls) {
    const wallBreaches = findBreachesOnWall(wall, activeLocs, halfGap);
    if (wallBreaches.length === 0) {
      carved.push(wall);
    } else {
      carved.push(...carveWallAtBreaches(wall, wallBreaches, halfGap));
    }
  }

  return carved;
}

interface BreachPointOnWall {
  t: number;
  x: number;
  y: number;
}

function findBreachesOnWall(
  wall: WallSegment,
  activeLocs: BreachLocation[],
  halfGap: number
): BreachPointOnWall[] {
  const isHorizontal = Math.abs(wall.y1 - wall.y2) < 1;
  const isVertical = Math.abs(wall.x1 - wall.x2) < 1;
  const list: BreachPointOnWall[] = [];

  for (const loc of activeLocs) {
    if (isHorizontal && Math.abs(loc.y - wall.y1) < 4) {
      const minX = Math.min(wall.x1, wall.x2);
      const maxX = Math.max(wall.x1, wall.x2);
      if (loc.x >= minX - 1 && loc.x <= maxX + 1) {
        const clampedX = Math.max(minX + halfGap, Math.min(maxX - halfGap, loc.x));
        const t = (clampedX - wall.x1) / (wall.x2 - wall.x1);
        list.push({ t, x: clampedX, y: loc.y });
      }
    } else if (isVertical && Math.abs(loc.x - wall.x1) < 4) {
      const minY = Math.min(wall.y1, wall.y2);
      const maxY = Math.max(wall.y1, wall.y2);
      if (loc.y >= minY - 1 && loc.y <= maxY + 1) {
        const clampedY = Math.max(minY + halfGap, Math.min(maxY - halfGap, loc.y));
        const t = (clampedY - wall.y1) / (wall.y2 - wall.y1);
        list.push({ t, x: loc.x, y: clampedY });
      }
    }
  }

  return list.sort((a, b) => a.t - b.t);
}

function carveWallAtBreaches(
  wall: WallSegment,
  breaches: BreachPointOnWall[],
  halfGap: number
): WallSegment[] {
  const isHorizontal = Math.abs(wall.y1 - wall.y2) < 1;
  const segments: WallSegment[] = [];
  let currX = wall.x1;
  let currY = wall.y1;

  for (let i = 0; i < breaches.length; i++) {
    const b = breaches[i];
    if (b === undefined) continue;
    const dir = isHorizontal ? (wall.x2 > wall.x1 ? 1 : -1) : wall.y2 > wall.y1 ? 1 : -1;
    const p2X = isHorizontal ? b.x - dir * halfGap : wall.x1;
    const p2Y = isHorizontal ? wall.y1 : b.y - dir * halfGap;

    if (Math.hypot(p2X - currX, p2Y - currY) > 1) {
      segments.push({ ...wall, id: `${wall.id}_br_${i}`, x1: currX, y1: currY, x2: p2X, y2: p2Y });
    }
    currX = isHorizontal ? b.x + dir * halfGap : wall.x1;
    currY = isHorizontal ? wall.y1 : b.y + dir * halfGap;
  }

  if (Math.hypot(wall.x2 - currX, wall.y2 - currY) > 1) {
    segments.push({
      ...wall,
      id: `${wall.id}_br_tail`,
      x1: currX,
      y1: currY,
      x2: wall.x2,
      y2: wall.y2,
    });
  }

  return segments;
}

export interface DockFrameOffset {
  x: number;
  y: number;
}

export const SHIP_ROOM_IDS = new Set<string>([
  'bruecke',
  'kajute_nord',
  'kajute_sued',
  'korridor_schiff',
  'reaktor_antrieb',
]);

export function isShipSideRoom(roomId: string): boolean {
  const bare = roomId.includes('.') ? (roomId.split('.').pop() ?? roomId) : roomId;
  return SHIP_ROOM_IDS.has(roomId) || SHIP_ROOM_IDS.has(bare);
}

export const STATION_ROOM_IDS = new Set<string>([
  'habitat',
  'medizin',
  'sicherheit_nord',
  'korridor_mitte',
  'kommando',
  'hydroponik',
  'frachthalle',
  'reaktorraum',
  'sicherheit_sued',
  'korridor_ost',
  'andock_a',
]);

export function isStationRoom(roomId: string): boolean {
  const bare = roomId.includes('.') ? (roomId.split('.').pop() ?? roomId) : roomId;
  return STATION_ROOM_IDS.has(roomId) || STATION_ROOM_IDS.has(bare);
}

export function toShipLocal(
  x: number,
  y: number,
  offset: DockFrameOffset
): { x: number; y: number } {
  return {
    x: Number((x - offset.x).toFixed(2)),
    y: Number((y - offset.y).toFixed(2)),
  };
}

export function toWorld(x: number, y: number, offset: DockFrameOffset): { x: number; y: number } {
  return {
    x: Number((x + offset.x).toFixed(2)),
    y: Number((y + offset.y).toFixed(2)),
  };
}

export function findWorldRoom(x: number, y: number, offset: DockFrameOffset): string | null {
  for (const r of HESPERIA_ROOMS) {
    const shipSide = isShipSideRoom(r.id);
    const rx = shipSide ? r.x + offset.x : r.x;
    const ry = shipSide ? r.y + offset.y : r.y;
    if (x >= rx && x <= rx + r.width && y >= ry && y <= ry + r.height) {
      return r.id;
    }
  }
  return null;
}

export function isAboardShip(x: number, y: number, offset: DockFrameOffset): boolean {
  const roomId = findWorldRoom(x, y, offset);
  return roomId !== null && isShipSideRoom(roomId);
}

export function isShipSideWall(wall: WallSegment): boolean {
  return SHIP_WALL_IDS.has(wall.id);
}

export function getShipFrameWalls(): WallSegment[] {
  return HESPERIA_WALLS.filter((w) => isShipSideWall(w));
}

export function partitionFrameWalls(walls: WallSegment[]): {
  ship: WallSegment[];
  station: WallSegment[];
} {
  return {
    ship: walls.filter((w) => isShipSideWall(w)),
    station: walls.filter((w) => !isShipSideWall(w)),
  };
}

export function getStationFrameWalls(): WallSegment[] {
  return HESPERIA_WALLS.filter((w) => !isShipSideWall(w));
}

export function getWorldRooms(offset: DockFrameOffset): RoomDefinition[] {
  return HESPERIA_ROOMS.map((r) => {
    if (!isShipSideRoom(r.id)) return r;
    return { ...r, x: r.x + offset.x, y: r.y + offset.y };
  });
}

export function getWorldStations(offset: DockFrameOffset): StationFixture[] {
  return HESPERIA_STATIONS.map((station) => {
    if (station.deckId === 'station') return station;
    return { ...station, x: station.x + offset.x, y: station.y + offset.y };
  });
}

export function getWorldLights(offset: DockFrameOffset): LightDefinition[] {
  return HESPERIA_LIGHTS.map((l) => {
    if (!l.room || !isShipSideRoom(l.room)) return l;
    return { ...l, x: l.x + offset.x, y: l.y + offset.y };
  });
}

export function applyShipOffsetToWalls(
  walls: WallSegment[],
  offset: DockFrameOffset
): WallSegment[] {
  return walls.map((w) => {
    if (!isShipSideWall(w)) return w;
    return {
      ...w,
      x1: w.x1 + offset.x,
      y1: w.y1 + offset.y,
      x2: w.x2 + offset.x,
      y2: w.y2 + offset.y,
    };
  });
}

export function findRoomAtHullImpact(x: number, y: number): string | null {
  for (const r of HESPERIA_ROOMS) {
    const ox = isShipSideRoom(r.id) ? SHIP_ORIGIN.x : 0;
    const oy = isShipSideRoom(r.id) ? SHIP_ORIGIN.y : 0;
    if (
      x >= r.x + ox - 4 &&
      x <= r.x + ox + r.width + 4 &&
      y >= r.y + oy - 4 &&
      y <= r.y + oy + r.height + 4
    ) {
      return r.id;
    }
  }
  return null;
}

export interface HarborStaticPortal {
  id: string;
  roomA: string;
  roomB: string;
  kind: string;
  segment: { x1: number; y1: number; x2: number; y2: number };
}

export interface HarborStaticFrame {
  frameId: string;
  origin: { x: number; y: number };
  rooms: { id: string; rect: { x: number; y: number; w: number; h: number } }[];
  walls: WallSegment[];
  portals: HarborStaticPortal[];
  spawns: Record<string, { x: number; y: number }>;
}

function staticPortals(
  compiled: {
    portals: readonly {
      id: string;
      roomA: string;
      roomB: string;
      kind: string;
      segment: { x1: number; y1: number; x2: number; y2: number };
    }[];
  },
  frameId: string
): HarborStaticPortal[] {
  return compiled.portals.map((portal) => ({
    id: `${frameId}.${portal.id}`,
    roomA: `${frameId}.${portal.roomA}`,
    roomB:
      portal.roomB === 'vacuum' || portal.roomB === 'space'
        ? portal.roomB
        : `${frameId}.${portal.roomB}`,
    kind: portal.kind,
    segment: { ...portal.segment },
  }));
}

export function harborStatic(): HarborStaticFrame[] {
  return [
    {
      frameId: 'station',
      origin: { x: 0, y: 0 },
      rooms: stationHull.rooms.map((room) => ({
        id: `station.${room.id}`,
        rect: { ...room.rect },
      })),
      walls: STATION_WALLS,
      portals: staticPortals(stationHull, 'station'),
      spawns: { ...(StationHubSpec.spawns ?? {}) },
    },
    {
      frameId: 'ship',
      origin: { ...SHIP_ORIGIN },
      rooms: shipHull.rooms.map((room) => ({
        id: `ship.${room.id}`,
        rect: { ...room.rect },
      })),
      walls: SHIP_WALLS_LOCAL,
      portals: staticPortals(shipHull, 'ship'),
      spawns: { ...(HesperiaV2Spec.spawns ?? {}) },
    },
  ];
}
