/**
 * Hull compiler: room-grid DSL -> rooms, walls, portals, spawns, fixtures, air rooms.
 * Input is compact room rects + adjacency + door/window annotations, NOT hand-placed walls.
 * Compiler cuts exact door gaps (no hand-placed wall pairs), emits window glass panes
 * (sight passes, movement blocks), and wires one air-sim room per RoomNode.
 * Checks: airtightness (hull sealed with all doors closed), connectivity (every room
 * reachable with all doors open), and wall-contact (every portal touches its rooms).
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

const EDGE_EPS = 0.5;

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

/** Wall semantics shared with LOS and collision (M3 adopts these in world wiring). */
export function wallBlocksSight(wall: WallSegment): boolean {
  return wall.isOpaque !== false;
}

export function wallBlocksMovement(wall: WallSegment): boolean {
  return wall.isTraversable !== true;
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
    kind: isWindowPortal(portal) ? 'window' : portal.kind,
    state: initialPortalState(portal),
    cooldownUntilTick: 0,
    areaM2: portal.areaM2,
    segment: { ...portal.segment },
    clearance: portal.clearance ?? 0,
    integrity: 100,
  }));
}

function isWindowPortal(portal: HullPortalSpec): boolean {
  return portal.window === true || portal.kind === 'window';
}

function initialPortalState(portal: HullPortalSpec): PortalEdge['state'] {
  if (isWindowPortal(portal)) return 'closed';
  if (portal.kind === 'open') return 'open';
  return 'closed';
}

interface RectSide {
  readonly name: string;
  readonly horizontal: boolean;
  readonly at: number;
  readonly from: number;
  readonly to: number;
}

interface Interval {
  readonly start: number;
  readonly end: number;
}

function rectSides(rect: Rect): readonly RectSide[] {
  const { x, y, w, h } = rect;
  return [
    { name: 'n', horizontal: true, at: y, from: x, to: x + w },
    { name: 's', horizontal: true, at: y + h, from: x, to: x + w },
    { name: 'w', horizontal: false, at: x, from: y, to: y + h },
    { name: 'e', horizontal: false, at: x + w, from: y, to: y + h },
  ];
}

function compileWalls(spec: HullSpec): WallSegment[] {
  const walls: WallSegment[] = [];
  for (const room of spec.rooms) {
    walls.push(...cutRoomWalls(spec.frameId, room, spec.portals));
  }
  for (const portal of spec.portals) {
    if (isWindowPortal(portal)) walls.push(glassPane(portal));
  }
  return walls;
}

function cutRoomWalls(
  frameId: string,
  room: RoomSpec,
  portals: readonly HullPortalSpec[]
): WallSegment[] {
  const walls: WallSegment[] = [];
  const base = `${frameId}.${room.id}`;
  for (const side of rectSides(room.rect)) {
    const cuts = mergeIntervals(gapsOnSide(side, room.id, portals));
    const pieces = subtractIntervals(side.from, side.to, cuts);
    pieces.forEach((piece, index) => {
      walls.push(
        pieceWall(
          pieces.length === 1 ? `${base}.${side.name}` : `${base}.${side.name}.${index}`,
          side,
          piece
        )
      );
    });
  }
  return walls;
}

function gapsOnSide(
  side: RectSide,
  roomId: string,
  portals: readonly HullPortalSpec[]
): Interval[] {
  const gaps: Interval[] = [];
  for (const portal of portals) {
    if (portal.roomA !== roomId && portal.roomB !== roomId) continue;
    const overlap = overlapOnSide(side, portal.segment);
    if (overlap !== undefined) gaps.push(overlap);
  }
  return gaps;
}

function overlapOnSide(side: RectSide, segment: HullPortalSpec['segment']): Interval | undefined {
  if (side.horizontal) {
    if (Math.abs(segment.y1 - side.at) > EDGE_EPS) return undefined;
    if (Math.abs(segment.y2 - side.at) > EDGE_EPS) return undefined;
    return clipInterval(side, Math.min(segment.x1, segment.x2), Math.max(segment.x1, segment.x2));
  }
  if (Math.abs(segment.x1 - side.at) > EDGE_EPS) return undefined;
  if (Math.abs(segment.x2 - side.at) > EDGE_EPS) return undefined;
  return clipInterval(side, Math.min(segment.y1, segment.y2), Math.max(segment.y1, segment.y2));
}

function clipInterval(side: RectSide, start: number, end: number): Interval | undefined {
  const clipped = { start: Math.max(start, side.from), end: Math.min(end, side.to) };
  return clipped.end - clipped.start > EDGE_EPS ? clipped : undefined;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last === undefined || current.start > last.end + EDGE_EPS) {
      merged.push(current);
    } else if (current.end > last.end) {
      merged[merged.length - 1] = { start: last.start, end: current.end };
    }
  }
  return merged;
}

function subtractIntervals(from: number, to: number, cuts: Interval[]): Interval[] {
  const pieces: Interval[] = [];
  let cursor = from;
  for (const cut of cuts) {
    if (cut.start > cursor + EDGE_EPS) {
      pieces.push({ start: cursor, end: Math.min(cut.start, to) });
    }
    cursor = Math.max(cursor, cut.end);
  }
  if (cursor < to - EDGE_EPS) pieces.push({ start: cursor, end: to });
  return pieces;
}

function pieceWall(id: string, side: RectSide, piece: Interval): WallSegment {
  if (side.horizontal) {
    return { id, x1: piece.start, y1: side.at, x2: piece.end, y2: side.at, isOpaque: true };
  }
  return { id, x1: side.at, y1: piece.start, x2: side.at, y2: piece.end, isOpaque: true };
}

function glassPane(portal: HullPortalSpec): WallSegment {
  return {
    id: `portal.${portal.id}`,
    x1: portal.segment.x1,
    y1: portal.segment.y1,
    x2: portal.segment.x2,
    y2: portal.segment.y2,
    isOpaque: false,
    isTraversable: false,
    isWindow: true,
  };
}

function checkHull(
  spec: HullSpec,
  rooms: readonly RoomNode[],
  portals: readonly PortalEdge[]
): string[] {
  const errors: string[] = [];
  errors.push(...checkRoomRefs(spec, rooms));
  errors.push(...checkWallContacts(spec));
  errors.push(...checkConnectivity(spec, portals));
  errors.push(...checkSealedHull(spec));
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

function checkWallContacts(spec: HullSpec): string[] {
  const byId = new Map(spec.rooms.map((room) => [room.id, room] as const));
  const errors: string[] = [];
  for (const portal of spec.portals) {
    const roomA = byId.get(portal.roomA);
    if (roomA !== undefined && !touchesRoom(roomA.rect, portal.segment)) {
      errors.push(`portal ${portal.id} touches no wall of room ${portal.roomA}`);
    }
    const roomB = byId.get(portal.roomB);
    if (roomB !== undefined && !touchesRoom(roomB.rect, portal.segment)) {
      errors.push(`portal ${portal.id} touches no wall of room ${portal.roomB}`);
    }
  }
  return errors;
}

function touchesRoom(rect: Rect, segment: HullPortalSpec['segment']): boolean {
  return rectSides(rect).some((side) => overlapOnSide(side, segment) !== undefined);
}

function bfsReachable(adjacency: Map<string, string[]>, start: string): Set<string> {
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
  return visited;
}

function checkConnectivity(spec: HullSpec, portals: readonly PortalEdge[]): string[] {
  if (spec.rooms.length === 0) return [];
  const start = spec.rooms[0]?.id;
  if (start === undefined) return [];
  const visited = bfsReachable(buildAdjacency(portals), start);
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
    if (portal.kind === 'window') continue;
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

function checkSealedHull(spec: HullSpec): string[] {
  const errors: string[] = [];
  for (const portal of spec.portals) {
    if (portal.roomB !== 'vacuum' && portal.roomB !== 'space') continue;
    if (portal.kind === 'hole') {
      errors.push(`exterior portal ${portal.id} is an open hole in the hull`);
    } else if (portal.kind === 'open' && !portal.window && portal.areaM2 > 0) {
      errors.push(`exterior portal ${portal.id} is an unsealed opening in the hull`);
    }
  }
  return errors;
}
