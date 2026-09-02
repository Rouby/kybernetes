import type { DoorState, IntruderState, ProjectileState, WeaponType } from '@kybernetes/protocol';

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
  playerPos: { x: number; y: number }
): ProjectileTickResult {
  const nextProjectiles: ProjectileState[] = [];
  const damagedIntruders: Array<{ id: string; damage: number }> = [];
  let playerDamageTaken = 0;

  for (const proj of projectiles) {
    const nextX = proj.x + proj.vx * dtSeconds;
    const nextY = proj.y + proj.vy * dtSeconds;
    const nextLife = proj.lifeSeconds - dtSeconds;

    if (nextLife <= 0) continue;

    // Check collision with closed doors
    const hitDoor = doors.some(
      (d) =>
        !d.isOpen &&
        nextX >= Math.min(d.x1, d.x2) - 8 &&
        nextX <= Math.max(d.x1, d.x2) + 8 &&
        nextY >= Math.min(d.y1, d.y2) - 8 &&
        nextY <= Math.max(d.y1, d.y2) + 8
    );
    if (hitDoor) continue; // Projectile absorbed by closed door

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
