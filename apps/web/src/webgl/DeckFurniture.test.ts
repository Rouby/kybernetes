import { HesperiaV2Spec } from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import { SHIP_FURNITURE_BOUNDS } from './DeckFurniture';
import { HULL_PLATE, THRUSTER_BELLS } from './passes/DeckPass';

describe('ship furniture placement', () => {
  it('keeps every furniture group inside its room rect', () => {
    expect(SHIP_FURNITURE_BOUNDS.length).toBeGreaterThan(0);
    for (const piece of SHIP_FURNITURE_BOUNDS) {
      const room = HesperiaV2Spec.rooms.find((entry) => entry.id === piece.room);
      if (room === undefined) throw new Error(`unknown room ${piece.room}`);
      expect(piece.x).toBeGreaterThanOrEqual(room.rect.x);
      expect(piece.y).toBeGreaterThanOrEqual(room.rect.y);
      expect(piece.x + piece.w).toBeLessThanOrEqual(room.rect.x + room.rect.w);
      expect(piece.y + piece.h).toBeLessThanOrEqual(room.rect.y + room.rect.h);
    }
  });

  it('mounts all three thruster bells on the stern wedge', () => {
    expect(THRUSTER_BELLS).toHaveLength(3);
    for (const bell of THRUSTER_BELLS) {
      expect(bell.x).toBeLessThan(70);
      expect(bell.y).toBeGreaterThanOrEqual(HULL_PLATE.y);
      expect(bell.y).toBeLessThanOrEqual(HULL_PLATE.y + HULL_PLATE.h);
    }
  });

  it('encloses every v2 room rect inside the hull plate', () => {
    for (const room of HesperiaV2Spec.rooms) {
      expect(room.rect.x).toBeGreaterThanOrEqual(HULL_PLATE.x);
      expect(room.rect.y).toBeGreaterThanOrEqual(HULL_PLATE.y);
      expect(room.rect.x + room.rect.w).toBeLessThanOrEqual(HULL_PLATE.x + HULL_PLATE.w);
      expect(room.rect.y + room.rect.h).toBeLessThanOrEqual(HULL_PLATE.y + HULL_PLATE.h);
    }
  });
});
