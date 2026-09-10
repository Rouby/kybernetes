import { describe, expect, it } from 'vitest';
import {
  autoLayout,
  CRATE_BOUNDS,
  cratesNeededFor,
  layoutEfficiency,
  overlaps,
  tryPlace,
} from './packGame.js';

describe('packGame free-place puzzle (M4)', () => {
  it('rejects overlapping and out-of-bounds placement', () => {
    const first = { goodId: 'scrap', x: 0, y: 0, w: 50, h: 40 };
    expect(tryPlace([], first).ok).toBe(true);
    expect(tryPlace([first], { goodId: 'scrap', x: 10, y: 10, w: 50, h: 40 }).ok).toBe(false);
    expect(tryPlace([], { goodId: 'scrap', x: 200, y: 200, w: 50, h: 40 }).ok).toBe(false);
  });

  it('detects overlap geometry', () => {
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 11, w: 10, h: 10 })).toBe(false);
  });

  it('auto-packs rations without overlap', () => {
    const placed = autoLayout('rations', 6);
    expect(placed.length).toBeGreaterThan(0);
    for (let i = 0; i < placed.length; i += 1) {
      const rest = placed.filter((_, index) => index !== i);
      const box = placed[i];
      if (box === undefined) continue;
      expect(tryPlace(rest, box).ok).toBe(true);
    }
    expect(layoutEfficiency(placed, CRATE_BOUNDS)).toBeGreaterThan(0);
  });

  it('estimates one crate for small buys', () => {
    expect(cratesNeededFor('rations', 3)).toBe(1);
    expect(cratesNeededFor('scrap', 1)).toBe(1);
  });
});
