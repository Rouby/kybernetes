import {
  buildHarborWorld,
  buildSoloShipWorld,
  restartShipReactor,
  tuneShipReactor,
} from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CLOCKS, SimHost } from './SimHost.js';

describe('SimHost solo spawn (M1)', () => {
  it('spawns aboard the owned vessel and resumes on reconnect', () => {
    const host = new SimHost(buildHarborWorld(), DEFAULT_CLOCKS, null);
    const first = host.spawnAboardOwnShip('c1', 'Rook', '#fff', 'u1');
    expect('denied' in first).toBe(false);
    if ('denied' in first) return;
    expect(first.pawnId).toBe('pawn:u1');
    expect(first.resumed).toBe(false);
    expect(host.currentWorld.pawns['pawn:u1']?.frameId).toBe('ship');
    const second = host.spawnAboardOwnShip('c2', 'Rook', '#fff', 'u1');
    expect(second).toEqual({ pawnId: 'pawn:u1', resumed: true });
    host.stop();
  });

  it('keeps solo ships apart per user', () => {
    const host = new SimHost(buildHarborWorld(), DEFAULT_CLOCKS, null);
    host.spawnAboardOwnShip('c1', 'A', '#fff', 'ua');
    host.spawnAboardOwnShip('c2', 'B', '#000', 'ub');
    expect(host.currentWorld.pawns['pawn:ua']).toBeDefined();
    expect(host.currentWorld.pawns['pawn:ub']).toBeDefined();
    host.stop();
  });

  it('reports SHIP_STATUS and wipes on loss', () => {
    const host = new SimHost(buildHarborWorld(), DEFAULT_CLOCKS, null);
    host.spawnAboardOwnShip('c1', 'Rook', '#fff', 'u1');
    const status = host.shipStatusFor('u1', 9, 1000);
    expect(status?.type).toBe('SHIP_STATUS');
    expect(status?.tick).toBe(9);
    const lost = host.loseShipFor('u1', 'reactor', 10, 1050);
    expect(lost?.type).toBe('SHIP_LOST');
    expect(host.shipStatusFor('u1', 11, 1100)?.alive).toBe(false);
    host.stop();
  });

  it('syncs record tiers into kernel systems on spawn', () => {
    const host = new SimHost(buildHarborWorld(), DEFAULT_CLOCKS, null);
    host.spawnAboardOwnShip('c1', 'Rook', '#fff', 'u1');
    expect(host.currentWorld.ships.ship?.reactorTier).toBe(0);
    expect(host.currentWorld.ships.ship?.engineTier).toBe(0);
    host.stop();
  });

  it('emits edge notices once and mirrors hull into the record', () => {
    const host = new SimHost(buildHarborWorld(), DEFAULT_CLOCKS, null);
    host.spawnAboardOwnShip('c1', 'Rook', '#fff', 'u1');
    let world = restartShipReactor(host.currentWorld, 'ship');
    world = tuneShipReactor(world, 'ship', -1, -1);
    host.debugSetWorld(world);
    for (let i = 0; i < 40; i += 1) host.slice(1000 + i * 50, 50);
    const first = host.drainShipNotices();
    expect(first.some((notice) => notice.userId === 'u1' && notice.title === 'Reactor hot')).toBe(
      true
    );
    expect(host.drainShipNotices()).toEqual([]);
    const systems = host.currentWorld.ships.ship;
    if (systems === undefined) throw new Error('missing ship systems');
    host.debugSetWorld({
      ...host.currentWorld,
      ships: { ...host.currentWorld.ships, ship: { ...systems, condition: 60 } },
    });
    host.drainShipNotices();
    expect(host.shipRecordFor('u1')?.condition).toBe(60);
    host.stop();
  });

  it('tows a flamed-out leg home for a floored fee', () => {
    const host = new SimHost(buildSoloShipWorld(), DEFAULT_CLOCKS, null);
    host.spawnAboardOwnShip('c1', 'Rook', '#fff', 'u1');
    const systems = host.currentWorld.ships.ship;
    if (systems === undefined) throw new Error('missing ship systems');
    host.debugSetWorld({
      ...host.currentWorld,
      ships: {
        ...host.currentWorld.ships,
        ship: {
          ...systems,
          engineFuel: 0,
          nav: {
            phase: 'in_transit',
            destHubId: 'hub_b',
            remainingS: 60,
            legId: 1,
            portHubId: 'hub_a',
            flameout: true,
            extraBurned: true,
            stops: ['hub_b'],
            legIndex: 0,
          },
        },
      },
    });
    const result = host.handleIntent('c1', { type: 'DISTRESS', seq: 1 });
    expect(result.notice).toBe('DISTRESS_ok');
    expect(host.currentWorld.ships.ship?.nav.phase).toBe('docked');
    expect(host.currentWorld.ships.ship?.nav.portHubId).toBe('hub_b');
    expect(host.currentWorld.vessels.ship?.origin).toEqual({ x: 1210, y: 3920 });
    expect(host.shipRecordFor('u1')?.credits).toBe(0);
    host.stop();
  });

  it('tows a mid-chain flameout to the nearer hub end', () => {
    function flamedAt(remainingS: number): string | undefined {
      const host = new SimHost(buildSoloShipWorld(), DEFAULT_CLOCKS, null);
      host.spawnAboardOwnShip('c1', 'Rook', '#fff', 'u1');
      const systems = host.currentWorld.ships.ship;
      if (systems === undefined) throw new Error('missing ship systems');
      host.debugSetWorld({
        ...host.currentWorld,
        ships: {
          ...host.currentWorld.ships,
          ship: {
            ...systems,
            engineFuel: 0,
            nav: {
              phase: 'in_transit',
              destHubId: 'hub_b',
              remainingS,
              legId: 1,
              portHubId: 'hub_a',
              flameout: true,
              extraBurned: true,
              stops: ['poi_kestrel', 'hub_b'],
              legIndex: 1,
            },
          },
        },
      });
      const result = host.handleIntent('c1', { type: 'DISTRESS', seq: 1 });
      if (result.notice !== 'DISTRESS_ok') throw new Error(`tow failed: ${result.notice}`);
      const port = host.currentWorld.ships.ship?.nav.portHubId;
      host.stop();
      return port;
    }
    expect(flamedAt(10)).toBe('hub_b');
    expect(flamedAt(100)).toBe('hub_a');
  });

  it('tows POI strandings to a hub dock, never adrift', () => {
    function flamedAtPoi(
      portHubId: string,
      destHubId: string,
      stops: string[]
    ): string | undefined {
      const host = new SimHost(buildSoloShipWorld(), DEFAULT_CLOCKS, null);
      host.spawnAboardOwnShip('c1', 'Rook', '#fff', 'u1');
      const systems = host.currentWorld.ships.ship;
      if (systems === undefined) throw new Error('missing ship systems');
      host.debugSetWorld({
        ...host.currentWorld,
        ships: {
          ...host.currentWorld.ships,
          ship: {
            ...systems,
            engineFuel: 0,
            nav: {
              phase: 'in_transit',
              destHubId,
              remainingS: 10,
              legId: 1,
              portHubId,
              flameout: true,
              extraBurned: true,
              stops,
              legIndex: 0,
            },
          },
        },
      });
      const result = host.handleIntent('c1', { type: 'DISTRESS', seq: 1 });
      if (result.notice !== 'DISTRESS_ok') throw new Error(`tow failed: ${result.notice}`);
      const port = host.currentWorld.ships.ship?.nav.portHubId;
      host.stop();
      return port;
    }
    expect(flamedAtPoi('hub_a', 'poi_kestrel', ['poi_kestrel'])).toBe('hub_a');
    expect(flamedAtPoi('poi_kestrel', 'poi_vigil', ['poi_vigil'])).toBe('hub_a');
  });

  it('refuses distress while safely docked', () => {
    const host = new SimHost(buildHarborWorld(), DEFAULT_CLOCKS, null);
    host.spawnAboardOwnShip('c1', 'Rook', '#fff', 'u1');
    expect(host.handleIntent('c1', { type: 'DISTRESS', seq: 1 }).notice).toBe('DISTRESS_denied');
    host.stop();
  });

  it('mirrors kernel fuel burns into the record', () => {
    const host = new SimHost(buildSoloShipWorld(), DEFAULT_CLOCKS, null);
    host.spawnAboardOwnShip('c1', 'Rook', '#fff', 'u1');
    const systems = host.currentWorld.ships.ship;
    if (systems === undefined) throw new Error('missing ship systems');
    host.debugSetWorld({
      ...host.currentWorld,
      ships: {
        ...host.currentWorld.ships,
        ship: {
          ...systems,
          engine: { ...systems.engine, tune: 0 },
          engineFuel: 1000,
          nav: {
            phase: 'in_transit',
            destHubId: 'hub_b',
            remainingS: 70,
            legId: 1,
            portHubId: 'hub_a',
            flameout: false,
            extraBurned: false,
            stops: ['hub_b'],
            legIndex: 0,
          },
        },
      },
    });
    for (let i = 0; i < 3; i += 1) host.slice(1000 + i * 50, 50);
    host.drainShipNotices();
    const kernelFuel = host.currentWorld.ships.ship?.engineFuel ?? Number.NaN;
    expect(kernelFuel).toBeLessThan(700);
    expect(kernelFuel).toBeGreaterThan(690);
    expect(host.shipRecordFor('u1')?.engineFuel).toBe(kernelFuel);
    expect(host.shipRecordFor('u1')?.stores.fuelCells).toBe(1);
    host.stop();
  });

  it('routes SPAWN_ABOARD intents without notices', () => {
    const host = new SimHost(buildHarborWorld(), DEFAULT_CLOCKS, null);
    const result = host.handleIntent('c9', { type: 'SPAWN_ABOARD', seq: 1, userId: 'u9' });
    expect(result.notice).toBeUndefined();
    expect(host.currentWorld.pawns['pawn:u9']).toBeDefined();
    host.stop();
  });
});
