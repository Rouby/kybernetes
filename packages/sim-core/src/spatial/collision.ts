import type { StationFixture, WallSegment } from '@kybernetes/protocol';

export interface Point2D {
  x: number;
  y: number;
}

export function closestPointOnSegment(p: Point2D, a: Point2D, b: Point2D): Point2D {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq === 0) return { x: a.x, y: a.y };

  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));

  return {
    x: a.x + t * abx,
    y: a.y + t * aby,
  };
}

export function distanceToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const closest = closestPointOnSegment(p, a, b);
  const dx = p.x - closest.x;
  const dy = p.y - closest.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function resolveWallCollision(
  p: Point2D,
  radius: number,
  wall: WallSegment
): { resolved: Point2D; collided: boolean } {
  if (wall.isTraversable) return { resolved: p, collided: false };

  const a = { x: wall.x1, y: wall.y1 };
  const b = { x: wall.x2, y: wall.y2 };
  const closest = closestPointOnSegment(p, a, b);

  const dx = p.x - closest.x;
  const dy = p.y - closest.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist >= radius) {
    return { resolved: p, collided: false };
  }

  // Penetration detected: push circle out along normal
  if (dist === 0) {
    // Arbitrary push if center exactly on segment
    return { resolved: { x: p.x, y: p.y + radius }, collided: true };
  }

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = radius - dist;

  return {
    resolved: {
      x: Number((p.x + nx * overlap).toFixed(2)),
      y: Number((p.y + ny * overlap).toFixed(2)),
    },
    collided: true,
  };
}

// fallow-ignore-next-line complexity
export function resolvePawnMovement(
  currentX: number,
  currentY: number,
  targetX: number,
  targetY: number,
  radius: number,
  walls: WallSegment[]
): { x: number; y: number; collided: boolean } {
  let posX = targetX;
  let posY = targetY;
  let anyCollision = false;

  // Separate axis test to enable smooth wall-sliding along orthogonal bulkheads
  for (const wall of walls) {
    if (wall.isTraversable) continue;

    // Tunneling check: did movement vector cross the wall segment?
    if (
      segmentsIntersect(
        { x: currentX, y: currentY },
        { x: posX, y: posY },
        { x: wall.x1, y: wall.y1 },
        { x: wall.x2, y: wall.y2 }
      )
    ) {
      anyCollision = true;
      const isHoriz = Math.abs(wall.y2 - wall.y1) < Math.abs(wall.x2 - wall.x1);
      if (isHoriz) {
        posY = currentY < wall.y1 ? wall.y1 - radius : wall.y1 + radius;
      } else {
        posX = currentX < wall.x1 ? wall.x1 - radius : wall.x1 + radius;
      }
    }

    const resX = resolveWallCollision({ x: posX, y: currentY }, radius, wall);
    if (resX.collided) {
      posX = resX.resolved.x;
      anyCollision = true;
    }

    const resY = resolveWallCollision({ x: posX, y: posY }, radius, wall);
    if (resY.collided) {
      posY = resY.resolved.y;
      anyCollision = true;
    }
  }

  return {
    x: Number(posX.toFixed(2)),
    y: Number(posY.toFixed(2)),
    collided: anyCollision,
  };
}

export function findNearestStation(
  pawnX: number,
  pawnY: number,
  stations: StationFixture[],
  interactRadius: number = 48
): { station: StationFixture; distance: number } | null {
  let nearest: { station: StationFixture; distance: number } | null = null;
  let minDistance = interactRadius;

  for (const station of stations) {
    const dx = station.x - pawnX;
    const dy = station.y - pawnY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const effectiveInteractDist = Math.max(interactRadius, station.radius + 20);

    if (dist <= effectiveInteractDist && dist < minDistance) {
      minDistance = dist;
      nearest = { station, distance: Number(dist.toFixed(2)) };
    }
  }

  return nearest;
}

export function segmentsIntersect(p1: Point2D, p2: Point2D, q1: Point2D, q2: Point2D): boolean {
  const ccw = (a: Point2D, b: Point2D, c: Point2D) =>
    (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  return ccw(p1, q1, q2) !== ccw(p2, q1, q2) && ccw(p1, p2, q1) !== ccw(p1, p2, q2);
}

export function isSegmentBlockedByDoors(
  p1: Point2D,
  p2: Point2D,
  doors?: Array<{ isOpen: boolean; x1: number; y1: number; x2: number; y2: number }>
): boolean {
  if (!doors) return false;
  return doors.some(
    (d) => !d.isOpen && segmentsIntersect(p1, p2, { x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 })
  );
}
