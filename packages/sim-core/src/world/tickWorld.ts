/**
 * tickWorld: the only tick. Small delegates, no god function.
 * Movement slice with server-side collision, world-space dock crossing,
 * room-hint tracking, explored-memory, and air readings via the air
 * authority. Pawn and shot positions stay frame-local; the renderer adds
 * the frame origin, so vessel motion never touches them here.
 */

import {
  type AirAuthorityState,
  refreshAtmos,
  roomAirDensity,
  sampleRoomWind,
} from './airAuthority.js';
import { tickBots } from './bots.js';
import { tickImpacts, tickProjectiles, tickSpread } from './combat.js';
import { stepCrossFrame } from './dockCrossing.js';
import { tickLiving } from './living.js';
import { unionRooms, visibleRooms } from './los.js';
import {
  applyWindToTarget,
  collidePawn,
  collidersForFrame,
  inputToAccel,
  integratePawnPosition,
  integratePawnVelocity,
  pawnDragOffset,
  updateRoomHint,
} from './movement.js';
import { tickSchedule } from './schedule.js';
import { dropIncapacitatedCrates, speedMultiplierFor, tickCargo } from './ship/cargo.js';
import { tickShipSystems } from './ship/systems.js';
import { tickSurvival } from './survival.js';
import { FIXED_DT, type PawnBody, type Vec2, type World } from './types.js';
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
  const moved = stepMovement(botted.world, dt, [...inputs, ...botted.inputs], air);
  const carried = tickCargo(moved);
  const shipped = tickShipSystems(carried, dt);
  const crossed = stepCrossFrame(shipped);
  const scheduled = tickSchedule(crossed, dt);
  const watched = tickWatches(scheduled, dt);
  const survived = tickSurvival(watched, dt);
  const dropped = dropIncapacitatedCrates(survived);
  const lived = tickLiving(dropped, dt);
  const shot = tickProjectiles(lived, dt);
  const cooled = tickSpread(tickImpacts(shot), dt);
  const ticked = { ...cooled, tick: world.tick + 1, timeMs: world.timeMs + dt * 1000 };
  if (air === undefined) return ticked;
  return { ...ticked, atmos: refreshAtmos(air, ticked, dt) };
}

function normalizeDt(dtSeconds: number): number {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return 0;
  return Math.min(dtSeconds, FIXED_DT * 4);
}

function stepMovement(
  world: World,
  dt: number,
  inputs: readonly WorldInput[],
  air?: AirAuthorityState
): World {
  const latest = latestInputPerPawn(inputs);
  const pawns: Record<string, PawnBody> = {};
  for (const pawn of Object.values(world.pawns)) {
    pawns[pawn.id] = stepPawn(world, pawn, latest.get(pawn.id), dt, air);
  }
  return stepMemory({ ...world, pawns });
}

function latestInputPerPawn(inputs: readonly WorldInput[]): Map<string, WorldInput> {
  const latest = new Map<string, WorldInput>();
  for (const input of inputs) latest.set(input.pawnId, input);
  return latest;
}

function resolveFacing(pawn: PawnBody, input: WorldInput | undefined): number {
  const facing = input?.facing;
  return facing !== undefined && Number.isFinite(facing) ? facing : pawn.facing;
}

function driveForPawn(
  world: World,
  pawn: PawnBody,
  input: WorldInput | undefined,
  dt: number
): { accel: Vec2; vel: Vec2 } {
  if (pawn.health.hp <= 0 || pawn.health.incapacitated)
    return { accel: { x: 0, y: 0 }, vel: { x: 0, y: 0 } };
  const mult = speedMultiplierFor(world.cargo, pawn.id);
  const accel = inputToAccel({
    moveVec: { x: (input?.moveX ?? 0) * mult, y: (input?.moveY ?? 0) * mult },
    sprint: input?.sprint ?? false,
  });
  return { accel, vel: integratePawnVelocity(pawn, accel, dt) };
}

function stepPawn(
  world: World,
  pawn: PawnBody,
  input: WorldInput | undefined,
  dt: number,
  air?: AirAuthorityState
): PawnBody {
  const drive = driveForPawn(world, pawn, input, dt);
  const target = integratePawnPosition({ ...pawn, vel: drive.vel }, drive.vel, dt);
  const dragged = applyWindToTarget(target, dragOffsetForPawn(pawn, air, dt));
  const collided = collidePawn(pawn, dragged, collidersForFrame(world, pawn.frameId));
  const pos = collided;
  return {
    ...pawn,
    pos,
    vel: drive.vel,
    facing: resolveFacing(pawn, input),
    roomHint: updateRoomHint(world, pawn, pos),
  };
}

function dragOffsetForPawn(pawn: PawnBody, air: AirAuthorityState | undefined, dt: number): Vec2 {
  if (air === undefined || !(dt > 0)) return { x: 0, y: 0 };
  const roomId = resolvePawnAirRoom(pawn, air);
  if (roomId === undefined) return { x: 0, y: 0 };
  return pawnWindOffset(air, pawn.frameId, roomId, dt);
}

function resolvePawnAirRoom(pawn: PawnBody, air: AirAuthorityState): string | undefined {
  const rooms = air.sims.get(pawn.frameId)?.rooms;
  if (rooms === undefined) return undefined;
  if (rooms.has(pawn.roomHint)) return pawn.roomHint;
  const bare = pawn.roomHint.includes('.')
    ? pawn.roomHint.split('.').slice(1).join('.')
    : pawn.roomHint;
  if (rooms.has(bare)) return bare;
  const namespaced = `${pawn.frameId}.${bare}`;
  if (rooms.has(namespaced)) return namespaced;
  return undefined;
}

function pawnWindOffset(air: AirAuthorityState, frameId: string, roomId: string, dt: number): Vec2 {
  const wind = sampleRoomWind(air, frameId, roomId);
  const density = roomAirDensity(air, frameId, roomId);
  if (density === undefined) return { x: 0, y: 0 };
  return pawnDragOffset(wind, density, dt);
}

function stepMemory(world: World): World {
  const memory = { ...world.memory };
  for (const pawn of Object.values(world.pawns)) {
    if (!isMemoryPawn(pawn)) continue;
    memory[pawn.id] = unionRooms(memory[pawn.id] ?? [], visibleRooms(world, pawn.id));
  }
  return { ...world, memory };
}

/**
 * Fog-of-war is tracked for player-controlled pawns only; ambient station
 * crowds (npc:*) never build explored-memory, saving a raycast fan per tick.
 * Player sessions spawn as pawn:* (tests use bare ids like p1/hero), so the
 * crowd prefix — not the spec sketch of user: — is the reliable filter.
 */
function isMemoryPawn(pawn: PawnBody): boolean {
  return !pawn.id.startsWith('npc:');
}
