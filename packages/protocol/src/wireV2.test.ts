import { describe, expect, it } from 'vitest';
import type { StartingRole } from './actions.js';
import { isRole, LEGACY_ROLE_MAP, normalizeRole, ROLES } from './content.js';
import { isV2Packet, makeHelloMismatch, PROTOCOL_VERSION, readPacketVersion } from './envelope.js';
import { advanceSeq, isFreshSeq, isNewerTick, type SeqCursor } from './seq.js';
import type { JoinedBroadcast, ServerSnapshot, SnapshotBroadcast } from './snapshots.js';
import { INTENT_RATE_LIMIT_PER_SECOND, validateClientIntent } from './validate.js';

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as unknown as T;
}

describe('protocol v2 version reject', () => {
  it('rejects unversioned v1 packets with a HELLO_MISMATCH notice', () => {
    const legacy = { type: 'JOIN_VESSEL', vesselCode: 'HESP01', callsign: 'Rook', role: 'wiper' };
    expect(readPacketVersion(legacy)).toBeUndefined();
    expect(isV2Packet(legacy)).toBe(false);
    const notice = makeHelloMismatch(0, 0, readPacketVersion(legacy));
    expect(notice.v).toBe(PROTOCOL_VERSION);
    expect(notice.type).toBe('HELLO_MISMATCH');
    expect(notice.expectedVersion).toBe(2);
    expect(roundTrip(notice)).toEqual(notice);
  });

  it('flags explicit wrong versions', () => {
    expect(readPacketVersion({ v: 1, type: 'INPUT' })).toBe(1);
    expect(isV2Packet({ v: 1, type: 'INPUT' })).toBe(false);
    expect(isV2Packet({ v: 2, type: 'INPUT' })).toBe(true);
    expect(isV2Packet(null)).toBe(false);
  });

  it('strips client-sent positions instead of trusting them', () => {
    const trusted = {
      type: 'INPUT',
      seq: 3,
      x: 510,
      y: 350,
      moveVec: { x: 0, y: 0 },
      facing: 0,
      sprint: false,
      sealed: false,
    };
    const result = validateClientIntent(trusted);
    expect(result.ok).toBe(true);
    if (result.ok) expect('x' in result.intent).toBe(false);
  });
});

describe('protocol v2 seq dedupe', () => {
  it('accepts the first seq and strictly increasing successors', () => {
    let cursor: SeqCursor;
    for (const seq of [0, 1, 2, 41]) {
      expect(isFreshSeq(cursor, seq)).toBe(true);
      cursor = advanceSeq(cursor, seq);
    }
    expect(cursor).toBe(41);
  });

  it('drops duplicates and reordered arrivals', () => {
    expect(isFreshSeq(41, 41)).toBe(false);
    expect(isFreshSeq(41, 12)).toBe(false);
    expect(advanceSeq(41, 12)).toBe(41);
  });

  it('rejects non-integer and negative seq values', () => {
    expect(isFreshSeq(undefined, -1)).toBe(false);
    expect(isFreshSeq(undefined, 1.5)).toBe(false);
    expect(isFreshSeq(3, Number.NaN)).toBe(false);
  });
});

describe('protocol v2 rate-limit vectors', () => {
  it('matches the specified per-channel budgets', () => {
    expect(INTENT_RATE_LIMIT_PER_SECOND.INPUT).toBe(20);
    expect(INTENT_RATE_LIMIT_PER_SECOND.INTERACT).toBe(8);
    expect(INTENT_RATE_LIMIT_PER_SECOND.DOOR).toBe(8);
    expect(INTENT_RATE_LIMIT_PER_SECOND.HIRE).toBe(2);
    expect(INTENT_RATE_LIMIT_PER_SECOND.TALK).toBe(2);
    expect(INTENT_RATE_LIMIT_PER_SECOND.HELLO).toBe(2);
    expect(INTENT_RATE_LIMIT_PER_SECOND.JOIN_BEACON).toBe(2);
  });
});

describe('protocol v2 role-enum unification', () => {
  it('maps every legacy StartingRole onto the single Role enum', () => {
    const legacyRoles: StartingRole[] = [
      'wiper',
      'galley_hand',
      'security_private',
      'hydro_tender',
      'stevedore',
    ];
    for (const legacy of legacyRoles) {
      expect(LEGACY_ROLE_MAP[legacy]).toSatisfy(isRole);
    }
    expect(normalizeRole('wiper')).toBe('deckhand');
    expect(normalizeRole('galley_hand')).toBe('cook');
    expect(normalizeRole('hydro_tender')).toBe('engineer');
    expect(normalizeRole('security_private')).toBe('security');
  });

  it('keeps exactly four playable roles with captain NPC-only', () => {
    expect(ROLES).toHaveLength(4);
    expect(ROLES).toContain('security');
    expect(normalizeRole('captain')).toBeUndefined();
    expect(normalizeRole('admiral')).toBeUndefined();
  });

  it('accepts HIRE for security, which v1 HireableJob lacked', () => {
    const result = validateClientIntent({
      type: 'HIRE',
      seq: 1,
      offerId: 'offer_9',
      job: 'security',
    });
    expect(result.ok).toBe(true);
  });
});

describe('protocol v2 snapshot tick monotonicity', () => {
  it('orders ticks strictly', () => {
    expect(isNewerTick(7, 8)).toBe(true);
    expect(isNewerTick(8, 8)).toBe(false);
    expect(isNewerTick(9, 8)).toBe(false);
    expect(isNewerTick(-1, 0)).toBe(false);
    expect(isNewerTick(0.5, 1)).toBe(false);
  });

  it('carries v and tick on every snapshot channel', () => {
    const snapshot: SnapshotBroadcast = {
      type: 'SNAPSHOT',
      v: 2,
      tick: 120,
      serverTimeMs: 6000,
      pawns: [],
      portals: [],
      projectiles: [],
      frames: [],
    };
    const parsed = roundTrip(snapshot);
    expect(parsed.v).toBe(2);
    expect(isNewerTick(119, parsed.tick)).toBe(true);
    expect(isNewerTick(120, parsed.tick)).toBe(false);
  });

  it('identifies the joining pawn with a JOINED handshake', () => {
    const joined: JoinedBroadcast = {
      type: 'JOINED',
      v: 2,
      tick: 12,
      serverTimeMs: 600,
      pawnId: 'pawn:u1',
      beacon: 'HESP01',
    };
    const parsed = roundTrip<ServerSnapshot>(joined);
    expect(parsed.type).toBe('JOINED');
    if (parsed.type === 'JOINED') expect(parsed.pawnId).toBe('pawn:u1');
  });
});
