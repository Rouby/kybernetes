/**
 * Server-side movement integration: input accel -> collide -> portal cross -> room hint.
 * Replaces trust-client-positions. Pure + deterministic; dt is passed in.
 */

import type { SnapshotPortal, WallSegment } from '@kybernetes/protocol';
import { resolvePawnMovement } from '../spatial/collision.js';
import { isPortalConnecting } from './doors.js';
import type { PawnBody, PortalEdge, Vec2, World } from './types.js';

export interface MoveInput {
  readonly moveVec: Vec2;
  readonly sprint: boolean;
}

const BASE_ACCEL = 900;
const SPRINT_MULT = 1.6;
const DAMPING = 6;
const MAX_SPEED = 220;
const SPRINT_MAX = 340;

export function inputToAccel(input: MoveInput): Vec2 {
  const mult = input.sprint ? SPRINT_MULT : 1;
  return { x: input.moveVec.x * BASE_ACCEL * mult, y: input.moveVec.y * BASE_ACCEL * mult };
}

export function integratePawnVelocity(pawn: PawnBody, accel: Vec2, dtSeconds: number): Vec2 {
  if (!(dtSeconds > 0)) return pawn.vel;
  const cap = MAX_SPEED;
  const nx = (pawn.vel.x + accel.x * dtSeconds) / (1 + DAMPING * dtSeconds);
  const ny = (pawn.vel.y + accel.y * dtSeconds) / (1 + DAMPING * dtSeconds);
  return { x: clamp(nx, -cap, cap), y: clamp(ny, -cap, cap) };
}

export function integratePawnPosition(pawn: PawnBody, vel: Vec2, dtSeconds: number): Vec2 {
  if (!(dtSeconds > 0)) return pawn.pos;
  return { x: pawn.pos.x + vel.x * dtSeconds, y: pawn.pos.y + vel.y * dtSeconds };
}

export function sprintCap(sprint: boolean): number {
  return sprint ? SPRINT_MAX : MAX_SPEED;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function updateRoomHint(world: World, pawn: PawnBody, pos: Vec2): string {
  const hint = world.rooms[pawn.roomHint];
  if (hint !== undefined && pointInRect(pos, hint.rect)) return pawn.roomHint;
  for (const room of Object.values(world.rooms)) {
    if (room.frameId !== pawn.frameId) continue;
    if (pointInRect(pos, room.rect)) return room.id;
  }
  return pawn.roomHint;
}

function pointInRect(p: Vec2, rect: { x: number; y: number; w: number; h: number }): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
}

/** Colliders for a frame: compiled walls plus shut-portal segments (closed doors block). */
export function collidersForFrame(world: World, frameId: string): WallSegment[] {
  const colliders = [...(world.wallsByFrame[frameId] ?? [])];
  for (const portal of Object.values(world.portals)) {
    if (isPortalConnecting(portal)) continue;
    const room = world.rooms[portal.roomA];
    if (room === undefined || room.frameId !== frameId) continue;
    colliders.push(portalCollider(portal));
  }
  return colliders;
}

function portalCollider(portal: PortalEdge): WallSegment {
  return {
    id: `portal-shut.${portal.id}`,
    x1: portal.segment.x1,
    y1: portal.segment.y1,
    x2: portal.segment.x2,
    y2: portal.segment.y2,
    isOpaque: true,
    isTraversable: false,
  };
}

export function collidePawn(pawn: PawnBody, target: Vec2, colliders: readonly WallSegment[]): Vec2 {
  return predictStep(pawn.pos, pawn.radius, target, colliders);
}

/**
 * Client prediction step: collide an arbitrary point against frame colliders.
 * Same resolver as the server, so predictions match authority until snapshots
 * correct them. Pure + deterministic.
 */
export function predictStep(
  from: Vec2,
  radius: number,
  target: Vec2,
  colliders: readonly WallSegment[]
): Vec2 {
  const result = resolvePawnMovement(from.x, from.y, target.x, target.y, radius, [...colliders]);
  return { x: result.x, y: result.y };
}

/**
 * Client prediction view: overlay authoritative portal states onto static
 * geometry, then feed the result to collidersForFrame. Destroyed doors become
 * connecting holes (matching combat), so predictions stop rubber-banding on
 * doorways the server already opened. Breach-carved holes have no static
 * segment to join, so predictions still collide there until snapshots correct.
 */
export function withSnapshotStates(world: World, snapshots: readonly SnapshotPortal[]): World {
  if (snapshots.length === 0) return world;
  const states = new Map(snapshots.map((portal) => [portal.id, portal.state]));
  let changed = false;
  const portals: Record<string, PortalEdge> = {};
  for (const [id, portal] of Object.entries(world.portals)) {
    const state = states.get(id);
    if (state === undefined) {
      portals[id] = portal;
      continue;
    }
    const kind = state === 'destroyed' ? 'hole' : portal.kind;
    if (kind === portal.kind && state === portal.state) {
      portals[id] = portal;
      continue;
    }
    changed = true;
    portals[id] = { ...portal, kind, state };
  }
  return changed ? { ...world, portals } : world;
}

/** Pawns aboard a moving vessel inherit its frame velocity (no offset-hack). */
export function carryByFrame(world: World, frameId: string, pos: Vec2, dtSeconds: number): Vec2 {
  const frame = world.vessels[frameId];
  if (frame === undefined || !(dtSeconds > 0)) return pos;
  return { x: pos.x + frame.vel.x * dtSeconds, y: pos.y + frame.vel.y * dtSeconds };
}
