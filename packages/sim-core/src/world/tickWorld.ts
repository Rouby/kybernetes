/**
 * tickWorld: the only tick. Small delegates, no god function.
 * M0: movement slice + tick advance. Air/survival/bots/combat/watch land in M3-M7.
 */

import { advanceFrameOrigin } from './frames.js';
import {
  inputToAccel,
  integratePawnPosition,
  integratePawnVelocity,
  updateRoomHint,
} from './movement.js';
import { FIXED_DT, type World } from './types.js';

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
  if (inputs.length === 0) return world;
  const pawns = { ...world.pawns };
  for (const input of inputs) {
    const pawn = pawns[input.pawnId];
    if (pawn === undefined) continue;
    const accel = inputToAccel({
      moveVec: { x: input.moveX, y: input.moveY },
      sprint: input.sprint,
    });
    const vel = integratePawnVelocity(pawn, accel, dt);
    const pos = integratePawnPosition({ ...pawn, vel }, vel, dt);
    const roomHint = updateRoomHint(world, pawn, pos);
    pawns[input.pawnId] = { ...pawn, pos, vel, roomHint };
  }
  return { ...world, pawns };
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
