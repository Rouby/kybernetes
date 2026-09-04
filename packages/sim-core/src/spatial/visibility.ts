import type { DoorState, WallSegment } from '@kybernetes/protocol';
import { type Point2D, segmentsIntersect } from './collision';
import { carveBreachedWallSegments, HESPERIA_WALLS } from './deck';

export interface VisibilityRayHit {
  angle: number;
  x: number;
  y: number;
  distance: number;
}

export function getOpaqueWallSegments(
  walls: WallSegment[],
  doors?: DoorState[],
  breaches?: string[]
): WallSegment[] {
  const carvedWalls =
    breaches && breaches.length > 0 ? carveBreachedWallSegments(walls, breaches) : walls;
  const opaqueWalls = carvedWalls.filter((w) => w.isOpaque !== false);
  if (!doors) return opaqueWalls;

  const result = [...opaqueWalls];
  for (const door of doors) {
    if (!door.isOpen) {
      result.push({
        id: door.id,
        x1: door.x1,
        y1: door.y1,
        x2: door.x2,
        y2: door.y2,
        isOpaque: true,
        isTraversable: false,
      });
    }
  }
  return result;
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

function forEachWallEndpoint(wall: WallSegment, fn: (x: number, y: number) => void): void {
  fn(wall.x1, wall.y1);
  fn(wall.x2, wall.y2);
}

function collectRayAngles(
  origin: Point2D,
  maxRadius: number,
  opaqueWalls: WallSegment[],
  circleSteps = 36
): number[] {
  const angles = new Set<number>();

  // Base circular sweep samples
  for (let i = 0; i < circleSteps; i++) {
    angles.add(-Math.PI + (i * 2 * Math.PI) / circleSteps);
  }

  // Endpoints of nearby wall segments
  const maxDistSq = (maxRadius + 50) * (maxRadius + 50);
  for (const wall of opaqueWalls) {
    forEachWallEndpoint(wall, (x, y) => {
      const dsq = (x - origin.x) ** 2 + (y - origin.y) ** 2;
      if (dsq <= maxDistSq) {
        const baseAngle = Math.atan2(y - origin.y, x - origin.x);
        angles.add(baseAngle);
        angles.add(baseAngle - 0.0001);
        angles.add(baseAngle + 0.0001);
      }
    });
  }

  return Array.from(angles).sort((a, b) => a - b);
}

function normalizeAngleDiff(angle: number, center: number): number {
  let diff = (angle - center) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

// fallow-ignore-next-line complexity
function collectConeRayAngles(
  origin: Point2D,
  maxRadius: number,
  candidateWalls: WallSegment[],
  facingAngle: number,
  fov: number,
  steps = 32
): number[] {
  const halfFov = fov / 2;
  const relAngles = new Set<number>();

  for (let i = 0; i <= steps; i++) {
    relAngles.add(-halfFov + (i / steps) * fov);
  }

  const maxDistSq = (maxRadius + 50) * (maxRadius + 50);
  for (const wall of candidateWalls) {
    forEachWallEndpoint(wall, (x, y) => {
      const dsq = (x - origin.x) ** 2 + (y - origin.y) ** 2;
      if (dsq <= maxDistSq) {
        const baseAngle = Math.atan2(y - origin.y, x - origin.x);
        const rel = normalizeAngleDiff(baseAngle, facingAngle);
        if (Math.abs(rel) <= halfFov) {
          relAngles.add(rel);
          if (rel - 0.0001 >= -halfFov) relAngles.add(rel - 0.0001);
          if (rel + 0.0001 <= halfFov) relAngles.add(rel + 0.0001);
        }
      }
    });
  }

  return Array.from(relAngles)
    .sort((a, b) => a - b)
    .map((rel) => facingAngle + rel);
}

function addVertexAngles(
  angles: Set<number>,
  origin: Point2D,
  wall: WallSegment,
  limitConeSq: number,
  limitRearSq: number,
  facingAngle: number,
  halfFov: number
): void {
  forEachWallEndpoint(wall, (x, y) => {
    const dsq = (x - origin.x) ** 2 + (y - origin.y) ** 2;
    const baseAngle = Math.atan2(y - origin.y, x - origin.x);
    const rel = normalizeAngleDiff(baseAngle, facingAngle);
    const limitSq = Math.abs(rel) <= halfFov ? limitConeSq : limitRearSq;
    if (dsq <= limitSq) {
      angles.add(baseAngle);
      angles.add(baseAngle - 0.0001);
      angles.add(baseAngle + 0.0001);
    }
  });
}

// fallow-ignore-next-line complexity
function collectPerceptionRayAngles(
  origin: Point2D,
  maxRadius: number,
  perceptionRadius: number,
  candidateWalls: WallSegment[],
  facingAngle: number,
  fov: number,
  steps = 48
): number[] {
  const halfFov = fov / 2;
  const angles = new Set<number>();

  for (let i = 0; i < steps; i++) {
    angles.add(-Math.PI + (i / steps) * Math.PI * 2);
  }

  angles.add(facingAngle - halfFov - 0.0001);
  angles.add(facingAngle - halfFov + 0.0001);
  angles.add(facingAngle + halfFov - 0.0001);
  angles.add(facingAngle + halfFov + 0.0001);

  const limitConeSq = (maxRadius + 50) ** 2;
  const limitRearSq = (perceptionRadius + 15) ** 2;
  for (const wall of candidateWalls) {
    addVertexAngles(angles, origin, wall, limitConeSq, limitRearSq, facingAngle, halfFov);
  }

  return Array.from(angles)
    .map((a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
    .sort((a, b) => a - b);
}

export function filterWallsInRange(
  origin: Point2D,
  radius: number,
  walls: WallSegment[]
): WallSegment[] {
  const margin = 25;
  const minX = origin.x - radius - margin;
  const maxX = origin.x + radius + margin;
  const minY = origin.y - radius - margin;
  const maxY = origin.y + radius + margin;

  return walls.filter((w) => {
    const wMinX = Math.min(w.x1, w.x2);
    const wMaxX = Math.max(w.x1, w.x2);
    const wMinY = Math.min(w.y1, w.y2);
    const wMaxY = Math.max(w.y1, w.y2);
    return !(wMaxX < minX || wMinX > maxX || wMaxY < minY || wMinY > maxY);
  });
}

export interface ConeVisibilityOptions {
  facingAngle: number;
  fov: number;
  perceptionRadius?: number;
}

// fallow-ignore-next-line complexity
export function computeVisibilityPolygon(
  origin: Point2D,
  maxRadius: number,
  walls: WallSegment[],
  circleSteps = 36,
  cone?: ConeVisibilityOptions
): Point2D[] {
  const opaqueWalls = walls.filter((w) => w.isOpaque !== false);
  const candidateWalls = filterWallsInRange(origin, maxRadius, opaqueWalls);
  const perceptionRadius = cone?.perceptionRadius ?? 0;
  const hasPerception = perceptionRadius > 0 && cone !== undefined;

  const angles = hasPerception
    ? collectPerceptionRayAngles(
        origin,
        maxRadius,
        perceptionRadius,
        candidateWalls,
        cone.facingAngle,
        cone.fov,
        Math.max(48, circleSteps)
      )
    : cone
      ? collectConeRayAngles(
          origin,
          maxRadius,
          candidateWalls,
          cone.facingAngle,
          cone.fov,
          circleSteps
        )
      : collectRayAngles(origin, maxRadius, candidateWalls, circleSteps);

  const halfFov = cone ? cone.fov / 2 : 0;
  const hits: Point2D[] = [];
  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    let rayLimit = maxRadius;
    if (hasPerception) {
      const rel = normalizeAngleDiff(angle, cone.facingAngle);
      rayLimit = Math.abs(rel) <= halfFov ? maxRadius : perceptionRadius;
    }

    let closestDist = rayLimit;
    for (const wall of candidateWalls) {
      const dist = raySegmentIntersection(origin, dx, dy, wall);
      if (dist !== null && dist < closestDist) {
        closestDist = dist;
      }
    }

    hits.push({
      x: Number((origin.x + dx * closestDist).toFixed(2)),
      y: Number((origin.y + dy * closestDist).toFixed(2)),
    });
  }

  if (cone && !hasPerception) {
    return [{ x: origin.x, y: origin.y }, ...hits];
  }
  return hits;
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

/**
 * Evaluates whether an impact (spark event, explosion, or hit point) is visible
 * to an observer, checking distance and line-of-sight against opaque walls and closed doors.
 */
export function isImpactVisible(
  observer: Point2D,
  target: Point2D,
  doors?: DoorState[],
  walls: WallSegment[] = HESPERIA_WALLS,
  maxDistance = 650
): boolean {
  const dx = target.x - observer.x;
  const dy = target.y - observer.y;
  const distSq = dx * dx + dy * dy;
  if (distSq > maxDistance * maxDistance) return false;
  if (distSq < 256) return true;

  const testPt: Point2D = {
    x: observer.x + dx * 0.96,
    y: observer.y + dy * 0.96,
  };

  const opaqueWalls = getOpaqueWallSegments(walls, doors);
  for (const seg of opaqueWalls) {
    if (segmentsIntersect(observer, testPt, { x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 })) {
      return false;
    }
  }
  return true;
}
