import type {
  DoorState,
  IntruderState,
  PartitionHole,
  ProjectileState,
  WallSegment,
  WeaponType,
} from '@kybernetes/protocol';
import { isSegmentBlockedByDoors, segmentsIntersect } from '../spatial/collision';
import {
  applyShipOffsetToWalls,
  type DockFrameOffset,
  findRoomAtHullImpact,
  HESPERIA_WALLS,
  isShipSideWall,
} from '../spatial/deck';
import { getWorldDoors } from '../spatial/doors';

export function createProjectile(
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  weaponType: WeaponType | 'raider_plasma',
  fromPlayer: boolean,
  chargeRatio = 1.0,
  initialVelocity?: { vx: number; vy: number }
): ProjectileState {
  const dx = targetX - originX;
  const dy = targetY - originY;
  const angle = Math.atan2(dy, dx);
  let speed = fromPlayer
    ? weaponType === 'kinetic_carbine'
      ? 1050
      : weaponType === 'railgun_pistol'
        ? 1400
        : 620
    : 360;
  let damage = 25;
  let color = '#ffd166'; // Hot metallic brass bullet
  let lifeSeconds = weaponType === 'kinetic_carbine' ? 0.9 : 1.2;

  if (weaponType === 'railgun_pistol') {
    speed = 1400; // Hypervelocity tungsten sabot
    damage = 80; // Devastating kinetic punch
    color = '#ffeaa7'; // Blinding white-hot sabot slug
    lifeSeconds = 0.75;
  } else if (weaponType === 'pulse_laser') {
    const clampedCharge = Math.max(0.2, Math.min(1.0, chargeRatio));
    speed = Math.round(480 + clampedCharge * 120);
    damage = Math.round(20 + clampedCharge * 70); // 20 to 90 damage based on charge!
    color = '#00f0ff'; // Electric cyan energy burst
    lifeSeconds = 0.85;
  } else if (weaponType === 'arc_welder') {
    speed = 850; // Ultra-fast electric zap
    damage = 65;
    color = '#00e5ff'; // Electric arc
    lifeSeconds = 0.16; // Short-range reach (~48px)
  } else if (weaponType === 'raider_plasma') {
    speed = 360;
    damage = 15;
    color = '#ff1744';
    lifeSeconds = 1.4;
  }

  const baseVx = Math.cos(angle) * speed;
  const baseVy = Math.sin(angle) * speed;
  const totalVx = baseVx + (initialVelocity?.vx ?? 0);
  const totalVy = baseVy + (initialVelocity?.vy ?? 0);

  return {
    id: `proj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    x: originX,
    y: originY,
    vx: Number(totalVx.toFixed(2)),
    vy: Number(totalVy.toFixed(2)),
    damage,
    color,
    fromPlayer,
    lifeSeconds,
    maxLife: lifeSeconds,
    weaponType,
    chargeRatio,
  };
}

// fallow-ignore-next-line complexity
export function applyWelderAoeDamage(
  intruders: IntruderState[],
  originX: number,
  originY: number,
  facingAngle: number,
  damage: number,
  range = 48,
  doors?: DoorState[],
  offset: DockFrameOffset = { x: 0, y: 0 }
): { nextIntruders: IntruderState[]; hitIntruders: Array<{ id: string; damage: number }> } {
  const hitIntruders: Array<{ id: string; damage: number }> = [];
  const halfCone = (40 * Math.PI) / 180; // 40-degree cone
  const p1 = { x: originX, y: originY };
  const worldWalls = applyShipOffsetToWalls(HESPERIA_WALLS, offset);
  const worldDoors = doors ? getWorldDoors(doors, offset) : undefined;

  const nextIntruders = intruders.map((i) => {
    if (i.state === 'neutralized') return i;
    const dx = i.x - originX;
    const dy = i.y - originY;
    const dist = Math.hypot(dx, dy);
    if (dist > range) return i;

    const angleToIntruder = Math.atan2(dy, dx);
    let diff = Math.abs(angleToIntruder - facingAngle);
    while (diff > Math.PI) diff = Math.abs(diff - 2 * Math.PI);
    if (diff > halfCone) return i;

    // Check line-of-sight collision against bulkheads
    const p2 = { x: i.x, y: i.y };
    const hitWall = worldWalls.some(
      (w) =>
        !w.isTraversable && segmentsIntersect(p1, p2, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 })
    );
    if (hitWall) return i;

    // Check line-of-sight collision against closed blast doors
    if (isSegmentBlockedByDoors(p1, p2, worldDoors)) return i;

    hitIntruders.push({ id: i.id, damage });
    const nextHealth = Math.max(0, i.health - damage);
    return {
      ...i,
      health: nextHealth,
      state: nextHealth <= 0 ? ('neutralized' as const) : i.state,
    };
  });

  return { nextIntruders, hitIntruders };
}

export interface ProjectileTickResult {
  nextProjectiles: ProjectileState[];
  damagedIntruders: Array<{ id: string; damage: number }>;
  playerDamageTaken: number;
  newBreaches?: string[];
  partitionHits?: PartitionHole[];
  hullDamageTaken?: number;
}

function getWallHitPoint(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  wall: WallSegment
): { x: number; y: number } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const wx = wall.x2 - wall.x1;
  const wy = wall.y2 - wall.y1;
  const det = dx * wy - dy * wx;
  const isHorizontal = Math.abs(wall.y1 - wall.y2) < 1;
  const isVertical = Math.abs(wall.x1 - wall.x2) < 1;

  if (Math.abs(det) < 1e-5) {
    const rawX = (p1.x + p2.x) / 2;
    const rawY = (p1.y + p2.y) / 2;
    return {
      x: isVertical ? wall.x1 : Math.round(rawX),
      y: isHorizontal ? wall.y1 : Math.round(rawY),
    };
  }
  const t = Math.max(0, Math.min(1, ((wall.x1 - p1.x) * wy - (wall.y1 - p1.y) * wx) / det));
  const rawX = p1.x + t * dx;
  const rawY = p1.y + t * dy;
  return {
    x: isVertical ? wall.x1 : Math.round(rawX),
    y: isHorizontal ? wall.y1 : Math.round(rawY),
  };
}

function handleWallHit(
  proj: ProjectileState,
  hitWall: WallSegment,
  hitPos: { x: number; y: number },
  newBreaches: string[],
  partitionHits: PartitionHole[]
): number {
  const isKinetic = proj.weaponType === 'kinetic_carbine' || proj.weaponType === 'railgun_pistol';
  if (!isKinetic) return 0;

  if (hitWall.id.startsWith('hull_')) {
    const isRailgun = proj.weaponType === 'railgun_pistol';
    const punctureChance = isRailgun ? 0.35 : 0.05;
    const dmg = isRailgun ? 1.5 : 0.4;
    let didPuncture = false;
    if (Math.random() < punctureChance) {
      const roomId = findRoomAtHullImpact(hitPos.x, hitPos.y);
      if (roomId) {
        newBreaches.push(`puncture_${roomId}_${Math.round(hitPos.x)}_${Math.round(hitPos.y)}`);
        didPuncture = true;
      }
    }
    if (!didPuncture) {
      partitionHits.push({ x: hitPos.x, y: hitPos.y, wallId: hitWall.id });
    }
    return dmg;
  }

  partitionHits.push({ x: hitPos.x, y: hitPos.y, wallId: hitWall.id });
  return 0;
}

function findHitIntruder(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  intruders: IntruderState[]
): IntruderState | null {
  let firstHit: IntruderState | null = null;
  let minT = Infinity;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const l2 = dx * dx + dy * dy;

  for (const i of intruders) {
    if (i.state === 'neutralized') continue;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((i.x - p1.x) * dx + (i.y - p1.y) * dy) / l2));
    const cx = p1.x + t * dx;
    const cy = p1.y + t * dy;
    const distSq = (i.x - cx) ** 2 + (i.y - cy) ** 2;
    if (distSq < 18 * 18 && t < minT) {
      minT = t;
      firstHit = i;
    }
  }
  return firstHit;
}

// fallow-ignore-next-line complexity
export function tickProjectiles(
  projectiles: ProjectileState[],
  dtSeconds: number,
  doors: DoorState[],
  intruders: IntruderState[],
  playerPos: { x: number; y: number },
  walls: WallSegment[] = HESPERIA_WALLS,
  offset: DockFrameOffset = { x: 0, y: 0 }
): ProjectileTickResult {
  const nextProjectiles: ProjectileState[] = [];
  const damagedIntruders: Array<{ id: string; damage: number }> = [];
  const newBreaches: string[] = [];
  const partitionHits: PartitionHole[] = [];
  let playerDamageTaken = 0;
  let hullDamageTaken = 0;
  const worldWalls = applyShipOffsetToWalls(walls, offset);
  const worldDoors = getWorldDoors(doors, offset);

  for (const proj of projectiles) {
    const nextX = proj.x + proj.vx * dtSeconds;
    const nextY = proj.y + proj.vy * dtSeconds;
    const nextLife = proj.lifeSeconds - dtSeconds;

    if (nextLife <= 0) continue;

    const p1 = { x: proj.x, y: proj.y };
    const p2 = { x: nextX, y: nextY };

    // 1. Line-segment collision with world walls
    const hitWall = worldWalls.find(
      (w) =>
        !w.isTraversable && segmentsIntersect(p1, p2, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 })
    );
    if (hitWall) {
      const worldHit = getWallHitPoint(p1, p2, hitWall);
      const isShip = isShipSideWall(hitWall);
      const localHit = isShip ? { x: worldHit.x - offset.x, y: worldHit.y - offset.y } : worldHit;
      hullDamageTaken += handleWallHit(proj, hitWall, localHit, newBreaches, partitionHits);
      continue; // Projectile stopped and absorbed by wall
    }

    // 2. Line-segment collision with closed blast doors
    if (isSegmentBlockedByDoors(p1, p2, worldDoors)) continue;

    // Check collision with outer boundaries of the active frames
    const inShipBounds =
      nextX >= 50 + offset.x &&
      nextX <= 1150 + offset.x &&
      nextY >= 50 + offset.y &&
      nextY <= 650 + offset.y;
    const inStationBounds = nextX >= 50 && nextX <= 1150 && nextY >= 600 && nextY <= 1000;
    if (!inShipBounds && !inStationBounds) continue;

    if (proj.fromPlayer) {
      const hitIntruder = findHitIntruder(p1, p2, intruders);
      if (hitIntruder) {
        damagedIntruders.push({ id: hitIntruder.id, damage: proj.damage });
        continue; // Projectile absorbed
      }
    } else {
      // Check collision with player
      if (Math.hypot(playerPos.x - nextX, playerPos.y - nextY) < 16) {
        playerDamageTaken += proj.damage;
        continue; // Projectile absorbed
      }
    }

    nextProjectiles.push({
      ...proj,
      x: Number(nextX.toFixed(2)),
      y: Number(nextY.toFixed(2)),
      lifeSeconds: Number(nextLife.toFixed(3)),
    });
  }

  return {
    nextProjectiles,
    damagedIntruders,
    playerDamageTaken,
    newBreaches,
    partitionHits,
    hullDamageTaken: Number(hullDamageTaken.toFixed(2)),
  };
}
