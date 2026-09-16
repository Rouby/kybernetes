/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { SpatialFoleyPool } from './SpatialFoleyPool';

function mockSpatializer(gain: number) {
  const input = {};
  return {
    calculate: vi.fn(() => ({ gain })),
    acquireChannel: vi.fn(() => ({ input })),
    releaseChannel: vi.fn(),
    applySpatialParams: vi.fn(),
    input,
  };
}

describe('SpatialFoleyPool', () => {
  it('checks out panned voices above the gain floor', () => {
    const spatializer = mockSpatializer(0.5);
    const pool = new SpatialFoleyPool(spatializer as never, {} as AudioNode);
    expect(pool.acquire(0, 0, 10, 20, [], 0.03, 0.6)).toBe(spatializer.input);
    expect(spatializer.calculate).toHaveBeenCalledWith(0, 0, 10, 20, []);
    expect(spatializer.acquireChannel).toHaveBeenCalledWith({}, 0.6);
    expect(spatializer.applySpatialParams).toHaveBeenCalledTimes(1);
  });

  it('culls inaudible voices without touching the pool', () => {
    const spatializer = mockSpatializer(0.01);
    const pool = new SpatialFoleyPool(spatializer as never, {} as AudioNode);
    expect(pool.acquire(0, 0, 10, 20, [], 0.03, 0.6)).toBeNull();
    expect(spatializer.acquireChannel).not.toHaveBeenCalled();
  });
});
