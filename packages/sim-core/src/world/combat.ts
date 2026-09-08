/**
 * Simulated projectiles: FIRE spawns a ticked entity with velocity; each
 * tick marches it in short substeps against pawns, shut doors, and walls.
 * Doors lose integrity and become connecting holes; breached walls add hole
 * portals the air authority picks up. Clients never send hit results.
 */

import { closestPointOnSegment, segmentsIntersect } from '../spatial/collision.js';
import { roomContainingPoint } from './crew.js';
import { destroyPortal } from './doors.js';
import { carryByFrame, collidersForFrame } from './movement.js';
import { ensureVitals, startBleeding } from './survival.js';
import type { DamageEvent, PawnBody, PortalEdge, ProjectileBody, Vec2, World } from './types.js';

export const RIFLE_DAMAGE = 25;
export const WELDER_DAMAGE = 15;
export const BREACH_AREA_M2 = 1.5;
export const COMBAT_BLEED_S = 20;
export const IMPACT_TTL_TICKS = 6;
export const HEAT_PER_SHOT = 20;
export const HEAT_COOLDOWN_PER_S = 25;
export const OVERHEAT_AT = 100;

export const PROJECTILE_SPEED = 600;
export const PROJECTILE_LIFE_TICKS = 20;
export const OWNER_GRACE_TICKS = 1;
export const PROJECTILE_STEP = 8;

export type FireResult =
  | { readonly kind: 'miss' }
  | { readonly kind: 'overheated' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'down' }
  | { readonly kind: 'fired'; readonly projectileId: string; readonly point: Vec2 };

export interface FireGateInput {
  readonly heat: number;
  readonly mags: readonly number[];
  readonly reloadingS: number;
  readonly down: boolean;
}

export type FireBlock = 'down' | 'overheated' | 'empty' | 'reloading';

/**
 * Shared fire gate: the server enforces it, the client mirrors it from
 * VITALS snapshots so refused shots never play sound, flash, or intents.
 * Mirror staleness is bounded by one VITALS tick; the server stays truth.
 */
export function fireBlock(input: FireGateInput): FireBlock | null {
  if (input.down) return 'down';
  if (input.heat >= OVERHEAT_AT) return 'overheated';
  if (input.reloadingS > 0) return 'reloading';
  if ((input.mags[0] ?? 0) <= 0) return 'empty';
  return null;
}

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
  const vitals = ensureVitals(world, pawnId);
  const blocked = fireBlock({
    heat: world.heat[pawnId] ?? 0,
    mags: vitals.mags,
    reloadingS: vitals.reloadingS,
    down: shooter.health.incapacitated,
  });
  if (blocked === 'down') return { world, result: { kind: 'down' } };
  if (blocked === 'overheated') return { world, result: { kind: 'overheated' } };
  if (blocked !== null) return { world, result: { kind: 'empty' } };
  const [loaded = 0, ...spares] = vitals.mags;
  const heated: World = {
    ...world,
    heat: { ...world.heat, [pawnId]: (world.heat[pawnId] ?? 0) + HEAT_PER_SHOT },
    vitals: { ...world.vitals, [pawnId]: { ...vitals, mags: [loaded - 1, ...spares] } },
  };
  const dir = { x: Math.cos(originAngle), y: Math.sin(originAngle) };
  const muzzle = {
    x: shooter.pos.x + dir.x * (shooter.radius + 4),
    y: shooter.pos.y + dir.y * (shooter.radius + 4),
  };
  const id = `shot.${pawnId}.${world.tick}.${Object.keys(heated.projectiles).length}`;
  const projectile: ProjectileBody = {
    id,
    frameId: shooter.frameId,
    pos: muzzle,
    vel: { x: dir.x * PROJECTILE_SPEED, y: dir.y * PROJECTILE_SPEED },
    damage: weaponDamage(weapon),
    fromPawnId: pawnId,
    weapon,
    lifeTicks: PROJECTILE_LIFE_TICKS,
    graceTicks: OWNER_GRACE_TICKS,
  };
  return {
    world: { ...heated, projectiles: { ...heated.projectiles, [id]: projectile } },
    result: { kind: 'fired', projectileId: id, point: muzzle },
  };
}

export function tickProjectiles(world: World, dtSeconds: number): World {
  const ids = Object.keys(world.projectiles);
  if (ids.length === 0) return world;
  if (!(dtSeconds > 0)) return world;
  let next = world;
  for (const id of ids) {
    next = stepProjectile(next, id, dtSeconds);
  }
  return next;
}

function stepProjectile(world: World, id: string, dt: number): World {
  const shot = world.projectiles[id];
  if (shot === undefined) return world;
  const lifeTicks = shot.lifeTicks - 1;
  if (lifeTicks <= 0) return dropProjectile(world, id);
  const aged: World = {
    ...world,
    projectiles: {
      ...world.projectiles,
      [id]: { ...shot, lifeTicks, graceTicks: Math.max(0, shot.graceTicks - 1) },
    },
  };
  const travel = { x: shot.vel.x * dt, y: shot.vel.y * dt };
  const steps = Math.max(1, Math.ceil(Math.hypot(travel.x, travel.y) / PROJECTILE_STEP));
  let prev = shot.pos;
  for (let i = 1; i <= steps; i += 1) {
    const point = {
      x: shot.pos.x + (travel.x * i) / steps,
      y: shot.pos.y + (travel.y * i) / steps,
    };
    const hit = collideShot(aged, { ...shot, pos: point }, prev);
    if (hit !== undefined) return hit;
    prev = point;
  }
  const end = { x: shot.pos.x + travel.x, y: shot.pos.y + travel.y };
  const carried = carryByFrame(aged, shot.frameId, end, dt);
  const live = aged.projectiles[id];
  if (live === undefined) return aged;
  return {
    ...aged,
    projectiles: { ...aged.projectiles, [id]: { ...live, pos: carried } },
  };
}

function collideShot(world: World, shot: ProjectileBody, prev: Vec2): World | undefined {
  for (const target of Object.values(world.pawns)) {
    if (target.frameId !== shot.frameId) continue;
    if (target.id === shot.fromPawnId && shot.graceTicks > 0) continue;
    if (Math.hypot(target.pos.x - shot.pos.x, target.pos.y - shot.pos.y) >= target.radius + 2) {
      continue;
    }
    const struck = strikePawn(dropProjectile(world, shot.id), target.id, shot.damage, shot.pos);
    return recordImpact(struck, shot.pos, 'pawn', shot.frameId);
  }
  for (const wall of collidersForFrame(world, shot.frameId)) {
    const a = { x: wall.x1, y: wall.y1 };
    const b = { x: wall.x2, y: wall.y2 };
    if (!segmentsIntersect(prev, shot.pos, a, b)) continue;
    const contact = closestPointOnSegment(shot.pos, a, b);
    if (wall.id.startsWith('portal-shut.')) {
      const portalId = wall.id.slice('portal-shut.'.length);
      const damaged = damageDoor(dropProjectile(world, shot.id), portalId, shot.damage);
      return recordImpact(damaged.world, contact, 'door', shot.frameId);
    }
    const breached = breachWall(dropProjectile(world, shot.id), shot.frameId, wall, contact);
    return recordImpact(breached.world, contact, 'breach', shot.frameId);
  }
  return undefined;
}

function dropProjectile(world: World, id: string): World {
  if (world.projectiles[id] === undefined) return world;
  const projectiles = { ...world.projectiles };
  delete projectiles[id];
  return { ...world, projectiles };
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

function damageDoor(world: World, portalId: string, damage: number): { world: World } {
  const portal = world.portals[portalId];
  if (portal === undefined) return { world };
  const integrity = portal.integrity - damage;
  if (integrity > 0) {
    const portals = { ...world.portals, [portalId]: { ...portal, integrity } };
    return { world: { ...world, portals } };
  }
  const destroyed = destroyPortal({ ...portal, integrity: 0 }, world.tick);
  const portals = { ...world.portals, [portalId]: destroyed };
  return { world: { ...world, portals } };
}

function breachWall(
  world: World,
  frameId: string,
  wall: { x1: number; y1: number; x2: number; y2: number },
  point: Vec2
): { world: World } {
  const roomA = roomContainingPoint(world, frameId, point.x, point.y);
  if (roomA === undefined) return { world };
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
  return { world: { ...world, portals: { ...world.portals, [id]: hole } } };
}

function recordImpact(
  world: World,
  point: Vec2,
  kind: 'pawn' | 'door' | 'breach' | 'miss',
  frameId: string
): World {
  return {
    ...world,
    impacts: [
      ...world.impacts,
      { frameId, x: point.x, y: point.y, kind, untilTick: world.tick + IMPACT_TTL_TICKS },
    ],
  };
}

export function tickImpacts(world: World): World {
  if (world.impacts.length === 0) return world;
  const impacts = world.impacts.filter((impact) => impact.untilTick > world.tick);
  if (impacts.length === world.impacts.length) return world;
  return { ...world, impacts };
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
