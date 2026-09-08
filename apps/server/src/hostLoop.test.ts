import {
  buildHarborWorld,
  buildHireOffer,
  buildManifest,
  buildVitals,
  buildWatch,
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

function driver(host: SimHost): (seconds: number) => void {
  let nowMs = 0;
  return (seconds: number) => {
    const ticks = Math.round(seconds / 0.05);
    for (let i = 0; i < ticks; i += 1) {
      nowMs += 50;
      host.slice(nowMs, 50);
    }
  };
}

describe('host loop sessions', () => {
  it('spawns fresh crew at the station and resumes them by userId', () => {
    const host = riggedHost();
    const first = host.joinBeacon('c1', HARBOR_BEACON, 'Rook', '#fff', 'u1');
    expect(first?.resumed).toBe(false);
    expect(host.currentWorld.pawns[first?.pawnId ?? '']?.frameId).toBe('station');
    host.leaveClient('c1');
    const second = host.joinBeacon('c1b', HARBOR_BEACON, 'Rook', '#fff', 'u1');
    expect(second?.resumed).toBe(true);
    expect(second?.pawnId).toBe(first?.pawnId);
    host.stop();
  });

  it('rejects unknown beacons without spawning', () => {
    const host = riggedHost();
    expect(host.joinBeacon('c9', 'NOPE', 'Rook', '#fff', 'u9')).toEqual({
      denied: 'unknown-beacon',
    });
    host.stop();
  });

  it('shares one vessel between co-op crew with manifest roles', () => {
    const host = riggedHost();
    host.joinBeacon('c1', HARBOR_BEACON, 'Rook', '#fff', 'u1');
    host.joinBeacon('c2', HARBOR_BEACON, 'Sable', '#000', 'u2');
    const manifest = host.manifestFor();
    expect(manifest).toHaveLength(2);
    const manifestSent = buildManifest(host.currentWorld, 'ship', 0, manifest);
    expect(manifestSent.crew).toHaveLength(2);
    expect(manifestSent.beacon).toBe(HARBOR_BEACON);
    expect(manifestSent.shipName).toBe('CSS Hesperia');
    host.stop();
  });

  it('runs talk to hire to departure through validated intents', () => {
    const host = riggedHost();
    host.handleIntent('c1', { type: 'HELLO', callsign: 'Rook', color: '#fff', clientVersion: 2 });
    host.handleIntent('c1', { type: 'JOIN_BEACON', beacon: HARBOR_BEACON, seq: 0, userId: 'u1' });
    const talk = host.handleIntent('c1', { type: 'TALK', seq: 1, npcId: 'captain:ship' });
    expect(talk.offer?.jobs).toEqual(['engineer', 'deckhand']);
    if (talk.offer === undefined) throw new Error('no offer');
    expect(buildHireOffer(0, 0, talk.offer).jobs).toHaveLength(2);
    const hire = host.handleIntent('c1', {
      type: 'HIRE',
      seq: 2,
      offerId: talk.offer.offerId,
      job: 'engineer',
    });
    expect(hire.notice).toBeUndefined();
    expect(host.currentWorld.vessels.ship?.schedule).toBe('departing');
    expect(host.clientOf('c1')?.pawnId).toBe('pawn:u1');
    host.stop();
  });

  it('refuses hire and talk outside the loop rules', () => {
    const host = riggedHost();
    expect(
      host.handleIntent('ghost', {
        type: 'INPUT',
        seq: 0,
        moveVec: { x: 0, y: 0 },
        facing: 0,
        sprint: false,
        sealed: false,
      }).notice
    ).toBe('not-joined');
    host.joinBeacon('c1', HARBOR_BEACON, 'Rook', '#fff', 'u1');
    expect(host.handleIntent('c1', { type: 'TALK', seq: 1, npcId: 'nobody' }).notice).toBe(
      'no-offer'
    );
    expect(
      host.handleIntent('c1', { type: 'HIRE', seq: 2, offerId: 'offer_bogus', job: 'cook' }).notice
    ).toBe('hire-refused');
    host.stop();
  });

  it('builds an empty watch broadcast before the first leg', () => {
    const host = riggedHost();
    expect(buildWatch(host.currentWorld, 'ship', 0)).toBeUndefined();
    expect(buildWatch(host.currentWorld, 'nope', 0)).toBeUndefined();
    host.stop();
  });

  it('grades the full journey with credits through host slices', () => {
    const host = riggedHost();
    host.joinBeacon('c1', HARBOR_BEACON, 'Rook', '#fff', 'u1');
    const drive = driver(host);
    let seq = 0;
    const pushEast = (): void => {
      seq += 1;
      host.handleIntent('c1', {
        type: 'INPUT',
        seq,
        moveVec: { x: 1, y: 0 },
        facing: 0,
        sprint: false,
        sealed: false,
      });
      drive(0.05);
    };
    for (let i = 0; i < 200; i += 1) {
      if ((host.currentWorld.pawns['pawn:u1']?.pos.x ?? 0) > 510) break;
      pushEast();
    }
    expect(
      host.handleIntent('c1', { type: 'DOOR', seq: 900, portalId: 'station.lobby_bay', wantOpen: true })
        .notice
    ).toBe('DOOR_ok');
    for (let i = 0; i < 400; i += 1) {
      if (host.currentWorld.pawns['pawn:u1']?.frameId === 'ship') break;
      pushEast();
    }
    expect(host.currentWorld.pawns['pawn:u1']?.frameId).toBe('ship');
    const talk = host.handleIntent('c1', { type: 'TALK', seq: 500, npcId: 'captain:ship' });
    if (talk.offer === undefined) throw new Error('no offer');
    host.handleIntent('c1', {
      type: 'HIRE',
      seq: 501,
      offerId: talk.offer.offerId,
      job: 'deckhand',
    });
    drive(3.5 + 20.5);
    const watch = buildWatch(host.currentWorld, 'ship', 1000);
    expect(watch?.grade).toBe('S');
    expect(watch?.checklist.length).toBe(4);
    expect(host.vitalsFor('pawn:u1').credits).toBe(200);
    expect(host.manifestFor().find((entry) => entry.id === 'pawn:u1')?.role).toBe('deckhand');
    host.stop();
  });

  it('routes suit, consume, sleep, and fire intents through the kernel', () => {
    const host = riggedHost();
    host.joinBeacon('c1', HARBOR_BEACON, 'Rook', '#fff', 'u1');
    expect(host.handleIntent('c1', { type: 'SUIT', seq: 1, sealed: true }).notice).toBe('SUIT_ok');
    expect(host.currentWorld.vitals['pawn:u1']?.suitSealed).toBe(true);
    expect(host.handleIntent('c1', { type: 'CONSUME', seq: 2, itemId: 'ration' }).notice).toBe(
      'CONSUME_ok'
    );
    expect(
      host.handleIntent('c1', { type: 'SLEEP', seq: 3, bunkId: 'bunk_a', active: true }).notice
    ).toBe('SLEEP_ok');
    expect(host.currentWorld.vitals['pawn:u1']?.sleeping).toBe(true);
    expect(
      host.handleIntent('c1', { type: 'FIRE', seq: 4, originAngle: 0, weapon: 'kinetic_carbine' })
        .notice
    ).toMatch(/^FIRE_(miss|fired|overheated|empty)/);
    expect(host.handleIntent('c1', { type: 'RELOAD', seq: 5 }).notice).toBe('RELOAD_ok');
    expect(host.handleIntent('c1', { type: 'RELOAD', seq: 6 }).notice).toBe('RELOAD_busy');
    const vitals = buildVitals(host.currentWorld, 0, 'pawn:u1', 0, 1);
    expect(vitals.vitals.suitSealed).toBe(true);
    expect(vitals.vitals.hunger).toBe(100);
    expect(vitals.vitals.ammo).toBe(29);
    expect(vitals.vitals.reloading).toBe(true);
    host.stop();
  });

  it('shares one vessel across a four-client co-op crew', () => {
    const host = riggedHost();
    const ids = ['u1', 'u2', 'u3', 'u4'];
    for (const [i, user] of ids.entries()) {
      const joined = host.joinBeacon(`c${i}`, HARBOR_BEACON, `Crew${i}`, '#fff', user, i);
      expect(joined).toEqual({ pawnId: `pawn:${user}`, resumed: false });
    }
    expect(host.manifestFor()).toHaveLength(4);
    const frames = new Set(ids.map((user) => host.currentWorld.pawns[`pawn:${user}`]?.frameId));
    expect(frames).toEqual(new Set(['station']));
    host.stop();
  });

  it('caps beacon membership and releases slots on leave', () => {
    const host = riggedHost();
    for (let i = 0; i < 8; i += 1) {
      expect(host.joinBeacon(`c${i}`, HARBOR_BEACON, `Crew${i}`, '#fff', `cap${i}`, 0)).toEqual({
        pawnId: `pawn:cap${i}`,
        resumed: false,
      });
    }
    expect(host.joinBeacon('c8', HARBOR_BEACON, 'Extra', '#fff', 'cap8', 1)).toEqual({
      denied: 'beacon-full',
    });
    host.leaveClient('c0');
    expect(host.joinBeacon('c8', HARBOR_BEACON, 'Extra', '#fff', 'cap8', 2)).toEqual({
      pawnId: 'pawn:cap8',
      resumed: false,
    });
    host.stop();
  });
});
