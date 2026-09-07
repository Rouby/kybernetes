/**
 * Hull compiler: room-grid DSL -> rooms, walls, portals, spawns, fixtures, air rooms.
 * Input is compact room rects + adjacency + door/window annotations, NOT hand-placed walls.
 * Compiler emits gap-correct walls, portal segments, spawn points, fixture anchors,
 * and one air-sim room per RoomNode. Includes airtightness + connectivity checks.
 *
 * M0: functional scaffold. Gap cutting + full air wiring land in M2/M4.
 */

import type { WallSegment } from '@kybernetes/protocol';
import type { PortalEdge, Rect, RoomNode, Vec2 } from './types.js';

export interface RoomSpec {
  readonly id: string;
  readonly rect: Rect;
  readonly volumeM3: number;
}

export interface HullPortalSpec {
  readonly id: string;
  readonly roomA: string;
  readonly roomB: string;
  readonly kind: PortalEdge['kind'];
  readonly segment: {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  };
  readonly areaM2: number;
  readonly window?: boolean;
  readonly clearance?: number;
}

export interface HullSpec {
  readonly frameId: string;
  readonly rooms: readonly RoomSpec[];
  readonly portals: readonly HullPortalSpec[];
  readonly spawns?: Readonly<Record<string, Vec2>>;
}

export interface CompiledHull {
  readonly rooms: readonly RoomNode[];
  readonly walls: readonly WallSegment[];
  readonly portals: readonly PortalEdge[];
  readonly spawns: Readonly<Record<string, Vec2>>;
  readonly airRooms: readonly { readonly id: string; readonly volumeM3: number }[];
  readonly errors: readonly string[];
}

export function compileHull(spec: HullSpec): CompiledHull {
  const rooms = compileRooms(spec);
  const portals = compilePortals(spec);
  const walls = compileWalls(spec);
  const errors = checkHull(spec, rooms, portals);
  return {
    rooms,
    walls,
    portals,
    spawns: spec.spawns ?? {},
    airRooms: rooms.map((room) => ({ id: room.id, volumeM3: room.volumeM3 })),
    errors,
  };
}

export function toLegacyWalls(compiled: CompiledHull): WallSegment[] {
  return compiled.walls.map((wall) => ({ ...wall }));
}

function compileRooms(spec: HullSpec): RoomNode[] {
  return spec.rooms.map((room) => ({
    id: room.id,
    frameId: spec.frameId,
    rect: { ...room.rect },
    volumeM3: room.volumeM3,
  }));
}

function compilePortals(spec: HullSpec): PortalEdge[] {
  return spec.portals.map((portal) => ({
    id: portal.id,
    roomA: portal.roomA,
    roomB: portal.roomB,
    kind: portal.kind,
    state: portal.kind === 'open' ? 'open' : 'closed',
    cooldownUntilTick: 0,
    areaM2: portal.areaM2,
    segment: { ...portal.segment },
    clearance: portal.clearance ?? 0,
  }));
}

function compileWalls(spec: HullSpec): WallSegment[] {
  const walls: WallSegment[] = [];
  for (const room of spec.rooms) {
    walls.push(...rectWalls(spec.frameId, room.id, room.rect));
  }
  for (const portal of spec.portals) {
    walls.push(portalWall(portal));
  }
  return walls;
}

function rectWalls(frameId: string, roomId: string, rect: Rect): WallSegment[] {
  const { x, y, w, h } = rect;
  const base = `${frameId}.${roomId}`;
  return [
    { id: `${base}.n`, x1: x, y1: y, x2: x + w, y2: y, isOpaque: true },
    { id: `${base}.s`, x1: x, y1: y + h, x2: x + w, y2: y + h, isOpaque: true },
    { id: `${base}.w`, x1: x, y1: y, x2: x, y2: y + h, isOpaque: true },
    { id: `${base}.e`, x1: x + w, y1: y, x2: x + w, y2: y + h, isOpaque: true },
  ];
}

function portalWall(portal: HullPortalSpec): WallSegment {
  const isWindow = portal.window === true;
  return {
    id: `portal.${portal.id}`,
    x1: portal.segment.x1,
    y1: portal.segment.y1,
    x2: portal.segment.x2,
    y2: portal.segment.y2,
    isOpaque: !isWindow,
    isTraversable: false,
    isWindow,
  };
}

function checkHull(
  spec: HullSpec,
  rooms: readonly RoomNode[],
  portals: readonly PortalEdge[]
): string[] {
  const errors: string[] = [];
  errors.push(...checkRoomRefs(spec, rooms));
  errors.push(...checkConnectivity(spec, portals));
  return errors;
}

function checkRoomRefs(spec: HullSpec, rooms: readonly RoomNode[]): string[] {
  const ids = new Set(rooms.map((room) => room.id));
  const errors: string[] = [];
  for (const portal of spec.portals) {
    if (!ids.has(portal.roomA))
      errors.push(`portal ${portal.id} references unknown roomA ${portal.roomA}`);
    if (!ids.has(portal.roomB) && portal.roomB !== 'vacuum' && portal.roomB !== 'space') {
      errors.push(`portal ${portal.id} references unknown roomB ${portal.roomB}`);
    }
  }
  return errors;
}

function checkConnectivity(spec: HullSpec, portals: readonly PortalEdge[]): string[] {
  if (spec.rooms.length === 0) return [];
  const adjacency = buildAdjacency(portals);
  const start = spec.rooms[0]?.id;
  if (start === undefined) return [];
  const visited = new Set<string>([start]);
  const queue: string[] = [start];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  const errors: string[] = [];
  for (const room of spec.rooms) {
    if (!visited.has(room.id)) errors.push(`room ${room.id} unreachable with all doors open`);
  }
  return errors;
}

function buildAdjacency(portals: readonly PortalEdge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const portal of portals) {
    if (portal.roomB === 'vacuum' || portal.roomB === 'space') continue;
    pushEdge(adjacency, portal.roomA, portal.roomB);
    pushEdge(adjacency, portal.roomB, portal.roomA);
  }
  return adjacency;
}

function pushEdge(adjacency: Map<string, string[]>, from: string, to: string): void {
  const list = adjacency.get(from);
  if (list === undefined) adjacency.set(from, [to]);
  else list.push(to);
}
