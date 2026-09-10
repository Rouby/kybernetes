import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from './envelope.js';
import {
  makeCargoState,
  makeNavState,
  makeShipLost,
  makeShipStatus,
  makeShipSystems,
} from './shipSnapshots.js';
import { INTENT_RATE_LIMIT_PER_SECOND, validateClientIntent } from './validate.js';

describe('solo-ship wire (M1)', () => {
  it('validates SPAWN_ABOARD with seq dedupe shape', () => {
    const ok = validateClientIntent({ type: 'SPAWN_ABOARD', seq: 7 });
    expect(ok.ok).toBe(true);
    const withUser = validateClientIntent({ type: 'SPAWN_ABOARD', seq: 8, userId: 'u1' });
    expect(withUser.ok).toBe(true);
    expect(validateClientIntent({ type: 'SPAWN_ABOARD', seq: -1 }).ok).toBe(false);
    expect(validateClientIntent({ type: 'SPAWN_ABOARD' }).ok).toBe(false);
  });

  it('builds versioned SHIP_STATUS with tick monotonicity fields', () => {
    const a = makeShipStatus(
      {
        shipId: 'ship:u1',
        hullId: 'skiff_alpha',
        reactorTier: 0,
        engineTier: 0,
        credits: 20,
        condition: 100,
        locationHubId: 'hub_a',
        alive: true,
        stores: { rations: 2, waterL: 4, o2Cells: 2, fuelCells: 1 },
      },
      41,
      1000
    );
    expect(a.type).toBe('SHIP_STATUS');
    expect(a.v).toBe(PROTOCOL_VERSION);
    expect(a.tick).toBe(41);
    const lost = makeShipLost('ship:u1', 'reactor', 42, 1050);
    expect(lost.type).toBe('SHIP_LOST');
    expect(lost.tick).toBeGreaterThan(a.tick);
  });

  it('validates console tune intents and rate-limits them at 8Hz', () => {
    expect(
      validateClientIntent({ type: 'REACTOR_TUNE', seq: 1, rodsDelta: 0.1, coolantDelta: -0.1 }).ok
    ).toBe(true);
    expect(
      validateClientIntent({ type: 'REACTOR_TUNE', seq: 2, rodsDelta: 5, coolantDelta: 0 }).ok
    ).toBe(false);
    expect(validateClientIntent({ type: 'REACTOR_TUNE', seq: 3 }).ok).toBe(false);
    expect(validateClientIntent({ type: 'REACTOR_RESTART', seq: 4 }).ok).toBe(true);
    expect(
      validateClientIntent({ type: 'ENGINE_TUNE', seq: 5, spoolCmd: 1, tuneSet: 0.8 }).ok
    ).toBe(true);
    expect(validateClientIntent({ type: 'ENGINE_TUNE', seq: 6, spoolCmd: 1 }).ok).toBe(true);
    expect(validateClientIntent({ type: 'ENGINE_TUNE', seq: 7, spoolCmd: 2 }).ok).toBe(false);
    expect(validateClientIntent({ type: 'ENGINE_TUNE', seq: 8, spoolCmd: 0, tuneSet: 9 }).ok).toBe(
      false
    );
    expect(INTENT_RATE_LIMIT_PER_SECOND.REACTOR_TUNE).toBe(8);
    expect(INTENT_RATE_LIMIT_PER_SECOND.REACTOR_RESTART).toBe(8);
    expect(INTENT_RATE_LIMIT_PER_SECOND.ENGINE_TUNE).toBe(8);
  });

  it('builds quantized SHIP_SYSTEMS snapshots', () => {
    const systems = makeShipSystems(
      {
        vesselId: 'ship',
        tempK: 660.05,
        bandLo: 620,
        bandHi: 700,
        rods: 0.333,
        coolant: 0.5,
        outputMW: 31.05,
        demandMW: 28,
        scrammed: false,
        warned: false,
        spool: 1,
        tune: 0.666,
        wear: 0,
        brownout: false,
        condition: 99.95,
      },
      43,
      1100
    );
    expect(systems.type).toBe('SHIP_SYSTEMS');
    expect(systems.v).toBe(PROTOCOL_VERSION);
    expect(systems.tempK).toBe(660.1);
    expect(systems.rods).toBe(0.33);
    expect(systems.condition).toBe(100);
  });

  it('validates nav intents and rate-limits them at 2Hz', () => {
    expect(validateClientIntent({ type: 'NAV_PLOT', seq: 1, destHubId: 'hub_b' }).ok).toBe(true);
    expect(validateClientIntent({ type: 'NAV_PLOT', seq: 2 }).ok).toBe(false);
    expect(validateClientIntent({ type: 'NAV_PLOT', seq: 3, destHubId: '' }).ok).toBe(false);
    expect(validateClientIntent({ type: 'NAV_CANCEL', seq: 4 }).ok).toBe(true);
    expect(validateClientIntent({ type: 'DISTRESS', seq: 5 }).ok).toBe(true);
    expect(validateClientIntent({ type: 'DISTRESS' }).ok).toBe(false);
    expect(INTENT_RATE_LIMIT_PER_SECOND.NAV_PLOT).toBe(2);
    expect(INTENT_RATE_LIMIT_PER_SECOND.NAV_CANCEL).toBe(2);
    expect(INTENT_RATE_LIMIT_PER_SECOND.DISTRESS).toBe(2);
  });

  it('validates cargo intents and rate-limits them at 8Hz', () => {
    expect(validateClientIntent({ type: 'CARGO_PICKUP', seq: 1, crateId: 'c1' }).ok).toBe(true);
    expect(validateClientIntent({ type: 'CARGO_PICKUP', seq: 2 }).ok).toBe(false);
    expect(validateClientIntent({ type: 'CARGO_DROP', seq: 3 }).ok).toBe(true);
    expect(validateClientIntent({ type: 'CARGO_UNPACK', seq: 4, crateIds: ['c1'] }).ok).toBe(true);
    expect(validateClientIntent({ type: 'CARGO_UNPACK', seq: 5, crateIds: [] }).ok).toBe(false);
    expect(validateClientIntent({ type: 'CARGO_REPACK', seq: 6, goodId: 'scrap', qty: 3 }).ok).toBe(
      true
    );
    expect(
      validateClientIntent({ type: 'CARGO_REPACK', seq: 7, goodId: 'scrap', qty: 99 }).ok
    ).toBe(false);
    expect(INTENT_RATE_LIMIT_PER_SECOND.CARGO_PICKUP).toBe(8);
    expect(INTENT_RATE_LIMIT_PER_SECOND.CARGO_DROP).toBe(8);
    expect(INTENT_RATE_LIMIT_PER_SECOND.CARGO_UNPACK).toBe(8);
    expect(INTENT_RATE_LIMIT_PER_SECOND.CARGO_REPACK).toBe(8);
  });

  it('builds CARGO_STATE snapshots', () => {
    const state = makeCargoState(
      'ship',
      [{ goodId: 'scrap', qty: 5 }],
      { 'pawn:u1': 'c1' },
      45,
      1300
    );
    expect(state.type).toBe('CARGO_STATE');
    expect(state.v).toBe(PROTOCOL_VERSION);
    expect(state.secured).toEqual([{ goodId: 'scrap', qty: 5 }]);
  });

  it('builds NAV_STATE snapshots', () => {
    const nav = makeNavState(
      'ship',
      {
        phase: 'in_transit',
        destHubId: 'hub_b',
        remainingS: 87.05,
        legId: 3,
        portHubId: 'hub_a',
        flameout: false,
      },
      44,
      1200
    );
    expect(nav.type).toBe('NAV_STATE');
    expect(nav.v).toBe(PROTOCOL_VERSION);
    expect(nav.remainingS).toBe(87.1);
    expect(nav.legId).toBe(3);
  });
});
