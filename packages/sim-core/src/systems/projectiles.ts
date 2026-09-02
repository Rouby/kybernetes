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
  fromPlayer: boolean
): ProjectileState {
  const dx = targetX - originX;
  const dy = targetY - originY;
  const angle = Math.atan2(dy, dx);
  const speed = fromPlayer ? 450 : 350;

  let damage = 25;
  let color = '#00e5ff';

  if (weaponType === 'pulse_laser') {
    damage = 40;
    color = '#ffea00';
  } else if (weaponType === 'arc_welder') {
    damage = 65;
    color = '#76ff03';
  } else if (weaponType === 'raider_plasma') {
    damage = 15;
    color = '#ff1744';
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
    lifeSeconds: 1.6,
  };
}

export interface ProjectileTickResult {
  nextProjectiles: ProjectileState[];
  damagedIntruders: Array<{ id: string; damage: number }>;
  playerDamageTaken: number;
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
      // Check collision with intruders
      const hitIntruder = intruders.find(
        (i) => i.state !== 'neutralized' && Math.hypot(i.x - nextX, i.y - nextY) < 18
      );
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
