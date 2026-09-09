import { HesperiaV2Spec } from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import { HULL_SILHOUETTE, isPointInHullSilhouette, THRUSTER_BELLS } from './passes/DeckPass';

describe('hull silhouette visuals', () => {
  it('forms a tapered loop extending beyond the room block', () => {
    expect(HULL_SILHOUETTE.length).toBeGreaterThanOrEqual(10);
    const xs = HULL_SILHOUETTE.map((p) => p.x);
    const ys = HULL_SILHOUETTE.map((p) => p.y);
    expect(Math.min(...ys)).toBeLessThan(-20);
    expect(Math.max(...ys)).toBeGreaterThan(720);
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(220);
  });

  it('encloses every v2 room rect corner and center', () => {
    for (const room of HesperiaV2Spec.rooms) {
      const corners = [
        { x: room.rect.x + 1, y: room.rect.y + 1 },
        { x: room.rect.x + room.rect.w - 1, y: room.rect.y + 1 },
        { x: room.rect.x + 1, y: room.rect.y + room.rect.h - 1 },
        { x: room.rect.x + room.rect.w - 1, y: room.rect.y + room.rect.h - 1 },
        { x: room.rect.x + room.rect.w / 2, y: room.rect.y + room.rect.h / 2 },
      ];
      for (const pt of corners) {
        expect(isPointInHullSilhouette(pt.x, pt.y)).toBe(true);
      }
    }
  });

  it('keeps thruster bells inside the drive housing', () => {
    expect(THRUSTER_BELLS).toHaveLength(3);
    for (const bell of THRUSTER_BELLS) {
      expect(isPointInHullSilhouette(bell.x, bell.y)).toBe(true);
    }
  });
});
