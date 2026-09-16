import type { CargoStateBroadcast, SnapshotBroadcast } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { aboardCargoFor, cargoDemandFor } from './navTradeHints';

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
        frameId: 'ship',
        roomHint: 'ship.deck',
        color: '#fff',
      },
    ],
    impacts: [],
    portals: [],
    projectiles: [],
    frames: [],
    crates: [
      {
        id: 'floor',
        items: [{ goodId: 'scrap', qty: 2 }],
        where: 'shipFloor',
        frameId: 'ship',
        x: 3,
        y: 4,
        angle: 0,
      },
      {
        id: 'held',
        items: [{ goodId: 'meds', qty: 1 }],
        where: 'carriedBy',
        carrierId: 'pawn:u1',
        frameId: 'ship',
        x: 1,
        y: 2,
        angle: 0,
      },
      {
        id: 'bay',
        items: [{ goodId: 'scrap', qty: 9 }],
        where: 'bayFloor',
        frameId: 'station',
        x: 5,
        y: 6,
        angle: 0,
      },
      {
        id: 'other',
        items: [{ goodId: 'water', qty: 4 }],
        where: 'carriedBy',
        carrierId: 'pawn:u2',
        frameId: 'ship',
        x: 1,
        y: 2,
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
    secured: [{ goodId: 'scrap', qty: 3 }],
    carriedByPawn: {},
  };
}

describe('aboardCargoFor', () => {
  it('sums ship-floor, carried, and secured goods', () => {
    expect(aboardCargoFor(snapshot(), 'pawn:u1', cargo())).toEqual([
      { goodId: 'meds', qty: 1 },
      { goodId: 'scrap', qty: 5 },
    ]);
  });

  it('ignores bay crates and other pawns hands', () => {
    const aboard = aboardCargoFor(snapshot(), 'pawn:u1', null);
    expect(aboard).toEqual([
      { goodId: 'meds', qty: 1 },
      { goodId: 'scrap', qty: 2 },
    ]);
  });

  it('returns empty without data', () => {
    expect(aboardCargoFor(null, null, null)).toEqual([]);
  });
});

describe('cargoDemandFor', () => {
  it('prices aboard goods at the target hub sell price', () => {
    const rows = cargoDemandFor('hub_b', [
      { goodId: 'scrap', qty: 2 },
      { goodId: 'meds', qty: 1 },
    ]);
    expect(rows).toEqual([
      { goodId: 'scrap', qty: 2, unitPrice: 13, total: 26 },
      { goodId: 'meds', qty: 1, unitPrice: 9, total: 9 },
    ]);
  });

  it('uses buy-vs-sell economics at the destination', () => {
    const rows = cargoDemandFor('hub_a', [{ goodId: 'meds', qty: 2 }]);
    expect(rows).toEqual([{ goodId: 'meds', qty: 2, unitPrice: 13, total: 26 }]);
  });

  it('returns empty with no priced goods', () => {
    expect(cargoDemandFor('hub_b', [])).toEqual([]);
    expect(cargoDemandFor('nowhere', [{ goodId: 'scrap', qty: 2 }])).toEqual([]);
  });
});
