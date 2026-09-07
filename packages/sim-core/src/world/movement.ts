/**
 * Server-side movement integration: input accel -> collide -> portal cross -> room hint.
 * Replaces trust-client-positions. Pure + deterministic; dt is passed in.
 */

import type { PawnBody, Vec2, World } from './types.js';

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
