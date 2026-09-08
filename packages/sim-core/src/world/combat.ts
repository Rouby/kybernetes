/**
 * Minimal combat slice: server-side raycast against walls, shut doors, and
 * pawns. Doors lose integrity and become connecting holes; breached walls add
 * hole portals the air authority picks up. Clients never send hit results.
 */

import { closestPointOnSegment, distanceToSegment } from '../spatial/collision.js';
import { roomContainingPoint } from './crew.js';
import { destroyPortal } from './doors.js';
import { collidersForFrame } from './movement.js';
import { startBleeding } from './survival.js';
import type { DamageEvent, PawnBody, PortalEdge, Vec2, World } from './types.js';

export const FIRE_RANGE = 600;
export const RIFLE_DAMAGE = 25;
export const WELDER_DAMAGE = 15;
export const BREACH_AREA_M2 = 1.5;
export const COMBAT_BLEED_S = 20;
export const HEAT_PER_SHOT = 25;
export const HEAT_COOLDOWN_PER_S = 10;
export const OVERHEAT_AT = 100;

export type FireResult =
  | { readonly kind: 'miss' }
  | { readonly kind: 'overheated' }
  | { readonly kind: 'pawn'; readonly targetId: string }
  | { readonly kind: 'door'; readonly portalId: string }
  | { readonly kind: 'breach'; readonly portalId: string };

export function weaponDamage(weapon: string): number {
  return weapon === 'arc_welder' ? WELDER_DAMAGE : RIFLE_DAMAGE;
}

export function fireWeapon(
  world: World,
  pawnId: string,
  originAngle: number,
  weapon: string
): { world: World; result: FireResult } {
  const shooter = world.pawns[pawnId];
  if (shooter === undefined || !Number.isFinite(originAngle))
    return { world, result: { kind: 'miss' } };
  if ((world.heat[pawnId] ?? 0) >= OVERHEAT_AT) return { world, result: { kind: 'overheated' } };
  const heated: World = {
    ...world,
    heat: { ...world.heat, [pawnId]: (world.heat[pawnId] ?? 0) + HEAT_PER_SHOT },
  };
  const dir = { x: Math.cos(originAngle), y: Math.sin(originAngle) };
  const hit = castRay(heated, shooter, dir);
  if (hit === undefined) return { world: heated, result: { kind: 'miss' } };
  if (hit.kind === 'pawn') {
    return {
      world: strikePawn(heated, hit.targetId, weaponDamage(weapon), hit.point),
      result: { kind: 'pawn', targetId: hit.targetId },
    };
  }
  if (hit.kind === 'door') {
    return damageDoor(heated, hit.portalId, weaponDamage(weapon));
  }
  return breachWall(heated, shooter.frameId, hit.wall, hit.point);
}

interface RayHit {
  readonly kind: 'pawn' | 'door' | 'wall';
  readonly targetId: string;
  readonly portalId: string;
  readonly wall: { x1: number; y1: number; x2: number; y2: number };
  readonly point: Vec2;
}

function castRay(world: World, shooter: PawnBody, dir: Vec2): RayHit | undefined {
  const colliders = collidersForFrame(world, shooter.frameId);
  const step = 2;
  for (let traveled = step; traveled <= FIRE_RANGE; traveled += step) {
    const point = { x: shooter.pos.x + dir.x * traveled, y: shooter.pos.y + dir.y * traveled };
    const pawnHit = pawnAtPoint(world, shooter, point);
    if (pawnHit !== undefined) return pawnHit;
    const wallHit = wallAtPoint(colliders, point);
    if (wallHit !== undefined) return wallHit;
  }
  return undefined;
}

function pawnAtPoint(world: World, shooter: PawnBody, point: Vec2): RayHit | undefined {
  for (const target of Object.values(world.pawns)) {
    if (target.id === shooter.id || target.frameId !== shooter.frameId) continue;
    const dist = Math.hypot(target.pos.x - point.x, target.pos.y - point.y);
    if (dist < target.radius + 2) {
      return {
        kind: 'pawn',
        targetId: target.id,
        portalId: '',
        wall: { x1: 0, y1: 0, x2: 0, y2: 0 },
        point,
      };
    }
  }
  return undefined;
}

function wallAtPoint(
  colliders: readonly { id: string; x1: number; y1: number; x2: number; y2: number }[],
  point: Vec2
): RayHit | undefined {
  for (const wall of colliders) {
    const dist = distanceToSegment(point, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 });
    if (dist >= 2.5) continue;
    if (wall.id.startsWith('portal-shut.')) {
      return {
        kind: 'door',
        targetId: '',
        portalId: wall.id.slice('portal-shut.'.length),
        wall: { x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 },
        point,
      };
    }
    return {
      kind: 'wall',
      targetId: '',
      portalId: '',
      wall: { x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 },
      point,
    };
  }
  return undefined;
}

/** v1 hit resolution fills hp only; limbs and organs pass through untouched. */
export function applyDamage(pawn: PawnBody, event: DamageEvent): PawnBody {
  const hp = Math.min(pawn.health.maxHp, Math.max(0, pawn.health.hp - Math.max(0, event.force)));
  return { ...pawn, health: { ...pawn.health, hp } };
}

export function tickHeat(world: World, dtSeconds: number): World {
  if (!(dtSeconds > 0)) return world;
  const ids = Object.keys(world.heat);
  if (ids.length === 0) return world;
  const heat = { ...world.heat };
  for (const id of ids) {
    const next = (heat[id] ?? 0) - HEAT_COOLDOWN_PER_S * dtSeconds;
    if (next <= 0) delete heat[id];
    else heat[id] = next;
  }
  return { ...world, heat };
}

export function strikePawn(world: World, targetId: string, damage: number, point: Vec2): World {
  const target = world.pawns[targetId];
  if (target === undefined) return world;
  const hurt = applyDamage(target, { force: damage, materialK: 1, materialE: 0, point });
  const replaced: World = {
    ...world,
    pawns: { ...world.pawns, [targetId]: hurt },
  };
  return startBleeding(replaced, targetId, COMBAT_BLEED_S);
}

function damageDoor(
  world: World,
  portalId: string,
  damage: number
): { world: World; result: FireResult } {
  const portal = world.portals[portalId];
  if (portal === undefined) return { world, result: { kind: 'miss' } };
  const integrity = portal.integrity - damage;
  if (integrity > 0) {
    const portals = { ...world.portals, [portalId]: { ...portal, integrity } };
    return { world: { ...world, portals }, result: { kind: 'door', portalId } };
  }
  const destroyed = destroyPortal({ ...portal, integrity: 0 }, world.tick);
  const portals = { ...world.portals, [portalId]: destroyed };
  return { world: { ...world, portals }, result: { kind: 'breach', portalId } };
}

function breachWall(
  world: World,
  frameId: string,
  wall: { x1: number; y1: number; x2: number; y2: number },
  point: Vec2
): { world: World; result: FireResult } {
  const roomA = roomContainingPoint(world, frameId, point.x, point.y);
  if (roomA === undefined) return { world, result: { kind: 'miss' } };
  const roomB = roomBeyondWall(world, frameId, roomA, wall, point);
  const id = `breach.${roomA}.${world.tick}.${Object.keys(world.portals).length}`;
  const hole: PortalEdge = {
    id,
    roomA,
    roomB,
    kind: 'hole',
    state: 'destroyed',
    cooldownUntilTick: world.tick,
    areaM2: BREACH_AREA_M2,
    segment: breachSegment(wall, point),
    clearance: 0,
    integrity: 0,
  };
  return {
    world: { ...world, portals: { ...world.portals, [id]: hole } },
    result: { kind: 'breach', portalId: id },
  };
}

function roomBeyondWall(
  world: World,
  frameId: string,
  roomA: string,
  wall: { x1: number; y1: number; x2: number; y2: number },
  point: Vec2
): string {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy) || 1;
  for (const side of [1, -1]) {
    const probe = { x: point.x + (-dy / len) * 6 * side, y: point.y + (dx / len) * 6 * side };
    const room = roomContainingPoint(world, frameId, probe.x, probe.y);
    if (room !== undefined && room !== roomA) return room;
  }
  return 'space';
}

function breachSegment(
  wall: { x1: number; y1: number; x2: number; y2: number },
  point: Vec2
): PortalEdge['segment'] {
  const closest = closestPointOnSegment(
    point,
    { x: wall.x1, y: wall.y1 },
    { x: wall.x2, y: wall.y2 }
  );
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy) || 1;
  const half = 12;
  return {
    x1: closest.x - (dx / len) * half,
    y1: closest.y - (dy / len) * half,
    x2: closest.x + (dx / len) * half,
    y2: closest.y + (dy / len) * half,
  };
}
