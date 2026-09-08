import { describe, expect, it } from 'vitest';
import { changedBy, digestStrings, q0, q1, q2 } from './quant.js';

describe('wire quantization', () => {
  it('rounds floats to fixed decimals for byte-stable JSON', () => {
    expect(q2(480.12345)).toBe(480.12);
    expect(q2(0.005)).toBe(0.01);
    expect(q1(21.06)).toBe(21.1);
    expect(q0(599.6)).toBe(600);
  });

  it('maps non-finite inputs to zero instead of null JSON', () => {
    expect(q2(Number.NaN)).toBe(0);
    expect(q2(Number.POSITIVE_INFINITY)).toBe(0);
    expect(q1(Number.NaN)).toBe(0);
    expect(q0(Number.NaN)).toBe(0);
  });

  it('detects change beyond epsilon only', () => {
    expect(changedBy(101.3, 101.34, 0.05)).toBe(false);
    expect(changedBy(101.3, 101.36, 0.05)).toBe(true);
    expect(changedBy(1, 1, 0)).toBe(false);
  });

  it('digests string lists deterministically for revs', () => {
    const a = digestStrings(['ship.door:open', 'ship.bay:closed']);
    expect(digestStrings(['ship.door:open', 'ship.bay:closed'])).toBe(a);
    expect(digestStrings(['ship.door:closed', 'ship.bay:closed'])).not.toBe(a);
    expect(digestStrings([])).toBe(digestStrings([]));
  });
});
