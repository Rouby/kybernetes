/**
 * Persistent scorch decals: server-authoritative LRU so every viewer agrees.
 * Transient impacts (6 ticks) drive flashes + sparks; decals persist until
 * repaired or capped. Pure math, no DOM.
 */

import type { ScorchDecal } from '@kybernetes/protocol';
import { q1, q2 } from '@kybernetes/protocol';
import type { World, WorldDecal } from './types.js';

/** Max persistent decals; beyond this the oldest are evicted. */
export const MAX_DECALS = 64;

/**
 * Base crater radius in px by weapon; scaled by hit energy. Kept small:
 * a rifle puncture reads as a scuff, not a crater — breaches carry the
 * spectacle through the carved wall + plume passes instead.
 */
export function baseDecalRadius(weapon: string): number {
  if (weapon === 'pulse_laser') return 3.8;
  if (weapon === 'arc_welder') return 2.6;
  if (weapon === 'railgun_pistol') return 4.4;
  return 3.4;
}

export function decalRadiusFor(weapon: string, energy: number): number {
  const clamped = Math.min(1, Math.max(0, energy));
  return q1(baseDecalRadius(weapon) * (0.5 + 0.5 * clamped));
}

export function makeDecalId(frameId: string, tick: number, count: number): string {
  return `decal.${frameId}.${tick}.${count}`;
}

/** Append a wall/door impact decal; miss + pawn hits leave no scorch. */
export function addDecal(decals: readonly WorldDecal[], decal: WorldDecal): readonly WorldDecal[] {
  const next = [...decals, decal];
  if (next.length <= MAX_DECALS) return next;
  return next.slice(next.length - MAX_DECALS);
}

export function shouldDecal(kind: string): boolean {
  return kind === 'breach' || kind === 'door';
}

export function snapshotDecalsOf(world: World): ScorchDecal[] {
  return world.decals.map((decal) => ({
    id: decal.id,
    frameId: decal.frameId,
    x: q2(decal.x),
    y: q2(decal.y),
    angle: q2(decal.angle),
    radius: q1(decal.radius),
    weapon: decal.weapon,
    bornTick: decal.bornTick,
  }));
}
