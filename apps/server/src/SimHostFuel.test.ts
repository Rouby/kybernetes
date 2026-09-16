import { buildSoloShipWorld } from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CLOCKS, SimHost } from './SimHost.js';

function spawn(host: SimHost): string {
  const joined = host.spawnAboardOwnShip('c1', 'Rook', '#fff', 'u1');
  if ('denied' in joined) throw new Error('spawn denied');
  return joined.pawnId;
}

function atEngine(host: SimHost, pawnId: string): void {
  const world = host.currentWorld;
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) throw new Error('missing pawn');
  host.debugSetWorld({
    ...world,
    pawns: { ...world.pawns, [pawnId]: { ...pawn, frameId: 'ship', pos: { x: 170, y: 480 } } },
  });
}

function atNav(host: SimHost, pawnId: string): void {
  const world = host.currentWorld;
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) throw new Error('missing pawn');
  host.debugSetWorld({
    ...world,
    pawns: { ...world.pawns, [pawnId]: { ...pawn, frameId: 'ship', pos: { x: 100, y: 65 } } },
  });
}

describe('SimHost engine fuel (slotted bunker)', () => {
  it('loads a loose cell into the bunker at the engine console', () => {
    const host = new SimHost(buildSoloShipWorld(), DEFAULT_CLOCKS, null);
    const pawnId = spawn(host);
    atEngine(host, pawnId);
    expect(host.shipRecordFor('u1')?.stores.fuelCells).toBe(1);
    const loaded = host.handleIntent('c1', { type: 'ENGINE_FUEL', seq: 1, op: 'load' });
    expect(loaded.notice).toBe('ENGINE_ok');
    expect(host.shipRecordFor('u1')?.stores.fuelCells).toBe(0);
    expect(host.shipRecordFor('u1')?.engineFuel).toBe(1000);
    expect(host.currentWorld.ships.ship?.engineFuel).toBe(1000);
    host.stop();
  });

  it('loads a loose cell into the bunker from the bridge nav console', () => {
    const host = new SimHost(buildSoloShipWorld(), DEFAULT_CLOCKS, null);
    const pawnId = spawn(host);
    atNav(host, pawnId);
    expect(host.shipRecordFor('u1')?.stores.fuelCells).toBe(1);
    const loaded = host.handleIntent('c1', { type: 'ENGINE_FUEL', seq: 1, op: 'load' });
    expect(loaded.notice).toBe('ENGINE_ok');
    expect(host.shipRecordFor('u1')?.stores.fuelCells).toBe(0);
    expect(host.shipRecordFor('u1')?.engineFuel).toBe(1000);
    host.stop();
  });

  it('refuses load with no cell and unload with no fuel', () => {
    const host = new SimHost(buildSoloShipWorld(), DEFAULT_CLOCKS, null);
    const pawnId = spawn(host);
    atEngine(host, pawnId);
    host.handleIntent('c1', { type: 'ENGINE_FUEL', seq: 1, op: 'load' });
    expect(host.handleIntent('c1', { type: 'ENGINE_FUEL', seq: 2, op: 'load' }).notice).toBe(
      'ENGINE_no-cell'
    );
    expect(host.handleIntent('c1', { type: 'ENGINE_FUEL', seq: 3, op: 'unload' }).notice).toBe(
      'ENGINE_ok'
    );
    expect(host.handleIntent('c1', { type: 'ENGINE_FUEL', seq: 4, op: 'unload' }).notice).toBe(
      'ENGINE_no-fuel'
    );
    host.stop();
  });

  it('refuses fuel handling underway, far, or hands-full', () => {
    const host = new SimHost(buildSoloShipWorld(), DEFAULT_CLOCKS, null);
    const pawnId = spawn(host);
    const world = host.currentWorld;
    const systems = world.ships.ship;
    if (systems === undefined) throw new Error('missing systems');
    host.debugSetWorld({
      ...world,
      ships: {
        ...world.ships,
        ship: { ...systems, nav: { ...systems.nav, phase: 'in_transit' } },
      },
    });
    atEngine(host, pawnId);
    expect(host.handleIntent('c1', { type: 'ENGINE_FUEL', seq: 1, op: 'load' }).notice).toBe(
      'ENGINE_underway'
    );
    host.stop();
  });
});
