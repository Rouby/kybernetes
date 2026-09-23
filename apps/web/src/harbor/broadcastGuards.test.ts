import { describe, expect, it } from 'vitest';
import {
  BROADCAST_GUARDS,
  getBroadcastDropStats,
  resetBroadcastDropStats,
} from './broadcastGuards';

describe('broadcastGuards', () => {
  it('accepts minimal valid snapshot/telemetry/vitals shapes', () => {
    expect(
      BROADCAST_GUARDS.SNAPSHOT({
        v: 2,
        type: 'SNAPSHOT',
        tick: 1,
        serverTimeMs: 10,
        pawns: [],
        portals: [],
      })
    ).toBe(true);
    expect(
      BROADCAST_GUARDS.TELEMETRY({
        v: 2,
        type: 'TELEMETRY',
        tick: 1,
        serverTimeMs: 10,
        subsystems: {},
        atmos: [],
      })
    ).toBe(true);
    expect(
      BROADCAST_GUARDS.VITALS({
        v: 2,
        type: 'VITALS',
        tick: 1,
        serverTimeMs: 10,
        vitals: { hunger: 1, thirst: 1, fatigue: 1, health: 1, hypoxia: 0, dead: false },
      })
    ).toBe(true);
  });

  it('rejects NaN ticks, missing arrays, and non-finite vitals', () => {
    expect(
      BROADCAST_GUARDS.SNAPSHOT({
        v: 2,
        type: 'SNAPSHOT',
        tick: Number.NaN,
        serverTimeMs: 10,
        pawns: [],
        portals: [],
      })
    ).toBe(false);
    expect(
      BROADCAST_GUARDS.SNAPSHOT({
        v: 2,
        type: 'SNAPSHOT',
        tick: 1,
        serverTimeMs: 10,
        pawns: 'nope',
      })
    ).toBe(false);
    expect(
      BROADCAST_GUARDS.SNAPSHOT_DELTA({
        v: 2,
        type: 'SNAPSHOT_DELTA',
        tick: 2,
        serverTimeMs: 20,
        baseTick: 1,
        full: false,
        portalRev: 1,
        frameRev: 1,
        pawns: [],
        portals: [],
        impacts: [],
        projectiles: [],
        frames: [],
      })
    ).toBe(true);
    expect(
      BROADCAST_GUARDS.CHART_STATE({
        v: 2,
        type: 'CHART_STATE',
        tick: 1,
        serverTimeMs: 5,
        vesselId: 's',
      })
    ).toBe(false);
  });

  it('tracks and resets drop counters', () => {
    resetBroadcastDropStats();
    expect(getBroadcastDropStats()).toEqual({
      version: 0,
      shape: 0,
      staleDeltaBase: 0,
      unknownType: 0,
    });
  });
});
