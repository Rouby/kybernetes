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
  if (vessel === undefined) return { ...pawn.pos };
  return frameToWorld(vessel, pawn.pos);
}

export function localForFrame(world: World, frameId: string, worldPos: Vec2): Vec2 {
  const vessel = world.vessels[frameId];
  if (vessel === undefined) return { ...worldPos };
  return worldToFrame(vessel, worldPos);
}

function mouthCrossesStationToVessel(
  worldPos: Vec2,
  mouthX: number,
  y1: number,
  y2: number
): boolean {
  return worldPos.x >= mouthX && worldPos.y >= y1 && worldPos.y <= y2;
}

function crossOneDock(world: World, pawn: PawnBody, dockId: string): PawnBody | undefined {
  const dock = world.docks[dockId];
  if (dock === undefined) return undefined;
  if (!isDockGateWalkable(world, dock.stationPortal)) return undefined;
  const worldPos = pawnWorldPos(world, pawn);
  const mouthX = dock.mouthWorld.x1;
  const y1 = Math.min(dock.mouthWorld.y1, dock.mouthWorld.y2);
  const y2 = Math.max(dock.mouthWorld.y1, dock.mouthWorld.y2);
  if (pawn.frameId === dock.stationFrame) {
    if (!mouthCrossesStationToVessel(worldPos, mouthX, y1, y2)) return undefined;
    const local = localForFrame(world, dock.vesselFrame, worldPos);
    const room = roomAt(world, dock.vesselFrame, local.x, local.y);
    if (room === undefined) return undefined;
    return { ...pawn, frameId: dock.vesselFrame, pos: local, roomHint: room };
  }
  if (pawn.frameId === dock.vesselFrame) {
    if (mouthCrossesStationToVessel(worldPos, mouthX, y1, y2)) return undefined;
    const local = localForFrame(world, dock.stationFrame, worldPos);
    const room = roomAt(world, dock.stationFrame, local.x, local.y);
    if (room === undefined) return undefined;
    return { ...pawn, frameId: dock.stationFrame, pos: local, roomHint: room };
  }
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
