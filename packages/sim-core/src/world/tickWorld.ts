/**
 * tickWorld: the only tick. Small delegates, no god function.
 * M3: movement slice with server-side collision, frame-velocity carry,
 * room-hint tracking, explored-memory, and air readings via the air authority.
 * Survival slice in M6; bots land in M7.
 */

import { type AirAuthorityState, refreshAtmos } from './airAuthority.js';
import { tickBots } from './bots.js';
import { tickImpacts, tickProjectiles, tickSpread } from './combat.js';
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
import { tickSchedule } from './schedule.js';
import { tickSurvival } from './survival.js';
import { FIXED_DT, type PawnBody, type World } from './types.js';
import { tickWatches } from './watch.js';

export interface WorldInput {
  readonly pawnId: string;
  readonly moveX: number;
  readonly moveY: number;
  readonly sprint: boolean;
  readonly facing?: number;
}

export function tickWorld(
  world: World,
  dtSeconds: number,
  inputs: readonly WorldInput[],
  air?: AirAuthorityState
): World {
  const dt = normalizeDt(dtSeconds);
  if (dt === 0) return world;
  const botted = tickBots(world);
  const moved = stepMovement(botted.world, dt, [...inputs, ...botted.inputs]);
  const scheduled = tickSchedule(moved, dt);
  const watched = tickWatches(scheduled, dt);
  const survived = tickSurvival(watched, dt);
  const shot = tickProjectiles(survived, dt);
  const cooled = tickSpread(tickImpacts(shot), dt);
  const framed = stepFrames(cooled, dt);
  const ticked = { ...framed, tick: world.tick + 1, timeMs: world.timeMs + dt * 1000 };
  if (air === undefined) return ticked;
  return { ...ticked, atmos: refreshAtmos(air, ticked, dt) };
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
  const facing = input?.facing;
  return {
    ...pawn,
    pos,
    vel,
    facing: facing !== undefined && Number.isFinite(facing) ? facing : pawn.facing,
    roomHint: updateRoomHint(world, pawn, pos),
  };
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
