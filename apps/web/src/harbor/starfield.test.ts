import { describe, expect, it } from 'vitest';
import { driftStars, makeStars } from './starfield';

describe('menu starfield', () => {
  it('generates deterministic bounded stars', () => {
    const first = makeStars(7, 40, 800, 600);
    const second = makeStars(7, 40, 800, 600);
    expect(first).toEqual(second);
    expect(first).toHaveLength(40);
    for (const star of first) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThanOrEqual(800);
      expect(star.z).toBeGreaterThanOrEqual(0.25);
      expect(star.z).toBeLessThanOrEqual(1);
    }
    expect(makeStars(8, 40, 800, 600)).not.toEqual(first);
    expect(makeStars(7, 0, 800, 600)).toEqual([]);
  });

  it('drifts nearer stars faster and wraps at the edge', () => {
    const stars = [
      { x: 100, y: 50, z: 1, tw: 0 },
      { x: 100, y: 50, z: 0.25, tw: 0 },
      { x: 1, y: 50, z: 1, tw: 0 },
    ];
    const drifted = driftStars(stars, 1, 800, 14);
    expect(drifted[0]?.x ?? 0).toBeLessThan(drifted[1]?.x ?? 0);
    expect(drifted[2]?.x ?? 0).toBeGreaterThan(700);
    expect(drifted[0]?.tw).toBeGreaterThan(0);
    expect(driftStars(stars, 0, 800)).toEqual(stars);
    expect(driftStars(stars, Number.NaN, 800)).toEqual(stars);
  });
});
