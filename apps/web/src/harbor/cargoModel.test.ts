import type { CargoStateBroadcast, SnapshotBroadcast } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { cargoPanelModel, unpackableCrateIds } from './cargoModel';

function snapshot(): SnapshotBroadcast {
  return {
    type: 'SNAPSHOT',
    v: 2,
    tick: 9,
    serverTimeMs: 1000,
    pawns: [],
    impacts: [],
    portals: [],
    projectiles: [],
    frames: [],
    crates: [
      {
        id: 'c1',
        goodId: 'scrap',
        qty: 3,
        where: 'shipFloor',
        frameId: 'ship',
        x: 50,
        y: 50,
        angle: 0,
      },
      {
        id: 'c2',
        goodId: 'rations',
        qty: 2,
        where: 'carriedBy',
        frameId: 'ship',
        x: 51,
        y: 51,
        angle: 0,
        carrierId: 'pawn:u1',
      },
    ],
  };
}

function cargo(): CargoStateBroadcast {
  return {
    type: 'CARGO_STATE',
    v: 2,
    tick: 9,
    serverTimeMs: 1000,
    vesselId: 'ship',
    secured: [{ goodId: 'scrap', qty: 5 }],
    carriedByPawn: { 'pawn:u1': 'c2' },
  };
}

describe('cargoPanelModel (M4)', () => {
  it('names the carried crate and the secured hold', () => {
    const model = cargoPanelModel(snapshot(), cargo(), 'pawn:u1');
    expect(model.handsFull).toBe(true);
    expect(model.carryingLabel).toBe('Hands: rations x2');
    expect(model.securedLabel).toBe('Hold: scrap x5');
    expect(model.canUnpack).toBe(true);
  });

  it('reports empty hands without a pawn', () => {
    const model = cargoPanelModel(snapshot(), cargo(), null);
    expect(model.handsFull).toBe(false);
    expect(model.carryingLabel).toBe('Hands: empty');
  });

  it('lists unpackable ship-floor crates for the U shortcut', () => {
    expect(unpackableCrateIds(snapshot(), 'ship')).toEqual(['c1']);
    expect(unpackableCrateIds(snapshot(), 'station')).toEqual([]);
    expect(unpackableCrateIds(null, 'ship')).toEqual([]);
  });
});
