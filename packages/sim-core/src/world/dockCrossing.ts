/**
 * Seamless dock crossing: world-preserving frame flips at the mated mouth.
 * No transfer volumes, no egress jumps, no cooldowns. Pawns walk in world
 * space; crossing the mouth line re-bases the same world point into the
 * other frame (frameToWorld/worldToFrame), so render position never jumps.
 */

import { frameToWorld, worldToFrame } from './frames.js';
import { isDockGateWalkable, roomAt } from './schedule.js';
import type { PawnBody, Vec2, World } from './types.js';

export function pawnWorldPos(world: World, pawn: PawnBody): Vec2 {
  const vessel = world.vessels[pawn.frameId];
  if (vessel !== undefined) return frameToWorld(vessel, pawn.pos);
  const station = world.stations[pawn.frameId];
  if (station === undefined) return { ...pawn.pos };
  return { x: pawn.pos.x + station.origin.x, y: pawn.pos.y + station.origin.y };
}

export function localForFrame(world: World, frameId: string, worldPos: Vec2): Vec2 {
  const vessel = world.vessels[frameId];
  if (vessel !== undefined) return worldToFrame(vessel, worldPos);
  const station = world.stations[frameId];
  if (station === undefined) return { ...worldPos };
  return { x: worldPos.x - station.origin.x, y: worldPos.y - station.origin.y };
}

function mouthCrossesStationToVessel(
  worldPos: Vec2,
  mouthX: number,
  y1: number,
  y2: number
): boolean {
  return worldPos.x >= mouthX && worldPos.y >= y1 && worldPos.y <= y2;
}

interface MouthBounds {
  readonly mouthX: number;
  readonly y1: number;
  readonly y2: number;
}

function mouthBounds(dock: NonNullable<World['docks'][string]>): MouthBounds {
  return {
    mouthX: dock.mouthWorld.x1,
    y1: Math.min(dock.mouthWorld.y1, dock.mouthWorld.y2),
    y2: Math.max(dock.mouthWorld.y1, dock.mouthWorld.y2),
  };
}

function crossStationToVessel(
  world: World,
  pawn: PawnBody,
  dock: NonNullable<World['docks'][string]>,
  worldPos: Vec2,
  mouth: MouthBounds
): PawnBody | undefined {
  if (!mouthCrossesStationToVessel(worldPos, mouth.mouthX, mouth.y1, mouth.y2)) return undefined;
  return rebasePawn(world, pawn, dock.vesselFrame, worldPos);
}

function crossVesselToStation(
  world: World,
  pawn: PawnBody,
  dock: NonNullable<World['docks'][string]>,
  worldPos: Vec2,
  mouth: MouthBounds
): PawnBody | undefined {
  const inMouthAperture = worldPos.y >= mouth.y1 && worldPos.y <= mouth.y2;
  if (worldPos.x >= mouth.mouthX || !inMouthAperture) return undefined;
  return rebasePawn(world, pawn, dock.stationFrame, worldPos);
}

function rebasePawn(
  world: World,
  pawn: PawnBody,
  frameId: string,
  worldPos: Vec2
): PawnBody | undefined {
  const local = localForFrame(world, frameId, worldPos);
  const room = roomAt(world, frameId, local.x, local.y);
  if (room === undefined) return undefined;
  return { ...pawn, frameId, pos: local, roomHint: room };
}

function crossOneDock(world: World, pawn: PawnBody, dockId: string): PawnBody | undefined {
  const dock = world.docks[dockId];
  if (dock === undefined) return undefined;
  if (!isDockGateWalkable(world, dock.stationPortal)) return undefined;
  const worldPos = pawnWorldPos(world, pawn);
  const mouth = mouthBounds(dock);
  if (pawn.frameId === dock.stationFrame)
    return crossStationToVessel(world, pawn, dock, worldPos, mouth);
  if (pawn.frameId === dock.vesselFrame)
    return crossVesselToStation(world, pawn, dock, worldPos, mouth);
  return undefined;
}

export function tryCrossDock(world: World, pawn: PawnBody): PawnBody {
  for (const dockId of Object.keys(world.docks)) {
    const crossed = crossOneDock(world, pawn, dockId);
    if (crossed !== undefined) return crossed;
  }
  return pawn;
}

export function stepCrossFrame(world: World): World {
  const ids = Object.keys(world.docks);
  if (ids.length === 0) return world;
  let changed = false;
  const pawns: Record<string, PawnBody> = {};
  for (const pawn of Object.values(world.pawns)) {
    const next = tryCrossDock(world, pawn);
    pawns[pawn.id] = next;
    if (next !== pawn) changed = true;
  }
  return changed ? { ...world, pawns } : world;
}

/** True while any pawn lingers in the tube room (departure must hold). */
export function tubeOccupancy(world: World, dockId: string): boolean {
  const dock = world.docks[dockId];
  if (dock === undefined) return false;
  for (const pawn of Object.values(world.pawns)) {
    if (pawn.roomHint === dock.tubeRoom) return true;
  }
  return false;
}
