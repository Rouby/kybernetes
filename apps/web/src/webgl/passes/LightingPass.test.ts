import { describe, expect, it } from 'vitest';
import { isOccludedFromPlayer } from './LightingPass';

const TRIANGLE = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 0, y: 10 },
];

describe('isOccludedFromPlayer', () => {
  it('culls non-player lights outside sight', () => {
    expect(isOccludedFromPlayer(20, 20, false, TRIANGLE)).toBe(true);
  });

  it('keeps non-player lights inside sight', () => {
    expect(isOccludedFromPlayer(2, 2, false, TRIANGLE)).toBe(false);
  });

  it('never culls player sources', () => {
    expect(isOccludedFromPlayer(20, 20, true, TRIANGLE)).toBe(false);
  });

  it('never culls without a usable polygon', () => {
    expect(isOccludedFromPlayer(20, 20, false, undefined)).toBe(false);
    expect(isOccludedFromPlayer(20, 20, false, [])).toBe(false);
    expect(isOccludedFromPlayer(20, 20, false, TRIANGLE.slice(0, 2))).toBe(false);
  });
});
