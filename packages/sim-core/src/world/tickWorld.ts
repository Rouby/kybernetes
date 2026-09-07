/**
 * tickWorld: the only tick. Small delegates, no god function.
 * M3: movement slice with server-side collision, frame-velocity carry,
 * room-hint tracking, and explored-memory. Air/survival/bots/combat/watch land in M4-M7.
 */

import { advanceFrameOrigin } from './frames.js';
import { unionRooms, visibleRooms } from './los.js';
import {
  carryByFrame,
  collidePawn,
  collidersForFrame,
  inputToAccel,
  integratePawnPosition,
  integratePawnVelocity,
  updateRoomHint,
} from './movement.js';
import { FIXED_DT, type PawnBody, type World } from './types.js';

export interface WorldInput {
  readonly pawnId: string;
  readonly moveX: number;
  readonly moveY: number;
  readonly sprint: boolean;
}

export function tickWorld(world: World, dtSeconds: number, inputs: readonly WorldInput[]): World {
  const dt = normalizeDt(dtSeconds);
  if (dt === 0) return world;
  const moved = stepMovement(world, dt, inputs);
  const framed = stepFrames(moved, dt);
  return { ...framed, tick: world.tick + 1, timeMs: world.timeMs + dt * 1000 };
}

function normalizeDt(dtSeconds: number): number {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return 0;
  return Math.min(dtSeconds, FIXED_DT * 4);
}

function stepMovement(world: World, dt: number, inputs: readonly WorldInput[]): World {
  const latest = latestInputPerPawn(inputs);
  const pawns: Record<string, PawnBody> = {};
  for (const pawn of Object.values(world.pawns)) {
    pawns[pawn.id] = stepPawn(world, pawn, latest.get(pawn.id), dt);
  }
  return stepMemory({ ...world, pawns });
}

function latestInputPerPawn(inputs: readonly WorldInput[]): Map<string, WorldInput> {
  const latest = new Map<string, WorldInput>();
  for (const input of inputs) latest.set(input.pawnId, input);
  return latest;
}

function stepPawn(
  world: World,
  pawn: PawnBody,
  input: WorldInput | undefined,
  dt: number
): PawnBody {
  const accel = inputToAccel({
    moveVec: { x: input?.moveX ?? 0, y: input?.moveY ?? 0 },
    sprint: input?.sprint ?? false,
  });
  const vel = integratePawnVelocity(pawn, accel, dt);
  const target = integratePawnPosition({ ...pawn, vel }, vel, dt);
  const collided = collidePawn(pawn, target, collidersForFrame(world, pawn.frameId));
  const pos = carryByFrame(world, pawn.frameId, collided, dt);
  return { ...pawn, pos, vel, roomHint: updateRoomHint(world, pawn, pos) };
}

function stepMemory(world: World): World {
  const memory = { ...world.memory };
  for (const pawn of Object.values(world.pawns)) {
    memory[pawn.id] = unionRooms(memory[pawn.id] ?? [], visibleRooms(world, pawn.id));
  }
  return { ...world, memory };
}

function stepFrames(world: World, dt: number): World {
  const vesselIds = Object.keys(world.vessels);
  if (vesselIds.length === 0) return world;
  const vessels = { ...world.vessels };
  for (const id of vesselIds) {
    const frame = vessels[id];
    if (frame === undefined) continue;
    const next = advanceFrameOrigin(frame, dt);
    vessels[id] = { ...frame, origin: next.origin, angle: next.angle };
  }
  return { ...world, vessels };
}
