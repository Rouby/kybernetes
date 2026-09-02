import type { WallSegment } from '@kybernetes/protocol';
import type { Point2D } from './collision';

export interface VisibilityRayHit {
  angle: number;
  x: number;
  y: number;
  distance: number;
}

function raySegmentIntersection(
  origin: Point2D,
  dx: number,
  dy: number,
  wall: WallSegment
): number | null {
  const x1 = wall.x1;
  const y1 = wall.y1;
  const x2 = wall.x2;
  const y2 = wall.y2;

  const v1x = origin.x - x1;
  const v1y = origin.y - y1;
  const v2x = x2 - x1;
  const v2y = y2 - y1;

  const denom = v2y * dx - v2x * dy;
  if (Math.abs(denom) < 1e-6) return null;

  const t1 = (v2x * v1y - v2y * v1x) / denom;
  const t2 = (dx * v1y - dy * v1x) / denom;

  if (t1 > 0 && t2 >= 0 && t2 <= 1) {
    return t1;
  }
  return null;
}

function collectRayAngles(
  origin: Point2D,
  maxRadius: number,
  opaqueWalls: WallSegment[]
): number[] {
  const angles = new Set<number>();

  // Base circular sweep samples
  const circleSteps = 32;
  for (let i = 0; i < circleSteps; i++) {
    angles.add(-Math.PI + (i * 2 * Math.PI) / circleSteps);
  }

  // Endpoints of nearby wall segments
  const maxDistSq = (maxRadius + 50) * (maxRadius + 50);
  for (const wall of opaqueWalls) {
    for (const pt of [
      { x: wall.x1, y: wall.y1 },
      { x: wall.x2, y: wall.y2 },
    ]) {
      const dsq = (pt.x - origin.x) ** 2 + (pt.y - origin.y) ** 2;
      if (dsq <= maxDistSq) {
        const baseAngle = Math.atan2(pt.y - origin.y, pt.x - origin.x);
        angles.add(baseAngle);
        angles.add(baseAngle - 0.0001);
        angles.add(baseAngle + 0.0001);
      }
    }
  }

  return Array.from(angles).sort((a, b) => a - b);
}

export function computeVisibilityPolygon(
  origin: Point2D,
  maxRadius: number,
  walls: WallSegment[]
): Point2D[] {
  const opaqueWalls = walls.filter((w) => w.isOpaque !== false);
  const angles = collectRayAngles(origin, maxRadius, opaqueWalls);
  const polygon: Point2D[] = [];

  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let closestDist = maxRadius;

    for (const wall of opaqueWalls) {
      const dist = raySegmentIntersection(origin, dx, dy, wall);
      if (dist !== null && dist < closestDist) {
        closestDist = dist;
      }
    }

    polygon.push({
      x: Number((origin.x + dx * closestDist).toFixed(2)),
      y: Number((origin.y + dy * closestDist).toFixed(2)),
    });
  }

  return polygon;
}

export function isPointInFlashlightCone(
  origin: Point2D,
  target: Point2D,
  facingAngle: number,
  fovRadians: number = Math.PI / 2,
  flashlightRange: number = 320,
  ambientRange: number = 80
): boolean {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Immediate ambient sphere awareness
  if (dist <= ambientRange) return true;
  if (dist > flashlightRange) return false;

  const targetAngle = Math.atan2(dy, dx);
  let angleDiff = Math.abs(targetAngle - facingAngle);
  while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - 2 * Math.PI);

  return angleDiff <= fovRadians / 2;
}
