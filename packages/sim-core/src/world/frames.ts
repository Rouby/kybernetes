/**
 * Unified frame access (Strike 2).
 * Vessels and stations used to be separate types with separate tables,
 * forcing every caller to concat Object.keys(vessels)+Object.keys(stations)
 * and dropping stations from snapshots. Frames are frames: one id space,
 * one origin lookup, one snapshot table. Stations are static (angle 0);
 * vessels are rigid (origin/angle/vel). Renderer adds the origin; no offset-hack.
 * Pure data only; no DOM/Node imports.
 */

import type { Vec2, World } from './types.js';

export type FrameKind = 'vessel' | 'station';

export interface Frame {
  readonly id: string;
  readonly kind: FrameKind;
  readonly origin: Vec2;
  readonly angle: number;
}

type FrameLike = { readonly origin: Vec2; readonly angle?: number };

export function frameToWorld(frame: FrameLike, local: Vec2): Vec2 {
  const angle = frame.angle ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: frame.origin.x + local.x * cos - local.y * sin,
    y: frame.origin.y + local.x * sin + local.y * cos,
  };
}

export function worldToFrame(frame: FrameLike, world: Vec2): Vec2 {
  const angle = frame.angle ?? 0;
  const dx = world.x - frame.origin.x;
  const dy = world.y - frame.origin.y;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

export function composePawnVelocity(
  frameVel: Vec2,
  pawnLocalVel: Vec2,
  angVel: number,
  r: Vec2
): Vec2 {
  return {
    x: frameVel.x + pawnLocalVel.x - angVel * r.y,
    y: frameVel.y + pawnLocalVel.y + angVel * r.x,
  };
}

/** Every frame id in one table, vessels first then stations, sorted for determinism. */
export function listFrameIds(world: Pick<World, 'vessels' | 'stations'>): readonly string[] {
  return [...Object.keys(world.vessels).sort(), ...Object.keys(world.stations).sort()];
}

/** Unified frame view; undefined when the id names no vessel or station. */
export function getFrame(
  world: Pick<World, 'vessels' | 'stations'>,
  id: string
): Frame | undefined {
  const vessel = world.vessels[id];
  if (vessel !== undefined) {
    return { id: vessel.id, kind: 'vessel', origin: vessel.origin, angle: vessel.angle };
  }
  const station = world.stations[id];
  if (station !== undefined) {
    return { id: station.id, kind: 'station', origin: station.origin, angle: 0 };
  }
  return undefined;
}

/** Origin of any frame; undefined for unknown ids (no silent origin). */
export function getFrameOrigin(
  world: Pick<World, 'vessels' | 'stations'>,
  id: string
): Vec2 | undefined {
  return getFrame(world, id)?.origin;
}

/** True when the id names a vessel frame. */
export function isVesselFrame(world: Pick<World, 'vessels' | 'stations'>, id: string): boolean {
  return world.vessels[id] !== undefined;
}

/** True when the id names a station frame. */
export function isStationFrame(world: Pick<World, 'vessels' | 'stations'>, id: string): boolean {
  return world.stations[id] !== undefined;
}
