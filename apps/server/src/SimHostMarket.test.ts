import { buildSoloShipWorld } from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CLOCKS, SimHost } from './SimHost.js';

function spawn(host: SimHost): string {
  const joined = host.spawnAboardOwnShip('c1', 'Rook', '#fff', 'u1');
  if ('denied' in joined) throw new Error('spawn denied');
  return joined.pawnId;
}

function movePawn(host: SimHost, pawnId: string, frameId: string, x: number, y: number): void {
  const world = host.currentWorld;
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) throw new Error('missing pawn');
  host.debugSetWorld({
    ...world,
    pawns: { ...world.pawns, [pawnId]: { ...pawn, frameId, pos: { x, y } } },
  });
}

function bayCrates(host: SimHost, frameId: string): string[] {
  return Object.values(host.currentWorld.cargo.crates)
    .filter((crate) => crate.where === 'bayFloor' && crate.frameId === frameId)
    .map((crate) => crate.id);
}

describe('SimHost market trade (M5)', () => {
  it('buys crates onto the bay floor for credits and stock', () => {
    const host = new SimHost(buildSoloShipWorld(), DEFAULT_CLOCKS, null);
    const pawnId = spawn(host);
    movePawn(host, pawnId, 'station', 460, 440);
    const bought = host.handleIntent('c1', {
      type: 'MARKET_BUY',
      seq: 1,
      hubId: 'hub_a',
      items: [{ goodId: 'scrap', qty: 2 }],
    });
    expect(bought.notice).toBe('MARKET_ok');
    expect(host.shipRecordFor('u1')?.credits).toBe(0);
    expect(host.currentWorld.market.stock.hub_a?.scrap).toBe(48);
    expect(bayCrates(host, 'station').length).toBeGreaterThan(0);
    host.stop();
  });

  it('rejects broke buyers and far, burdened, or misplaced traders', () => {
    const host = new SimHost(buildSoloShipWorld(), DEFAULT_CLOCKS, null);
    const pawnId = spawn(host);
    const aboard = host.handleIntent('c1', {
      type: 'MARKET_BUY',
      seq: 1,
      hubId: 'hub_a',
      items: [{ goodId: 'scrap', qty: 2 }],
    });
    expect(aboard.notice).toBe('MARKET_wrong-frame');
    movePawn(host, pawnId, 'station', 160, 100);
    const far = host.handleIntent('c1', {
      type: 'MARKET_BUY',
      seq: 2,
      hubId: 'hub_a',
      items: [{ goodId: 'scrap', qty: 2 }],
    });
    expect(far.notice).toBe('MARKET_too-far');
    movePawn(host, pawnId, 'station', 430, 410);
    const picked = host.handleIntent('c1', {
      type: 'CARGO_PICKUP',
      seq: 3,
      crateId: 'bay:scrap-a',
    });
    expect(picked.notice).toBe('CARGO_ok');
    movePawn(host, pawnId, 'station', 460, 440);
    const hands = host.handleIntent('c1', {
      type: 'MARKET_BUY',
      seq: 4,
      hubId: 'hub_a',
      items: [{ goodId: 'scrap', qty: 2 }],
    });
    expect(hands.notice).toBe('MARKET_hands-full');
    const dropped = host.handleIntent('c1', { type: 'CARGO_DROP', seq: 5 });
    expect(dropped.notice).toBe('CARGO_ok');
    const broke = host.handleIntent('c1', {
      type: 'MARKET_BUY',
      seq: 6,
      hubId: 'hub_a',
      items: [{ goodId: 'meds', qty: 2 }],
    });
    expect(broke.notice).toBe('MARKET_insufficient-funds');
    host.stop();
  });

  it('sells mixed bay crates for mirror profit and restocks the hub', () => {
    const host = new SimHost(buildSoloShipWorld(), DEFAULT_CLOCKS, null);
    const pawnId = spawn(host);
    movePawn(host, pawnId, 'station', 460, 440);
    expect(
      host.handleIntent('c1', {
        type: 'MARKET_BUY',
        seq: 1,
        hubId: 'hub_a',
        items: [
          { goodId: 'scrap', qty: 1 },
          { goodId: 'rations', qty: 1 },
        ],
      }).notice
    ).toBe('MARKET_ok');
    const boughtId = bayCrates(host, 'station').find((id) => id.startsWith('mkt:'));
    if (boughtId === undefined) throw new Error('no bought crate');
    movePawn(host, pawnId, 'hub_b', 460, 440);
    const world = host.currentWorld;
    const crate = world.cargo.crates[boughtId];
    if (crate === undefined) throw new Error('missing crate');
    host.debugSetWorld({
      ...world,
      cargo: {
        ...world.cargo,
        crates: { ...world.cargo.crates, [boughtId]: { ...crate, frameId: 'hub_b' } },
      },
    });
    const sold = host.handleIntent('c1', {
      type: 'MARKET_SELL',
      seq: 2,
      hubId: 'hub_b',
      crateIds: [boughtId],
    });
    expect(sold.notice).toBe('MARKET_sold:1');
    expect(host.shipRecordFor('u1')?.credits).toBe(24);
    expect(host.currentWorld.cargo.crates[boughtId]).toBeUndefined();
    host.stop();
  });

  it('refuses secured-wealth sales without a physical bay crate', () => {
    const host = new SimHost(buildSoloShipWorld(), DEFAULT_CLOCKS, null);
    const pawnId = spawn(host);
    movePawn(host, pawnId, 'hub_b', 460, 440);
    const sold = host.handleIntent('c1', {
      type: 'MARKET_SELL',
      seq: 1,
      hubId: 'hub_b',
      crateIds: ['bay:scrap-a'],
    });
    expect(sold.notice).toBe('MARKET_denied');
    host.stop();
  });

  it('sweeps unpacked fuel into loose stores without auto-fueling the bunker', () => {
    const host = new SimHost(buildSoloShipWorld(), DEFAULT_CLOCKS, null);
    const pawnId = spawn(host);
    const world = host.currentWorld;
    const pawn = world.pawns[pawnId];
    if (pawn === undefined) throw new Error('missing pawn');
    host.debugSetWorld({
      ...world,
      cargo: {
        ...world.cargo,
        crates: {
          ...world.cargo.crates,
          'fuel:1': {
            id: 'fuel:1',
            items: [{ goodId: 'fuel_cells', qty: 2 }],
            where: 'shipFloor',
            frameId: 'ship',
            x: pawn.pos.x,
            y: pawn.pos.y,
            angle: 0,
          },
        },
      },
    });
    const unpacked = host.handleIntent('c1', {
      type: 'CARGO_UNPACK',
      seq: 1,
      crateIds: ['fuel:1'],
    });
    expect(unpacked.notice).toBe('CARGO_ok');
    expect(host.shipRecordFor('u1')?.stores.fuelCells).toBe(3);
    host.drainShipNotices();
    expect(host.currentWorld.ships.ship?.engineFuel).toBe(0);
    host.stop();
  });

  it('settles one leg of food on arrival and starves empty holds', () => {
    const host = new SimHost(buildSoloShipWorld(), DEFAULT_CLOCKS, null);
    spawn(host);
    const world = host.currentWorld;
    const systems = world.ships.ship;
    if (systems === undefined) throw new Error('missing systems');
    host.debugSetWorld({
      ...world,
      ships: { ...world.ships, ship: { ...systems, nav: { ...systems.nav, phase: 'in_transit' } } },
    });
    host.drainShipNotices();
    host.debugSetWorld({
      ...host.currentWorld,
      ships: {
        ...host.currentWorld.ships,
        ship: {
          ...(host.currentWorld.ships.ship as typeof systems),
          nav: { ...(host.currentWorld.ships.ship as typeof systems).nav, phase: 'docked' },
        },
      },
    });
    host.drainShipNotices();
    expect(host.shipRecordFor('u1')?.stores.rations).toBe(1);
    expect(host.shipRecordFor('u1')?.stores.waterL).toBe(3);
    expect(host.shipRecordFor('u1')?.stores.o2Cells).toBe(1);
    host.stop();
  });
});
