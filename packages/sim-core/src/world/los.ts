/**
 * Line-of-sight and room visibility on the portal graph.
 * Sight blockers are opaque walls plus shut-portal segments; window panes
 * (opaque false) never block. M3 slice: room visibility is the pawn's room
 * plus directly visible neighbors (shared open/window portals, depth 1).
 * Full visibility polygons are an explicit follow-up.
 */

import { segmentsIntersect } from '../spatial/collision.js';
import { isPortalConnecting } from './doors.js';
import type { PawnBody, PortalEdge, Vec2, World } from './types.js';

export interface SightSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export function hasLineOfSight(blockers: readonly SightSegment[], from: Vec2, to: Vec2): boolean {
  for (const blocker of blockers) {
    if (
      segmentsIntersect(
        { x: from.x, y: from.y },
        { x: to.x, y: to.y },
        { x: blocker.x1, y: blocker.y1 },
        { x: blocker.x2, y: blocker.y2 }
      )
    ) {
      return false;
    }
  }
  return true;
}

export function sightBlockers(world: World, frameId: string): SightSegment[] {
  const blockers: SightSegment[] = [];
  for (const wall of world.wallsByFrame[frameId] ?? []) {
    if (wall.isOpaque === false) continue;
    blockers.push({ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 });
  }
  for (const portal of Object.values(world.portals)) {
    if (portal.kind === 'window') continue;
    if (isPortalConnecting(portal)) continue;
    const room = world.rooms[portal.roomA];
    if (room === undefined || room.frameId !== frameId) continue;
    blockers.push({ ...portal.segment });
  }
  return blockers;
}

export function visibleRooms(world: World, pawnId: string): string[] {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) return [];
  const visible = new Set<string>([pawn.roomHint]);
  for (const portal of Object.values(world.portals)) {
    const other = neighborThroughVisiblePortal(world, pawn, portal);
    if (other !== undefined) visible.add(other);
  }
  return [...visible];
}

function neighborThroughVisiblePortal(
  world: World,
  pawn: PawnBody,
  portal: PortalEdge
): string | undefined {
  if (portal.kind !== 'window' && !isPortalConnecting(portal)) return undefined;
  if (portal.roomA === pawn.roomHint) return sameFrameRoom(world, pawn.frameId, portal.roomB);
  if (portal.roomB === pawn.roomHint) return sameFrameRoom(world, pawn.frameId, portal.roomA);
  return undefined;
}

function sameFrameRoom(world: World, frameId: string, roomId: string): string | undefined {
  const room = world.rooms[roomId];
  if (room === undefined || room.frameId !== frameId) return undefined;
  return roomId;
}

export function unionRooms(known: readonly string[], seen: readonly string[]): string[] {
  const union = new Set<string>(known);
  for (const room of seen) union.add(room);
  return [...union];
}
