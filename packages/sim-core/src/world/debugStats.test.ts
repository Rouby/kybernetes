import { describe, expect, it } from 'vitest';
import { linkAgeOf, msgsPerSOf, pushTickSample, tickMsAvgOf, tpsOf } from './debugStats.js';

describe('observer debug stats math', () => {
  it('measures TPS over a 5s window', () => {
    let samples: ReturnType<typeof pushTickSample> = [];
    for (let i = 0; i < 20; i += 1)
      samples = pushTickSample(samples, { atMs: i * 50, durationMs: 2 });
    expect(tpsOf(samples, 1000)).toBeCloseTo(20, 0);
    expect(tpsOf([], 1000)).toBe(0);
  });

  it('drops samples outside the window', () => {
    let samples: ReturnType<typeof pushTickSample> = [];
    samples = pushTickSample(samples, { atMs: 0, durationMs: 5 });
    samples = pushTickSample(samples, { atMs: 10000, durationMs: 1 });
    expect(samples).toHaveLength(1);
    expect(tickMsAvgOf(samples)).toBeCloseTo(1, 5);
  });

  it('buckets pawn link quality', () => {
    expect(msgsPerSOf(60, 5000)).toBeCloseTo(12, 5);
    expect(msgsPerSOf(0, 0)).toBe(0);
    expect(linkAgeOf(1000, 1120)).toBe(120);
    expect(linkAgeOf(0, 1120)).toBe(-1);
  });
});
