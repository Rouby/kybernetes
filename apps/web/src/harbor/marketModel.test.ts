import type {
  CargoStateBroadcast,
  MarketStateBroadcast,
  SnapshotBroadcast,
} from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { hubIdForFrame, marketScreenFor } from './marketModel';

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
        roomHint: 'station.frachthalle',
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
        goodId: 'scrap',
        qty: 2,
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
    secured: [],
    carriedByPawn: {},
  };
}

describe('marketScreenFor (M5)', () => {
  it('maps station frames to hub ids', () => {
    expect(hubIdForFrame('station')).toBe('hub_a');
    expect(hubIdForFrame('hub_b')).toBe('hub_b');
    expect(hubIdForFrame('ship')).toBeNull();
    expect(hubIdForFrame(null)).toBeNull();
  });

  it('sizes buys to credits and stock with sell-all for the bay', () => {
    const model = marketScreenFor(market(), snapshot(), cargo(), 'pawn:u1', 25);
    expect(model.hubLabel).toBe('NEW ANCHORAGE');
    expect(model.creditsLabel).toBe('Credits: 25cr');
    expect(model.buys).toEqual([
      { goodId: 'scrap', qty: 2, cost: 20, label: 'BUY SCRAP x2 20cr', buttonId: 'buy:scrap' },
    ]);
    expect(model.sellLabel).toBe('SELL ALL BAY (1) +18cr');
    expect(model.sellIds).toEqual(['c1']);
    expect(model.hasSell).toBe(true);
  });

  it('reports an empty market without data', () => {
    const model = marketScreenFor(null, snapshot(), cargo(), 'pawn:u1', 25);
    expect(model.hubLabel).toBe('NO MARKET');
    expect(model.buys).toEqual([]);
    expect(model.hasSell).toBe(false);
  });
});
