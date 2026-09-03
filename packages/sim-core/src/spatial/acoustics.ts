import type { DoorState, WallSegment } from '@kybernetes/protocol';
import { segmentsIntersect } from './collision';
import { HESPERIA_WALLS } from './deck';
import { getOpaqueWallSegments } from './visibility';

export interface SpatialAudioMathParams {
  gain: number;
  pan: number;
  filterCutoffHz: number;
  distance: number;
  wallIntersections: number;
}

export interface AcousticConfig {
  minDistance?: number;
  referenceDistance?: number;
  falloffFactor?: number;
  panSpread?: number;
}

export const DEFAULT_ACOUSTIC_CONFIG: Required<AcousticConfig> = {
  minDistance: 70,
  referenceDistance: 320,
  falloffFactor: 1.2,
  panSpread: 450,
};

export function calculateDistanceAttenuation(
  dist: number,
  minDist = DEFAULT_ACOUSTIC_CONFIG.minDistance,
  refDist = DEFAULT_ACOUSTIC_CONFIG.referenceDistance,
  falloff = DEFAULT_ACOUSTIC_CONFIG.falloffFactor
): number {
  if (dist <= minDist) return 1.0;
  const effective = dist - minDist;
  const denom = refDist + falloff * effective;
  if (denom <= 0) return 0;
  return Math.max(0, Math.min(1, refDist / denom));
}

export function calculateStereoPan(dx: number, spread = DEFAULT_ACOUSTIC_CONFIG.panSpread): number {
  if (spread <= 0) return 0;
  return Math.max(-1, Math.min(1, dx / spread));
}

export function countBulkheadIntersections(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  walls: WallSegment[] = HESPERIA_WALLS,
  doors?: DoorState[]
): number {
  const p1 = { x: x1, y: y1 };
  const p2 = { x: x2, y: y2 };
  const opaqueSegments = getOpaqueWallSegments(walls, doors);

  let count = 0;
  for (const seg of opaqueSegments) {
    const q1 = { x: seg.x1, y: seg.y1 };
    const q2 = { x: seg.x2, y: seg.y2 };
    if (segmentsIntersect(p1, p2, q1, q2)) {
      count++;
    }
  }
  return count;
}

export function getOcclusionAcoustics(intersections: number): {
  cutoffHz: number;
  gainFactor: number;
} {
  if (intersections === 0) {
    return { cutoffHz: 20000, gainFactor: 1.0 };
  }
  if (intersections === 1) {
    return { cutoffHz: 1200, gainFactor: 0.63 };
  }
  return { cutoffHz: 380, gainFactor: 0.25 };
}

export function calculateSpatialAcoustics(
  listenerX: number,
  listenerY: number,
  emitterX: number,
  emitterY: number,
  doors?: DoorState[],
  walls: WallSegment[] = HESPERIA_WALLS,
  config = DEFAULT_ACOUSTIC_CONFIG
): SpatialAudioMathParams {
  const dx = emitterX - listenerX;
  const dy = emitterY - listenerY;
  const distance = Math.hypot(dx, dy);

  const baseGain = calculateDistanceAttenuation(
    distance,
    config.minDistance,
    config.referenceDistance,
    config.falloffFactor
  );

  const pan = calculateStereoPan(dx, config.panSpread);
  const wallIntersections = countBulkheadIntersections(
    listenerX,
    listenerY,
    emitterX,
    emitterY,
    walls,
    doors
  );

  const { cutoffHz, gainFactor } = getOcclusionAcoustics(wallIntersections);

  return {
    gain: baseGain * gainFactor,
    pan,
    filterCutoffHz: cutoffHz,
    distance,
    wallIntersections,
  };
}
