import { describe, expect, it } from 'vitest';
import {
  advanceShots,
  confirmShots,
  dropYoungShots,
  shotLifeMs,
  spawnPredictedShot,
} from './predictedShots';

describe('predicted shots', () => {
  it('spawns at the muzzle along the aim with rifle velocity', () => {
    const shot = spawnPredictedShot(1, 'station', 100, 100, 0, 'kinetic_carbine', 5000);
    expect(shot.x).toBeCloseTo(116, 5);
    expect(shot.y).toBeCloseTo(100, 5);
    expect(shot.vx).toBe(600);
    expect(shot.vy).toBe(0);
    expect(shot.bornMs).toBe(5000);
  });

  it('advances linearly and expires past projectile life', () => {
    const shot = spawnPredictedShot(1, 'station', 0, 0, 0, 'kinetic_carbine', 0);
    const moved = advanceShots([shot], 100, 0.1);
    expect(moved).toHaveLength(1);
    expect(moved[0]?.x ?? 0).toBeGreaterThan(shot.x);
    expect(advanceShots([shot], shotLifeMs() + 1, 0.1)).toEqual([]);
  });

  it('drops predictions the server has taken over, keeps the rest', () => {
    const confirmed = spawnPredictedShot(1, 'station', 0, 0, 0, 'kinetic_carbine', 0);
    const stray = spawnPredictedShot(2, 'station', 500, 500, 0, 'kinetic_carbine', 0);
    const otherFrame = spawnPredictedShot(3, 'ship', 16, 0, 0, 'kinetic_carbine', 0);
    const server = [{ frameId: 'station', x: confirmed.x + 10, y: confirmed.y }];
    const kept = confirmShots([confirmed, stray, otherFrame], server);
    expect(kept.map((shot) => shot.id)).toEqual([2, 3]);
  });

  it('clears young unconfirmed shots on refused fire notices', () => {
    const fresh = spawnPredictedShot(1, 'station', 0, 0, 0, 'kinetic_carbine', 1000);
    const old = spawnPredictedShot(2, 'station', 0, 0, 0, 'kinetic_carbine', 0);
    expect(dropYoungShots([fresh, old], 1200, 600).map((shot) => shot.id)).toEqual([2]);
  });
});
