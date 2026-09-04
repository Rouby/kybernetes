import { describe, expect, it } from 'vitest';
import {
  calculateDistanceAttenuation,
  calculateSpatialAcoustics,
  calculateStereoPan,
  countBulkheadIntersections,
  getOcclusionAcoustics,
} from './acoustics';

describe('spatial acoustics math', () => {
  it('calculates full volume within min distance', () => {
    expect(calculateDistanceAttenuation(30, 70)).toBe(1.0);
    expect(calculateDistanceAttenuation(70, 70)).toBe(1.0);
  });

  it('calculates smooth falloff beyond min distance', () => {
    const atRef = calculateDistanceAttenuation(390, 70, 320, 1.0);
    expect(atRef).toBeCloseTo(0.5, 2);
  });

  it('calculates stereo panning correctly', () => {
    expect(calculateStereoPan(0)).toBe(0);
    expect(calculateStereoPan(450, 450)).toBe(1);
    expect(calculateStereoPan(-450, 450)).toBe(-1);
    expect(calculateStereoPan(900, 450)).toBe(1);
  });

  it('returns appropriate filter cutoffs for bulkhead counts', () => {
    expect(getOcclusionAcoustics(0).cutoffHz).toBe(20000);
    expect(getOcclusionAcoustics(0).gainFactor).toBe(1.0);

    expect(getOcclusionAcoustics(1).cutoffHz).toBe(1200);
    expect(getOcclusionAcoustics(1).gainFactor).toBeCloseTo(0.63, 2);

    expect(getOcclusionAcoustics(2).cutoffHz).toBe(380);
    expect(getOcclusionAcoustics(2).gainFactor).toBe(0.25);
  });

  it('detects wall intersections between bridge and quarters', () => {
    const count = countBulkheadIntersections(220, 290, 680, 290);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('calculates spatial acoustics with direct line of sight', () => {
    const result = calculateSpatialAcoustics(150, 290, 200, 290);
    expect(result.wallIntersections).toBe(0);
    expect(result.filterCutoffHz).toBe(20000);
    expect(result.gain).toBe(1.0);
    expect(result.pan).toBeGreaterThan(0);
  });
});
