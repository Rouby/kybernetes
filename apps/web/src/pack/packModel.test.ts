import type {
  CargoStateBroadcast,
  MarketStateBroadcast,
  SnapshotBroadcast,
} from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import type { PackSnapshot } from './PackStore';
import { packScreenFor, stagedCountsOf } from './packModel';

function snap(): PackSnapshot {
  return {
    open: true,
    bodies: [
      {
        id: 1,
        goodId: 'scrap',
        x: 1,
        y: 2,
        angle: 0,
        w: 50,
        h: 40,
        held: false,
        inside: true,
        settled: true,
      },
    ],
    walls: [],
    crate: { x: 0, y: 0, w: 120, h: 80 },
    stagedTotal: 1,
    insideTotal: 1,
    sealReady: false,
    sealLabel: 'SEAL',
    hint: '',
  };
}

function market(): MarketStateBroadcast {
  return {
    type: 'MARKET_STATE',
    v: 2,
    tick: 7,
    serverTimeMs: 700,
    hubId: 'hub_a',
    listings: [
      { goodId: 'scrap', buyPrice: 10, sellPrice: 9, stock: 50 },
      { goodId: 'meds', buyPrice: 15, sellPrice: 13, stock: 0 },
    ],
  };
}

function snapshot(): SnapshotBroadcast {
  return {
    type: 'SNAPSHOT',
    v: 2,
    tick: 7,
    serverTimeMs: 700,
    pawns: [
      {
        id: 'pawn:u1',
        x: 1,
        y: 2,
        vx: 0,
        vy: 0,
        facing: 0,
        frameId: 'station',
        roomHint: 'r',
        color: '#fff',
      },
    ],
    impacts: [],
    portals: [],
    projectiles: [],
    frames: [],
    crates: [
      {
        id: 'c1',
        items: [{ goodId: 'scrap', qty: 2 }],
        where: 'bayFloor',
        frameId: 'station',
        x: 3,
        y: 4,
        angle: 0,
      },
    ],
  };
}

function cargo(): CargoStateBroadcast {
  return {
    type: 'CARGO_STATE',
    v: 2,
    tick: 7,
    serverTimeMs: 700,
    vesselId: 'ship',
    secured: [{ goodId: 'scrap', qty: 5 }],
    carriedByPawn: {},
  };
}

describe('packScreenFor (M8)', () => {
  it('counts staged units by good', () => {
    expect(stagedCountsOf(snap())).toEqual({ scrap: 1 });
  });

  it('gates the buy palette on credits, stock, and staged', () => {
    const model = packScreenFor(
      'buy',
      'hub_a',
      market(),
      snapshot(),
      'pawn:u1',
      cargo(),
      25,
      snap()
    );
    expect(model.title).toContain('BUY');
    expect(model.palette).toEqual([{ buttonId: 'add:scrap', label: '+ SCRAP (1)' }]);
    expect(model.budgetLabel).toBe('Credits: 25cr');
  });

  it('offers secured goods aboard the ship', () => {
    const aboard = {
      ...snapshot(),
      pawns: [
        {
          id: 'pawn:u1',
          x: 1,
          y: 2,
          vx: 0,
          vy: 0,
          facing: 0,
          frameId: 'ship',
          roomHint: 'r',
          color: '#fff',
        },
      ],
    };
    const model = packScreenFor('repack', null, null, aboard, 'pawn:u1', cargo(), 0, snap());
    expect(model.palette).toEqual([{ buttonId: 'add:scrap', label: '+ SCRAP (4)' }]);
  });

  it('points broke players at the bay first', () => {
    const broke = packScreenFor(
      'buy',
      'hub_a',
      market(),
      snapshot(),
      'pawn:u1',
      cargo(),
      0,
      snap()
    );
    expect(broke.palette).toEqual([]);
    expect(broke.hint).toBe('No affordable goods — SELL ALL BAY first');
  });

  it('stays empty without market data or off-ship', () => {
    expect(
      packScreenFor('buy', 'hub_a', null, snapshot(), 'pawn:u1', cargo(), 25, snap()).palette
    ).toEqual([]);
    expect(
      packScreenFor('repack', null, null, snapshot(), 'pawn:u1', cargo(), 0, snap()).budgetLabel
    ).toBe('Board the ship to re-pack');
  });
});
