import type { MarketStateBroadcast, SnapshotBroadcast } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import {
  hubIdForFrame,
  marketRumorsFor,
  marketScreenFor,
  sellCaptureFor,
  sellScreenFor,
  tradeReceiptFor,
  wrapRumor,
} from './marketModel';

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

describe('marketScreenFor (M5)', () => {
  it('maps station frames to hub ids', () => {
    expect(hubIdForFrame('station')).toBe('hub_a');
    expect(hubIdForFrame('hub_b')).toBe('hub_b');
    expect(hubIdForFrame('ship')).toBeNull();
    expect(hubIdForFrame(null)).toBeNull();
  });

  it('splits listings into two table columns with prices and stock', () => {
    const model = marketScreenFor(market(), snapshot(), 'pawn:u1', 25);
    expect(model.hubLabel).toBe('NEW ANCHORAGE');
    expect(model.creditsLabel).toBe('Credits: 25cr');
    expect(model.left).toEqual([{ name: 'scrap', stock: 50, buy: 10, sell: 9 }]);
    expect(model.right).toEqual([{ name: 'meds', stock: 0, buy: 15, sell: 13 }]);
    expect(model.rumors.length).toBe(2);
    expect(model.rumors[0]).toContain('Scrap');
  });

  it('reports an empty market without data', () => {
    const model = marketScreenFor(null, snapshot(), 'pawn:u1', 25);
    expect(model.hubLabel).toBe('NO MARKET');
    expect(model.left).toEqual([]);
    expect(model.right).toEqual([]);
    expect(model.rumors).toEqual([]);
  });
});

describe('marketRumorsFor', () => {
  it('highlights Scrap demand at New Anchorage', () => {
    const rumors = marketRumorsFor('hub_a');
    expect(rumors.length).toBe(2);
    expect(rumors[0]).toContain('Scrap');
    expect(rumors.join(' ')).toContain('1000 fuel');
  });

  it('highlights Meds demand at Kepler Yard', () => {
    const rumors = marketRumorsFor('hub_b');
    expect(rumors.length).toBe(2);
    expect(rumors[0]).toContain('Meds');
    expect(rumors.join(' ')).toContain('1000 fuel');
  });

  it('returns no rumors off-market', () => {
    expect(marketRumorsFor(null)).toEqual([]);
    expect(marketRumorsFor('hub_c')).toEqual([]);
  });
});

describe('wrapRumor', () => {
  it('keeps short rumors on one line', () => {
    expect(wrapRumor('Short rumor', 20)).toEqual(['Short rumor']);
  });

  it('wraps long rumors within the char budget', () => {
    const lines = wrapRumor('Kepler Yard structural shortage - paying premium on Scrap', 20);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(20);
  });
});

describe('sellCaptureFor', () => {
  it('aggregates goods and revenue for the sold crates', () => {
    const capture = sellCaptureFor(market(), snapshot(), ['c1']);
    expect(capture?.hubId).toBe('hub_a');
    expect(capture?.hubLabel).toBe('NEW ANCHORAGE');
    expect(capture?.goods).toEqual([{ goodId: 'scrap', qty: 2, revenue: 18 }]);
    expect(capture?.total).toBe(18);
  });

  it('returns null without market, snapshot, crates, or priced goods', () => {
    expect(sellCaptureFor(null, snapshot(), ['c1'])).toBeNull();
    expect(sellCaptureFor(market(), null, ['c1'])).toBeNull();
    expect(sellCaptureFor(market(), snapshot(), [])).toBeNull();
    expect(sellCaptureFor(market(), snapshot(), ['missing'])).toBeNull();
  });
});

describe('tradeReceiptFor', () => {
  it('settles a capture with the post-sale balance', () => {
    const capture = sellCaptureFor(market(), snapshot(), ['c1']);
    if (capture === null) throw new Error('missing capture');
    const receipt = tradeReceiptFor(capture, 65, 4242);
    expect(receipt.totalRevenue).toBe(18);
    expect(receipt.newBalance).toBe(65);
    expect(receipt.timestampMs).toBe(4242);
    expect(receipt.itemsSold).toEqual(capture.goods);
  });
});

describe('sellScreenFor', () => {
  it('prices each bay crate in green with per-crate seals', () => {
    const model = sellScreenFor(market(), snapshot(), 'pawn:u1');
    expect(model.hubId).toBe('hub_a');
    expect(model.rows).toEqual([
      { crateId: 'c1', label: 'scrap x2', value: 18, buttonId: 'sell:c1' },
    ]);
    expect(model.totalLabel).toBe('Bay total +18cr');
    expect(model.sellIds).toEqual(['c1']);
  });

  it('lists the carried crate for direct handover sell', () => {
    const snap = snapshot();
    const carried = {
      ...(snap.crates?.[0] as NonNullable<SnapshotBroadcast['crates']>[number]),
      id: 'held',
      where: 'carriedBy' as const,
      carrierId: 'pawn:u1',
    };
    const model = sellScreenFor(market(), { ...snap, crates: [carried] }, 'pawn:u1');
    expect(model.sellIds).toEqual(['held']);
    expect(model.rows[0]?.crateId).toBe('held');
  });

  it('ignores crates carried by other pawns', () => {
    const snap = snapshot();
    const other = {
      ...(snap.crates?.[0] as NonNullable<SnapshotBroadcast['crates']>[number]),
      id: 'held',
      where: 'carriedBy' as const,
      carrierId: 'pawn:u2',
    };
    const model = sellScreenFor(market(), { ...snap, crates: [other] }, 'pawn:u1');
    expect(model.sellIds).toEqual([]);
  });

  it('reports an empty bay without data', () => {
    const model = sellScreenFor(null, snapshot(), 'pawn:u1');
    expect(model.rows).toEqual([]);
    expect(model.totalLabel).toBe('Bay: —');
  });
});
