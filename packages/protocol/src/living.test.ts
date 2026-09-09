import { describe, expect, it } from 'vitest';
import { isFixtureKind } from './living.js';
import type { SnapshotBroadcast, TelemetryBroadcast, VitalsBroadcast } from './snapshots.js';
import { INTENT_RATE_LIMIT_PER_SECOND, validateClientIntent } from './validate.js';

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as unknown as T;
}

describe('protocol v2 living slice', () => {
  it('validates CLAIM/VEND/COOK/HARVEST/RECYCLE/REPAIR', () => {
    expect(validateClientIntent({ type: 'CLAIM', seq: 1, fixtureId: 'ship.bunk_a' }).ok).toBe(true);
    expect(
      validateClientIntent({
        type: 'VEND',
        seq: 2,
        fixtureId: 'station.vend',
        vendId: 'ration_tin',
      }).ok
    ).toBe(true);
    expect(validateClientIntent({ type: 'COOK', seq: 3, stoveId: 'ship.stove' }).ok).toBe(true);
    expect(validateClientIntent({ type: 'HARVEST', seq: 4, trayId: 'ship.hydro' }).ok).toBe(true);
    expect(validateClientIntent({ type: 'RECYCLE', seq: 5, recyclerId: 'ship.recycler' }).ok).toBe(
      true
    );
    expect(validateClientIntent({ type: 'REPAIR', seq: 6, fixtureId: 'ship.stove' }).ok).toBe(true);
  });

  it('rejects living intents with bad ids', () => {
    expect(validateClientIntent({ type: 'CLAIM', seq: 1, fixtureId: '' }).ok).toBe(false);
    expect(validateClientIntent({ type: 'COOK', seq: 1 }).ok).toBe(false);
    expect(validateClientIntent({ type: 'VEND', seq: 1, fixtureId: 'x' }).ok).toBe(false);
  });

  it('rate-limits the living verbs', () => {
    expect(INTENT_RATE_LIMIT_PER_SECOND.CLAIM).toBe(4);
    expect(INTENT_RATE_LIMIT_PER_SECOND.VEND).toBe(4);
    expect(INTENT_RATE_LIMIT_PER_SECOND.COOK).toBe(4);
    expect(INTENT_RATE_LIMIT_PER_SECOND.HARVEST).toBe(4);
    expect(INTENT_RATE_LIMIT_PER_SECOND.RECYCLE).toBe(4);
    expect(INTENT_RATE_LIMIT_PER_SECOND.REPAIR).toBe(8);
  });

  it('round-trips fixture snapshots and living telemetry additively', () => {
    expect(isFixtureKind('stove')).toBe(true);
    expect(isFixtureKind('warp_drive')).toBe(false);
    const snap: SnapshotBroadcast = {
      type: 'SNAPSHOT',
      v: 2,
      tick: 1,
      serverTimeMs: 50,
      pawns: [],
      impacts: [],
      portals: [],
      projectiles: [],
      frames: [],
      fixtures: [
        {
          id: 'ship.stove',
          kind: 'stove',
          roomId: 'ship.kajute_nord',
          x: 140,
          y: 200,
          integrity: 100,
          online: true,
          progressPct: 40,
        },
      ],
    };
    expect(roundTrip(snap)).toEqual(snap);
    const tele: TelemetryBroadcast = {
      type: 'TELEMETRY',
      v: 2,
      tick: 1,
      serverTimeMs: 50,
      subsystems: {},
      atmos: [],
      living: [{ roomId: 'ship.kajute_nord', powerKw: 3.2, heatC: 42.5, mealsReady: 1 }],
    };
    expect(roundTrip(tele)).toEqual(tele);
    const vitals: VitalsBroadcast = {
      type: 'VITALS',
      v: 2,
      tick: 1,
      serverTimeMs: 50,
      vitals: {
        hunger: 80,
        thirst: 80,
        fatigue: 10,
        health: 100,
        hypoxia: 0,
        suitSealed: false,
        ammo: 30,
        reserve: 120,
        mags: [30, 30],
        reloading: false,
        mealBuffS: 45,
      },
      credits: 10,
      clearance: 0,
    };
    expect(roundTrip(vitals)).toEqual(vitals);
  });
});
