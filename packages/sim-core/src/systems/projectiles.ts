import type {
  DoorState,
  IntruderState,
  ProjectileState,
  WallSegment,
  WeaponType,
} from '@kybernetes/protocol';
import { segmentsIntersect } from '../spatial/collision';
import { HESPERIA_WALLS } from '../spatial/deck';

export function createProjectile(
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  weaponType: WeaponType | 'raider_plasma',
  fromPlayer: boolean,
  chargeRatio = 1.0
): ProjectileState {
  const dx = targetX - originX;
  const dy = targetY - originY;
  const angle = Math.atan2(dy, dx);
  let speed = fromPlayer ? 620 : 360;
  let damage = 25;
  let color = '#ffd166'; // Hot metallic brass bullet
  let lifeSeconds = 1.2;

  if (weaponType === 'pulse_laser') {
    const clampedCharge = Math.max(0.2, Math.min(1.0, chargeRatio));
    speed = Math.round(480 + clampedCharge * 120);
    damage = Math.round(20 + clampedCharge * 70); // 20 to 90 damage based on charge!
    color = '#00f0ff'; // Electric cyan energy burst
    lifeSeconds = 0.85;
  } else if (weaponType === 'arc_welder') {
    speed = 850; // Ultra-fast electric zap
    damage = 65;
    color = '#00e5ff'; // Electric arc
    lifeSeconds = 0.16; // Short-range reach (~135px)
  } else if (weaponType === 'raider_plasma') {
    speed = 360;
    damage = 15;
    color = '#ff1744';
    lifeSeconds = 1.4;
  }

  return {
    id: `proj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    x: originX,
    y: originY,
    vx: Number((Math.cos(angle) * speed).toFixed(2)),
    vy: Number((Math.sin(angle) * speed).toFixed(2)),
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
  range = 135
): { nextIntruders: IntruderState[]; hitIntruders: Array<{ id: string; damage: number }> } {
  const hitIntruders: Array<{ id: string; damage: number }> = [];
  const halfCone = (40 * Math.PI) / 180; // 40-degree cone

  const nextIntruders = intruders.map((i) => {
    if (i.state === 'neutralized') return i;
    const dx = i.x - originX;
    const dy = i.y - originY;
    const dist = Math.hypot(dx, dy);
    if (dist > range) return i;

    const angleToIntruder = Math.atan2(dy, dx);
    let diff = Math.abs(angleToIntruder - facingAngle);
    while (diff > Math.PI) diff = Math.abs(diff - 2 * Math.PI);

    if (diff <= halfCone) {
      hitIntruders.push({ id: i.id, damage });
      const nextHealth = Math.max(0, i.health - damage);
      return {
        ...i,
        health: nextHealth,
        state: nextHealth <= 0 ? ('neutralized' as const) : i.state,
      };
    }
    return i;
  });

  return { nextIntruders, hitIntruders };
}

export interface ProjectileTickResult {
  nextProjectiles: ProjectileState[];
  damagedIntruders: Array<{ id: string; damage: number }>;
  playerDamageTaken: number;
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
  walls: WallSegment[] = HESPERIA_WALLS
): ProjectileTickResult {
  const nextProjectiles: ProjectileState[] = [];
  const damagedIntruders: Array<{ id: string; damage: number }> = [];
  let playerDamageTaken = 0;

  for (const proj of projectiles) {
    const nextX = proj.x + proj.vx * dtSeconds;
    const nextY = proj.y + proj.vy * dtSeconds;
    const nextLife = proj.lifeSeconds - dtSeconds;

    if (nextLife <= 0) continue;

    const p1 = { x: proj.x, y: proj.y };
    const p2 = { x: nextX, y: nextY };

    // 1. Line-segment collision with ship walls
    const hitWall = walls.some(
      (w) =>
        !w.isTraversable && segmentsIntersect(p1, p2, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 })
    );
    if (hitWall) continue; // Projectile stopped and absorbed by wall

    // 2. Line-segment collision with closed blast doors
    const hitDoor = doors.some(
      (d) => !d.isOpen && segmentsIntersect(p1, p2, { x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 })
    );
    if (hitDoor) continue; // Projectile stopped and absorbed by closed door

    // Check collision with outer boundaries
    if (nextX < 50 || nextX > 1150 || nextY < 50 || nextY > 750) continue;

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
  };
}
