import {
  buildHarborWorld,
  buildSnapshot,
  buildSnapshotDelta,
  HARBOR_BEACON,
} from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import { SimHost } from './SimHost.js';

function riggedHost(): SimHost {
  return new SimHost(buildHarborWorld(), undefined, null, {
    stationFrameId: 'station',
    rng01: () => 0.1,
  });
}

describe('pawn-less observers (same-port OBSERVE)', () => {
  it('joins without evicting the player or spawning a pawn', () => {
    const host = riggedHost();
    const player = host.joinBeacon('c1', HARBOR_BEACON, 'Rook', '#fff', 'u1');
    expect('denied' in player).toBe(false);
    const pawnsBefore = Object.keys(host.currentWorld.pawns).length;
    const observer = host.joinObserver('obs1', HARBOR_BEACON, 1000);
    expect(observer).toEqual({ ok: true });
    expect(host.isObserver('obs1')).toBe(true);
    expect(host.observerCount).toBe(1);
    expect(host.drainEvictedClients()).toEqual([]);
    expect(Object.keys(host.currentWorld.pawns)).toHaveLength(pawnsBefore);
    host.stop();
  });

  it('drops observer INPUT as read-only without moving the pawn', () => {
    const host = riggedHost();
    const player = host.joinBeacon('c1', HARBOR_BEACON, 'Rook', '#fff', 'u1');
    const pawnId = 'denied' in player ? '' : player.pawnId;
    host.joinObserver('obs1', HARBOR_BEACON, 1000);
    const before = { ...host.currentWorld.pawns[pawnId]?.pos };
    const result = host.handleIntent('obs1', {
      type: 'INPUT',
      seq: 1,
      moveVec: { x: 1, y: 0 },
      facing: 0,
      sprint: false,
      sealed: false,
    });
    expect(result.notice).toBe('observer-readonly');
    host.slice(1050, 50);
    expect(host.currentWorld.pawns[pawnId]?.pos).toEqual(before);
    host.stop();
  });

  it('routes OBSERVE intents through handleIntent without a pawn', () => {
    const host = riggedHost();
    const result = host.handleIntent('obs9', { type: 'OBSERVE', seq: 0, beacon: HARBOR_BEACON });
    expect(result.notice).toBeUndefined();
    expect(host.isObserver('obs9')).toBe(true);
    host.stop();
  });

  it('leaves without releasing the player beacon seat', () => {
    const host = riggedHost();
    host.joinBeacon('c1', HARBOR_BEACON, 'Rook', '#fff', 'u1');
    host.joinObserver('obs1', HARBOR_BEACON, 1000);
    host.leaveClient('obs1');
    expect(host.observerCount).toBe(0);
    expect(host.clientOf('c1')).toBeDefined();
    host.stop();
  });

  it('reports tick health and pawn link quality', () => {
    const host = riggedHost();
    host.joinBeacon('c1', HARBOR_BEACON, 'Rook', '#fff', 'u1');
    host.slice(50, 50);
    host.slice(100, 50);
    const health = host.tickHealth(100);
    expect(health.tpsActual).toBeGreaterThanOrEqual(0);
    expect(health.droppedSteps).toBeGreaterThanOrEqual(0);
    const links = host.pawnLinks(200);
    expect(links).toHaveLength(1);
    expect(links[0].pawnId).toMatch(/^pawn:/);
    expect(links[0].lastInputAgeMs).toBe(-1);
    host.stop();
  });

  it('carries persistent decals through full + delta snapshots', () => {
    const host = riggedHost();
    const full = buildSnapshot(host.currentWorld, 1000);
    expect(full.decals).toEqual([]);
    expect(full.impacts).toEqual([]);
    // Unchanged empty table is omitted from the delta to save bytes.
    const unchanged = buildSnapshotDelta(
      full.portals,
      full.frames,
      full.tick,
      host.currentWorld,
      1100,
      []
    );
    expect(unchanged.decals).toBeUndefined();
    // A new crater forces the complete table onto the delta.
    const cratered = {
      ...host.currentWorld,
      decals: [
        {
          id: 'decal.ship.1.0',
          frameId: 'ship',
          x: 10,
          y: 20,
          angle: 0,
          radius: 6,
          weapon: 'kinetic_carbine',
          bornTick: 1,
        },
      ],
    };
    const changed = buildSnapshotDelta(full.portals, full.frames, full.tick, cratered, 1100, []);
    expect(changed.decals).toHaveLength(1);
    host.stop();
  });

  it('hire grants a role but never teleports the pawn', () => {
    const host = riggedHost();
    const player = host.joinBeacon('c1', HARBOR_BEACON, 'Rook', '#fff', 'u1');
    const pawnId = 'denied' in player ? '' : player.pawnId;
    expect(host.currentWorld.pawns[pawnId]?.frameId).toBe('station');
    // No offer -> hire refused, pawn stays put (no teleport path exists).
    const refused = host.handleIntent('c1', {
      type: 'HIRE',
      seq: 1,
      offerId: 'offer_bogus',
      job: 'engineer',
    });
    expect(refused.notice).toBe('hire-refused');
    expect(host.currentWorld.pawns[pawnId]?.frameId).toBe('station');
    host.stop();
  });
});
