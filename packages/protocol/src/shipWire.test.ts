import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from './envelope.js';
import { makeShipLost, makeShipStatus } from './shipSnapshots.js';
import { validateClientIntent } from './validate.js';

describe('solo-ship wire (M1)', () => {
  it('validates SPAWN_ABOARD with seq dedupe shape', () => {
    const ok = validateClientIntent({ type: 'SPAWN_ABOARD', seq: 7 });
    expect(ok.ok).toBe(true);
    const withUser = validateClientIntent({ type: 'SPAWN_ABOARD', seq: 8, userId: 'u1' });
    expect(withUser.ok).toBe(true);
    expect(validateClientIntent({ type: 'SPAWN_ABOARD', seq: -1 }).ok).toBe(false);
    expect(validateClientIntent({ type: 'SPAWN_ABOARD' }).ok).toBe(false);
  });

  it('builds versioned SHIP_STATUS with tick monotonicity fields', () => {
    const a = makeShipStatus(
      {
        shipId: 'ship:u1',
        hullId: 'skiff_alpha',
        reactorTier: 0,
        engineTier: 0,
        credits: 20,
        condition: 100,
        locationHubId: 'hub_a',
        alive: true,
        stores: { rations: 2, waterL: 4, o2Cells: 2, fuelCells: 1 },
      },
      41,
      1000
    );
    expect(a.type).toBe('SHIP_STATUS');
    expect(a.v).toBe(PROTOCOL_VERSION);
    expect(a.tick).toBe(41);
    const lost = makeShipLost('ship:u1', 'reactor', 42, 1050);
    expect(lost.type).toBe('SHIP_LOST');
    expect(lost.tick).toBeGreaterThan(a.tick);
  });
});
