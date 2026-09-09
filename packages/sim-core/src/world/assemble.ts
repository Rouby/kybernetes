/**
 * Assembles a live World from compiled hull specs. Room and portal ids are
 * namespaced per frame so two hulls of the same class can share one world.
 * Used by the M3 playable preview now and the SimHost session registry in M5.
 */

import { compileHull, type HullSpec, toLegacyWalls } from './hullCompiler.js';
import { createEmptyWorld, type PawnBody, type World } from './types.js';

export interface FrameSpec {
  readonly frameId: string;
  readonly hull: HullSpec;
  readonly vessel?: { readonly name: string; readonly beacon: string };
}

export function assembleWorld(frames: readonly FrameSpec[], timeMs = 0): World {
  let world = createEmptyWorld(timeMs);
  for (const frame of frames) {
    world = addFrame(world, frame);
  }
  return world;
}

function addFrame(world: World, frame: FrameSpec): World {
  const compiled = compileHull(frame.hull);
  const prefix = `${frame.frameId}.`;
  return {
    ...world,
    vessels: frame.vessel === undefined ? world.vessels : addVessel(world, frame),
    stations:
      frame.vessel === undefined
        ? { ...world.stations, [frame.frameId]: { id: frame.frameId, origin: { x: 0, y: 0 } } }
        : world.stations,
    rooms: addRooms(world, compiled.rooms, frame.frameId, prefix),
    portals: addPortals(world, compiled.portals, prefix),
    wallsByFrame: { ...world.wallsByFrame, [frame.frameId]: toLegacyWalls(compiled) },
    spawns: addSpawns(world, compiled.spawns, frame.frameId),
  };
}

function addVessel(world: World, frame: FrameSpec): World['vessels'] {
  return {
    ...world.vessels,
    [frame.frameId]: {
      id: frame.frameId,
      name: frame.vessel?.name ?? frame.frameId,
      beacon: frame.vessel?.beacon ?? frame.frameId,
      origin: { x: 0, y: 0 },
      angle: 0,
      vel: { x: 0, y: 0 },
      angVel: 0,
      schedule: 'docked',
    },
  };
}

function addRooms(
  world: World,
  roomsToAdd: ReturnType<typeof compileHull>['rooms'],
  frameId: string,
  prefix: string
): World['rooms'] {
  const rooms = { ...world.rooms };
  for (const room of roomsToAdd) {
    rooms[prefix + room.id] = { ...room, id: prefix + room.id, frameId };
  }
  return rooms;
}

function addPortals(
  world: World,
  portals: ReturnType<typeof compileHull>['portals'],
  prefix: string
): World['portals'] {
  const table = { ...world.portals };
  for (const portal of portals) {
    table[prefix + portal.id] = {
      ...portal,
      id: prefix + portal.id,
      roomA: prefix + portal.roomA,
      roomB:
        portal.roomB === 'vacuum' || portal.roomB === 'space'
          ? portal.roomB
          : prefix + portal.roomB,
    };
  }
  return table;
}

function addSpawns(
  world: World,
  spawns: Readonly<Record<string, { x: number; y: number }>>,
  frameId: string
): World['spawns'] {
  const table = { ...world.spawns };
  for (const [id, point] of Object.entries(spawns)) {
    table[`${frameId}.${id}`] = { frameId, x: point.x, y: point.y };
  }
  return table;
}

export interface SpawnRequest {
  readonly id: string;
  readonly owner: string;
  readonly frameId: string;
  readonly roomId: string;
  readonly x: number;
  readonly y: number;
  readonly color: string;
}

export function spawnPawn(world: World, request: SpawnRequest): World {
  const pawn: PawnBody = {
    id: request.id,
    owner: request.owner,
    frameId: request.frameId,
    roomHint: request.roomId,
    pos: { x: request.x, y: request.y },
    vel: { x: 0, y: 0 },
    facing: 0,
    radius: 12,
    speed: 200,
    health: { hp: 100, maxHp: 100, suitSealed: false, incapacitated: false },
    color: request.color,
    say: '',
    sayUntilTick: 0,
  };
  return { ...world, pawns: { ...world.pawns, [pawn.id]: pawn } };
}
