import { HesperiaV2Spec, StationHubSpec } from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import { LIVING_FIXTURE_BOUNDS } from './LivingFixtures';

describe('living fixture placement', () => {
  it('keeps every living fixture inside its room rect', () => {
    expect(LIVING_FIXTURE_BOUNDS.length).toBeGreaterThan(0);
    const rooms = [...StationHubSpec.rooms, ...HesperiaV2Spec.rooms];
    for (const piece of LIVING_FIXTURE_BOUNDS) {
      const room = rooms.find((entry) => entry.id === piece.room);
      if (room === undefined) throw new Error(`unknown room ${piece.room}`);
      expect(piece.x).toBeGreaterThanOrEqual(room.rect.x);
      expect(piece.y).toBeGreaterThanOrEqual(room.rect.y);
      expect(piece.x + piece.w).toBeLessThanOrEqual(room.rect.x + room.rect.w);
      expect(piece.y + piece.h).toBeLessThanOrEqual(room.rect.y + room.rect.h);
    }
  });
});
