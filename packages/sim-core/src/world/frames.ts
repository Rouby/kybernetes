/**
 * World/frame transforms + velocity composition.
 * Vessels are rigid frames (origin/angle/vel); stations are static.
 * Renderer keeps receiving world-space geometry; no offset-hack.
 */

import type { Vec2, VesselFrame } from './types.js';

export function frameToWorld(frame: Pick<VesselFrame, 'origin' | 'angle'>, local: Vec2): Vec2 {
  const cos = Math.cos(frame.angle);
  const sin = Math.sin(frame.angle);
  return {
    x: frame.origin.x + local.x * cos - local.y * sin,
    y: frame.origin.y + local.x * sin + local.y * cos,
  };
}

export function worldToFrame(frame: Pick<VesselFrame, 'origin' | 'angle'>, world: Vec2): Vec2 {
  const dx = world.x - frame.origin.x;
  const dy = world.y - frame.origin.y;
  const cos = Math.cos(-frame.angle);
  const sin = Math.sin(-frame.angle);
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
