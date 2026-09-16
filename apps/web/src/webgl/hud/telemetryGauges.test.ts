import type { RoomAtmosphereSummary } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { subsystemGauges, watchProgress, watchRingSegments } from './telemetryGauges';

function room(over: Partial<RoomAtmosphereSummary>): RoomAtmosphereSummary {
  return {
    roomId: 'r',
    pressureKpa: 101.3,
    o2Percent: 20.9,
    co2Ppm: 400,
    tempCelsius: 21,
    toxicSmokePercent: 0,
    isVenting: false,
    isRepressurizing: false,
    activeFires: 0,
    activeBreaches: 0,
    ...over,
  };
}

describe('subsystemGauges', () => {
  it('reports nominal hull and atmosphere', () => {
    const gauges = subsystemGauges({ a: room({}), b: room({}) });
    expect(gauges).toMatchObject({ roomCount: 2, breachCount: 0, breachPct: 0, atmosPct: 100 });
  });

  it('tracks breaches and pressure loss dynamically', () => {
    const gauges = subsystemGauges({
      a: room({}),
      b: room({ pressureKpa: 50.65, isVenting: true, activeBreaches: 1 }),
      c: room({ pressureKpa: 0, isVenting: true, activeBreaches: 2 }),
      d: room({}),
    });
    expect(gauges.breachCount).toBe(2);
    expect(gauges.breachPct).toBe(50);
    expect(gauges.atmosPct).toBeCloseTo(((101.3 + 50.65 + 0 + 101.3) / 4 / 101.3) * 100, 6);
    expect(gauges.atmosPct).toBeLessThan(100);
  });

  it('defaults empty telemetry to full atmosphere', () => {
    expect(subsystemGauges(undefined)).toMatchObject({ roomCount: 0, breachPct: 0, atmosPct: 100 });
    expect(subsystemGauges({})).toMatchObject({ roomCount: 0, atmosPct: 100 });
  });
});

describe('watchProgress', () => {
  it('counts done tasks over the total', () => {
    expect(
      watchProgress([
        { completed: true },
        { completed: false },
        { completed: true },
        { completed: false },
      ])
    ).toEqual({ done: 2, total: 4, frac: 0.5 });
    expect(watchProgress(undefined)).toEqual({ done: 0, total: 0, frac: 0 });
    expect(watchProgress([])).toEqual({ done: 0, total: 0, frac: 0 });
  });
});

describe('watchRingSegments', () => {
  it('fills segments proportionally around twelve slots', () => {
    const half = watchRingSegments(100, 100, 20, 0.5);
    expect(half.filled).toHaveLength(6);
    expect(half.empty).toHaveLength(6);
    const full = watchRingSegments(100, 100, 20, 1);
    expect(full.filled).toHaveLength(12);
    expect(full.empty).toHaveLength(0);
    const none = watchRingSegments(100, 100, 20, 0);
    expect(none.filled).toHaveLength(0);
    expect(none.empty).toHaveLength(12);
  });

  it('places slices on the radius circle', () => {
    const ring = watchRingSegments(0, 0, 10, 1);
    for (const segment of ring.filled) {
      expect(Math.hypot(segment.x2, segment.y2)).toBeCloseTo(10, 6);
      expect(Math.hypot(segment.x3, segment.y3)).toBeCloseTo(10, 6);
      expect(segment.x1).toBe(0);
      expect(segment.y1).toBe(0);
    }
  });
});
