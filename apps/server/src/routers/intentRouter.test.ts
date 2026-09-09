import { buildHarborWorld } from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import { routeIntent } from './intentRouter.js';

describe('dock gate door discipline', () => {
  it('refuses dock leaf toggles while the cycle holds them', () => {
    const world = buildHarborWorld();
    const refused = routeIntent(
      world,
      'pawn:u1',
      { type: 'DOOR', seq: 1, portalId: 'ship.schiff_mund', wantOpen: true },
      []
    );
    expect(refused.notice).toBe('DOOR_dock-cycle');
    expect(refused.world.portals['ship.schiff_mund']?.state).toBe(
      world.portals['ship.schiff_mund']?.state
    );
  });

  it('still toggles ordinary doors while docked', () => {
    const world = buildHarborWorld();
    const result = routeIntent(
      world,
      'pawn:u1',
      { type: 'DOOR', seq: 1, portalId: 'station.habitat_korridor', wantOpen: true },
      []
    );
    expect(result.notice).toMatch(/^DOOR_/);
    expect(result.notice).not.toBe('DOOR_dock-cycle');
  });
});
