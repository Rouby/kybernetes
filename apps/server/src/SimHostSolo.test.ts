import { buildHarborWorld } from '@kybernetes/sim-core';
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

  it('routes SPAWN_ABOARD intents without notices', () => {
    const host = new SimHost(buildHarborWorld(), DEFAULT_CLOCKS, null);
    const result = host.handleIntent('c9', { type: 'SPAWN_ABOARD', seq: 1, userId: 'u9' });
    expect(result.notice).toBeUndefined();
    expect(host.currentWorld.pawns['pawn:u9']).toBeDefined();
    host.stop();
  });
});
