import type { DoorState, ProjectileState } from '@kybernetes/protocol';
import { HESPERIA_WALLS, isSegmentBlockedByDoors, segmentsIntersect } from '@kybernetes/sim-core';
import { type MutableRefObject, useEffect, useRef } from 'react';

export interface PredictedProjectile extends ProjectileState {
  spawnTime: number;
}

type ProjectileImpactCallback = (
  x: number,
  y: number,
  type: 'kinetic' | 'laser' | 'welder'
) => void;

function reconcileProjectiles(
  current: PredictedProjectile[],
  incoming: ProjectileState[],
  now: number
): PredictedProjectile[] {
  const serverMap = new Map(incoming.map((p) => [p.id, p]));
  const preserved = current.filter(
    (p) => (p.fromPlayer && now - p.spawnTime < 350) || serverMap.has(p.id)
  );

  for (const sp of incoming) {
    const existing = preserved.find((lp) => lp.id === sp.id);
    if (!existing) {
      preserved.push({ ...sp, spawnTime: now });
    } else if (Math.hypot(existing.x - sp.x, existing.y - sp.y) > 25) {
      existing.x = sp.x;
      existing.y = sp.y;
    }
  }
  return preserved;
}

// fallow-ignore-next-line complexity
function integrateProjectiles(
  projectiles: PredictedProjectile[],
  dt: number,
  doors: DoorState[],
  onImpact?: ProjectileImpactCallback
): PredictedProjectile[] {
  const result: PredictedProjectile[] = [];
  for (const p of projectiles) {
    const nextX = p.x + p.vx * dt;
    const nextY = p.y + p.vy * dt;
    const nextLife = p.lifeSeconds - dt;

    if (nextLife <= 0) {
      if (p.weaponType === 'arc_welder') {
        onImpact?.(nextX, nextY, 'welder');
      }
      continue;
    }

    const p1 = { x: p.x, y: p.y };
    const p2 = { x: nextX, y: nextY };

    // Line-segment collision with ship bulkheads
    const hitWall = HESPERIA_WALLS.some(
      (w) =>
        !w.isTraversable && segmentsIntersect(p1, p2, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 })
    );

    // Line-segment collision with closed blast doors
    const hitDoor = isSegmentBlockedByDoors(p1, p2, doors);

    if (hitWall || hitDoor) {
      const type =
        p.weaponType === 'pulse_laser'
          ? 'laser'
          : p.weaponType === 'arc_welder'
            ? 'welder'
            : 'kinetic';
      onImpact?.(nextX, nextY, type);
      continue;
    }

    p.x = nextX;
    p.y = nextY;
    p.lifeSeconds = nextLife;
    result.push(p);
  }
  return result;
}

export interface UsePredictiveProjectilesReturn {
  localProjectilesRef: MutableRefObject<PredictedProjectile[]>;
  addPredictedProjectile: (proj: ProjectileState, now?: number) => void;
  stepProjectiles: (
    dt: number,
    doors: DoorState[],
    onImpact?: ProjectileImpactCallback
  ) => PredictedProjectile[];
}

export function usePredictiveProjectiles(
  incomingProjectiles: ProjectileState[] | undefined
): UsePredictiveProjectilesReturn {
  const localProjectilesRef = useRef<PredictedProjectile[]>([]);

  useEffect(() => {
    if (!incomingProjectiles) return;
    localProjectilesRef.current = reconcileProjectiles(
      localProjectilesRef.current,
      incomingProjectiles,
      performance.now()
    );
  }, [incomingProjectiles]);

  const addPredictedProjectile = (proj: ProjectileState, now = performance.now()) => {
    localProjectilesRef.current.push({ ...proj, spawnTime: now });
  };

  const stepProjectiles = (dt: number, doors: DoorState[], onImpact?: ProjectileImpactCallback) => {
    localProjectilesRef.current = integrateProjectiles(
      localProjectilesRef.current,
      dt,
      doors,
      onImpact
    );
    return localProjectilesRef.current;
  };

  return {
    localProjectilesRef,
    addPredictedProjectile,
    stepProjectiles,
  };
}
