/**
 * Simulated projectiles: FIRE spawns a ticked entity with velocity; each
 * tick marches it in short substeps against pawns, shut doors, and walls.
 * Doors lose integrity and become connecting holes; breached walls add hole
 * portals the air authority picks up. Clients never send hit results.
 */

import type { WallSegment } from '@kybernetes/protocol';
import { closestPointOnSegment, segmentsIntersect } from '../spatial/collision.js';
import { roomContainingPoint } from './crew.js';
import { addDecal, decalRadiusFor, makeDecalId, shouldDecal } from './decals.js';
import { destroyPortal } from './doors.js';
import { carryByFrame, collidersForFrame } from './movement.js';
import { ensureVitals, startBleeding } from './survival.js';
import type { DamageEvent, PawnBody, PortalEdge, ProjectileBody, Vec2, World } from './types.js';

export const RIFLE_DAMAGE = 25;
export const WELDER_DAMAGE = 15;
/** A fully shredded wall section; widening never exceeds this. */
export const BREACH_AREA_M2 = 1.5;
/** What one round punches through a wall: a survivable puncture, not a doorway. */
export const BULLET_BREACH_M2 = 0.05;
/** Extra area per round landing on a live breach; sustained fire still tears walls open. */
export const BREACH_GROWTH_M2 = 0.1;
export const COMBAT_BLEED_S = 20;
export const IMPACT_TTL_TICKS = 6;
/** Aim bloom added per shot in radians; sustained fire walks rounds off aim. */
export const SPREAD_PER_SHOT = 0.03;
/** Bloom ceiling in radians; the only sustained-fire cost now that heat is gone. */
export const SPREAD_MAX = 0.2;
/** Bloom bled off per second when not firing. */
export const SPREAD_DECAY_PER_S = 0.4;

export const PROJECTILE_SPEED = 600;
export const PROJECTILE_LIFE_TICKS = 20;
export const OWNER_GRACE_TICKS = 1;
export const PROJECTILE_STEP = 8;
/** Breach portals never decay, so cap them: beyond this, wall shots spark but hold. */
export const MAX_BREACH_PORTALS = 24;
/** A wall hit this close to a live breach joins it instead of cutting a new one. */
export const BREACH_MERGE_PX = 24;

export type FireResult =
  | { readonly kind: 'miss' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'down' }
  | { readonly kind: 'fired'; readonly projectileId: string; readonly point: Vec2 };

export interface FireGateInput {
  readonly mags: readonly number[];
  readonly reloadingS: number;
  readonly down: boolean;
}

export type FireBlock = 'down' | 'empty' | 'reloading';

/**
 * Shared fire gate: the server enforces it, the client mirrors it from
 * VITALS snapshots so refused shots never play sound, flash, or intents.
 * Mirror staleness is bounded by one VITALS tick; the server stays truth.
 * Free to fire until the magazine runs dry: bloom and shake are the only
 * sustained-fire costs, and neither blocks the trigger.
 */
export function fireBlock(input: FireGateInput): FireBlock | null {
  if (input.down) return 'down';
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
    mags: vitals.mags,
    reloadingS: vitals.reloadingS,
    down: shooter.health.incapacitated,
  });
  if (blocked === 'down') return { world, result: { kind: 'down' } };
  if (blocked !== null) return { world, result: { kind: 'empty' } };
  const [loaded = 0, ...spares] = vitals.mags;
  const bloom = Math.min(SPREAD_MAX, (world.spread[pawnId] ?? 0) + SPREAD_PER_SHOT);
  const spent: World = {
    ...world,
    spread: { ...world.spread, [pawnId]: bloom },
    vitals: { ...world.vitals, [pawnId]: { ...vitals, mags: [loaded - 1, ...spares] } },
  };
  // Alternating sides around aim keeps bursts centered while widening the
  // group; tick parity is deterministic so prediction and replays agree.
  const side = world.tick % 2 === 0 ? 1 : -1;
  const dir = { x: Math.cos(originAngle + side * bloom), y: Math.sin(originAngle + side * bloom) };
  const muzzle = {
    x: shooter.pos.x + dir.x * (shooter.radius + 4),
    y: shooter.pos.y + dir.y * (shooter.radius + 4),
  };
  const id = `shot.${pawnId}.${world.tick}.${Object.keys(spent.projectiles).length}`;
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
    world: { ...spent, projectiles: { ...spent.projectiles, [id]: projectile } },
    result: { kind: 'fired', projectileId: id, point: muzzle },
  };
}

export function tickProjectiles(world: World, dtSeconds: number): World {
  const ids = Object.keys(world.projectiles);
  if (ids.length === 0) return world;
  if (!(dtSeconds > 0)) return world;
  return stepAllShots(world, ids, dtSeconds);
}

/** One collider build per frame per tick; rebuilt only when portals change. */
function stepAllShots(world: World, ids: readonly string[], dt: number): World {
  let next = world;
  let cached: World | null = null;
  let colliders = new Map<string, WallSegment[]>();
  for (const id of ids) {
    if (cached === null || cached.portals !== next.portals) {
      colliders = collidersByFrame(next);
      cached = next;
    }
    next = stepProjectile(next, id, dt, colliders);
  }
  return next;
}

function collidersByFrame(world: World): Map<string, WallSegment[]> {
  const frames = new Set<string>();
  for (const shot of Object.values(world.projectiles)) frames.add(shot.frameId);
  for (const pawn of Object.values(world.pawns)) frames.add(pawn.frameId);
  const table = new Map<string, WallSegment[]>();
  for (const frameId of frames) table.set(frameId, collidersForFrame(world, frameId));
  return table;
}

function stepProjectile(
  world: World,
  id: string,
  dt: number,
  colliders: Map<string, WallSegment[]>
): World {
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
    const hit = collideShot(aged, { ...shot, pos: point }, prev, colliders);
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

function impactAngleOf(shot: ProjectileBody): number {
  return Math.atan2(shot.vel.y, shot.vel.x);
}

function impactEnergyOf(damage: number): number {
  return Math.min(1, Math.max(0, damage / RIFLE_DAMAGE));
}

function pawnHitTarget(world: World, shot: ProjectileBody): PawnBody | undefined {
  for (const target of Object.values(world.pawns)) {
    if (target.frameId !== shot.frameId) continue;
    if (target.id === shot.fromPawnId && shot.graceTicks > 0) continue;
    if (Math.hypot(target.pos.x - shot.pos.x, target.pos.y - shot.pos.y) >= target.radius + 2) {
      continue;
    }
    return target;
  }
  return undefined;
}

function strikeDoorSurface(
  world: World,
  shot: ProjectileBody,
  wall: WallSegment,
  contact: Vec2,
  wallAngle: number,
  energy: number
): World {
  const portalId = wall.id.slice('portal-shut.'.length);
  const damaged = damageDoor(dropProjectile(world, shot.id), portalId, shot.damage);
  return recordImpact(damaged.world, contact, 'door', shot.frameId, {
    angle: wallAngle,
    weapon: shot.weapon,
    energy,
    surface: 'door',
  });
}

function strikeHullSurface(
  world: World,
  shot: ProjectileBody,
  wall: WallSegment,
  contact: Vec2,
  wallAngle: number,
  energy: number
): World {
  const breached = breachWall(dropProjectile(world, shot.id), shot.frameId, wall, contact);
  return recordImpact(breached.world, contact, 'breach', shot.frameId, {
    angle: wallAngle,
    weapon: shot.weapon,
    energy,
    surface: breached.breachId === undefined ? 'wall' : 'hull',
    breachId: breached.breachId,
  });
}

function collideWalls(
  world: World,
  shot: ProjectileBody,
  prev: Vec2,
  colliders: Map<string, WallSegment[]>,
  energy: number
): World | undefined {
  for (const wall of colliders.get(shot.frameId) ?? []) {
    const a = { x: wall.x1, y: wall.y1 };
    const b = { x: wall.x2, y: wall.y2 };
    if (!segmentsIntersect(prev, shot.pos, a, b)) continue;
    const contact = closestPointOnSegment(shot.pos, a, b);
    const wallAngle = Math.atan2(b.y - a.y, b.x - a.x);
    if (wall.id.startsWith('portal-shut.')) {
      return strikeDoorSurface(world, shot, wall, contact, wallAngle, energy);
    }
    return strikeHullSurface(world, shot, wall, contact, wallAngle, energy);
  }
  return undefined;
}

function collideShot(
  world: World,
  shot: ProjectileBody,
  prev: Vec2,
  colliders: Map<string, WallSegment[]>
): World | undefined {
  const angle = impactAngleOf(shot);
  const energy = impactEnergyOf(shot.damage);
  const target = pawnHitTarget(world, shot);
  if (target !== undefined) {
    const struck = strikePawn(dropProjectile(world, shot.id), target.id, shot.damage, shot.pos);
    return recordImpact(struck, shot.pos, 'pawn', shot.frameId, {
      angle,
      weapon: shot.weapon,
      energy,
      surface: 'pawn',
    });
  }
  return collideWalls(world, shot, prev, colliders, energy);
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

export function tickSpread(world: World, dtSeconds: number): World {
  if (!(dtSeconds > 0)) return world;
  const ids = Object.keys(world.spread);
  if (ids.length === 0) return world;
  const spread = { ...world.spread };
  for (const id of ids) {
    const next = (spread[id] ?? 0) - SPREAD_DECAY_PER_S * dtSeconds;
    if (next <= 0) delete spread[id];
    else spread[id] = next;
  }
  return { ...world, spread };
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
): { world: World; breachId?: string } {
  const roomA = roomContainingPoint(world, frameId, point.x, point.y);
  if (roomA === undefined) return { world };
  const joined = nearbyBreach(world, frameId, point);
  if (joined !== undefined) return { world: widenBreach(world, joined), breachId: joined.id };
  if (breachList(world).length >= MAX_BREACH_PORTALS) return { world };
  const roomB = roomBeyondWall(world, frameId, roomA, wall, point);
  const id = `breach.${roomA}.${world.tick}.${Object.keys(world.portals).length}`;
  const hole: PortalEdge = {
    id,
    roomA,
    roomB,
    kind: 'hole',
    state: 'destroyed',
    cooldownUntilTick: world.tick,
    areaM2: BULLET_BREACH_M2,
    segment: breachSegment(wall, point),
    clearance: 0,
    integrity: 0,
  };
  return { world: { ...world, portals: { ...world.portals, [id]: hole } }, breachId: id };
}

function breachList(world: World): PortalEdge[] {
  return Object.values(world.portals).filter((portal) => portal.id.startsWith('breach.'));
}

function nearbyBreach(world: World, frameId: string, point: Vec2): PortalEdge | undefined {
  return breachList(world).find((portal) => breachNear(world, portal, frameId, point));
}

/** Half-length px of a breach cut: tears widen progressively, never pop. */
export function breachHalfLength(areaM2: number): number {
  return Math.min(30, 12 * (0.7 + 0.6 * Math.min(1, Math.max(0, areaM2) / BREACH_AREA_M2)));
}

function widenBreach(world: World, portal: PortalEdge): World {
  const areaM2 = Math.min(BREACH_AREA_M2, portal.areaM2 + BREACH_GROWTH_M2);
  if (areaM2 === portal.areaM2) return world;
  const midX = (portal.segment.x1 + portal.segment.x2) / 2;
  const midY = (portal.segment.y1 + portal.segment.y2) / 2;
  const dx = portal.segment.x2 - portal.segment.x1;
  const dy = portal.segment.y2 - portal.segment.y1;
  const len = Math.hypot(dx, dy) || 1;
  // Never narrower than the cut that started it: tears only grow.
  const half = Math.max(len / 2, breachHalfLength(areaM2));
  const ux = dx / len;
  const uy = dy / len;
  return {
    ...world,
    portals: {
      ...world.portals,
      [portal.id]: {
        ...portal,
        areaM2,
        segment: {
          x1: midX - ux * half,
          y1: midY - uy * half,
          x2: midX + ux * half,
          y2: midY + uy * half,
        },
      },
    },
  };
}

function breachNear(world: World, portal: PortalEdge, frameId: string, point: Vec2): boolean {
  if (world.rooms[portal.roomA]?.frameId !== frameId) return false;
  const midX = (portal.segment.x1 + portal.segment.x2) / 2;
  const midY = (portal.segment.y1 + portal.segment.y2) / 2;
  return Math.hypot(point.x - midX, point.y - midY) <= BREACH_MERGE_PX;
}

export interface ImpactDetail {
  readonly angle: number;
  readonly weapon: string;
  readonly energy: number;
  readonly surface: 'wall' | 'door' | 'pawn' | 'hull' | 'shield';
  readonly breachId?: string;
}

interface ImpactStyle {
  readonly angle: number;
  readonly weapon: string;
  readonly energy: number;
  readonly surface: ImpactDetail['surface'];
}

export function resolveImpactStyle(
  detail: ImpactDetail | undefined,
  kind: 'pawn' | 'door' | 'breach' | 'miss'
): ImpactStyle {
  return {
    angle: detail?.angle ?? 0,
    weapon: detail?.weapon ?? 'kinetic_carbine',
    energy: detail === undefined ? 0.5 : Math.min(1, Math.max(0, detail.energy)),
    surface: detail?.surface ?? (kind === 'pawn' ? 'pawn' : kind === 'door' ? 'door' : 'wall'),
  };
}

function appendImpact(
  world: World,
  point: Vec2,
  kind: 'pawn' | 'door' | 'breach' | 'miss',
  frameId: string,
  detail: ImpactDetail | undefined,
  style: ImpactStyle,
  pressureKpa: number
): World {
  return {
    ...world,
    impacts: [
      ...world.impacts,
      {
        frameId,
        x: point.x,
        y: point.y,
        kind,
        untilTick: world.tick + IMPACT_TTL_TICKS,
        angle: style.angle,
        weapon: style.weapon,
        energy: style.energy,
        surface: style.surface,
        ...(detail?.breachId === undefined ? {} : { breachId: detail.breachId }),
        pressureKpa,
      },
    ],
  };
}

function withImpactDecal(
  withImpact: World,
  point: Vec2,
  kind: 'pawn' | 'door' | 'breach' | 'miss',
  frameId: string,
  detail: ImpactDetail | undefined,
  style: ImpactStyle
): World {
  if (detail === undefined || !shouldDecal(kind)) return withImpact;
  return {
    ...withImpact,
    decals: addDecal(withImpact.decals, {
      id: makeDecalId(frameId, withImpact.tick, withImpact.decals.length),
      frameId,
      x: point.x,
      y: point.y,
      angle: style.angle,
      radius: decalRadiusFor(style.weapon, style.energy),
      weapon: style.weapon,
      bornTick: withImpact.tick,
    }),
  };
}

function recordImpact(
  world: World,
  point: Vec2,
  kind: 'pawn' | 'door' | 'breach' | 'miss',
  frameId: string,
  detail?: ImpactDetail
): World {
  const style = resolveImpactStyle(detail, kind);
  const roomA = roomContainingPoint(world, frameId, point.x, point.y);
  const pressureKpa = roomA === undefined ? 0 : (world.atmos[roomA]?.pressureKpa ?? 101.3);
  const withImpact = appendImpact(world, point, kind, frameId, detail, style, pressureKpa);
  return withImpactDecal(withImpact, point, kind, frameId, detail, style);
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
