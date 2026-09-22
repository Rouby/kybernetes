import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from './envelope.js';
import {
  makeCargoState,
  makeChartState,
  makeMarketState,
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

  it('rejects retired tune intents and validates fuel and restart', () => {
    expect(validateClientIntent({ type: 'REACTOR_TUNE', seq: 1, rodsDelta: 0.1 }).ok).toBe(false);
    expect(validateClientIntent({ type: 'ENGINE_TUNE', seq: 5, spoolCmd: 1 }).ok).toBe(false);
    expect(validateClientIntent({ type: 'REACTOR_RESTART', seq: 4 }).ok).toBe(true);
    expect(validateClientIntent({ type: 'ENGINE_FUEL', seq: 9, op: 'load' }).ok).toBe(true);
    expect(validateClientIntent({ type: 'ENGINE_FUEL', seq: 10, op: 'unload' }).ok).toBe(true);
    expect(validateClientIntent({ type: 'ENGINE_FUEL', seq: 11, op: 'vent' }).ok).toBe(false);
    expect(validateClientIntent({ type: 'ENGINE_FUEL', seq: 12 }).ok).toBe(false);
    expect(INTENT_RATE_LIMIT_PER_SECOND.REACTOR_RESTART).toBe(8);
    expect(INTENT_RATE_LIMIT_PER_SECOND.ENGINE_FUEL).toBe(4);
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
        scrammed: false,
        warned: false,
        condition: 99.95,
        fuel: 1450,
        fuelMax: 2000,
        fuelSlots: 2,
      },
      43,
      1100
    );
    expect(systems.type).toBe('SHIP_SYSTEMS');
    expect(systems.v).toBe(PROTOCOL_VERSION);
    expect(systems.tempK).toBe(660.1);
    expect(systems.rods).toBe(0.33);
    expect(systems.condition).toBe(100);
    expect(systems.fuel).toBe(1450);
    expect(systems.fuelMax).toBe(2000);
    expect(systems.fuelSlots).toBe(2);
  });

  it('validates nav intents and rate-limits them at 2Hz', () => {
    expect(validateClientIntent({ type: 'NAV_PLOT', seq: 1, destHubId: 'hub_b' }).ok).toBe(true);
    expect(validateClientIntent({ type: 'NAV_PLOT', seq: 2 }).ok).toBe(false);
    expect(validateClientIntent({ type: 'NAV_PLOT', seq: 3, destHubId: '' }).ok).toBe(false);
    const via = validateClientIntent({
      type: 'NAV_PLOT',
      seq: 6,
      destHubId: 'hub_b',
      waypointIds: ['poi_kestrel'],
    });
    expect(via.ok).toBe(true);
    if (via.ok) expect(via.intent).toMatchObject({ waypointIds: ['poi_kestrel'] });
    const throttled = validateClientIntent({
      type: 'NAV_PLOT',
      seq: 8,
      destHubId: 'hub_b',
      thrust01: 0.5,
    });
    expect(throttled.ok).toBe(true);
    if (throttled.ok) expect(throttled.intent).toMatchObject({ thrust01: 0.5 });
    expect(
      validateClientIntent({ type: 'NAV_PLOT', seq: 9, destHubId: 'hub_b', thrust01: 2 }).ok
    ).toBe(false);
    expect(
      validateClientIntent({ type: 'NAV_PLOT', seq: 10, destHubId: 'hub_b', thrust01: 'fast' }).ok
    ).toBe(false);
    expect(
      validateClientIntent({ type: 'NAV_PLOT', seq: 7, destHubId: 'hub_b', waypointIds: 'x' }).ok
    ).toBe(false);
    expect(
      validateClientIntent({ type: 'NAV_PLOT', seq: 8, destHubId: 'hub_b', waypointIds: [''] }).ok
    ).toBe(false);
    expect(
      validateClientIntent({
        type: 'NAV_PLOT',
        seq: 9,
        destHubId: 'hub_b',
        waypointIds: ['a', 'b', 'c', 'd', 'e'],
      }).ok
    ).toBe(false);
    expect(validateClientIntent({ type: 'NAV_CANCEL', seq: 4 }).ok).toBe(false);
    expect(validateClientIntent({ type: 'DISTRESS', seq: 5 }).ok).toBe(true);
    expect(validateClientIntent({ type: 'DISTRESS' }).ok).toBe(false);
    expect(INTENT_RATE_LIMIT_PER_SECOND.NAV_PLOT).toBe(2);
    expect(INTENT_RATE_LIMIT_PER_SECOND.DISTRESS).toBe(2);
  });

  it('validates cargo intents and rate-limits them at 8Hz', () => {
    expect(validateClientIntent({ type: 'CARGO_PICKUP', seq: 1, crateId: 'c1' }).ok).toBe(true);
    expect(validateClientIntent({ type: 'CARGO_PICKUP', seq: 2 }).ok).toBe(false);
    expect(validateClientIntent({ type: 'CARGO_DROP', seq: 3 }).ok).toBe(true);
    expect(validateClientIntent({ type: 'CARGO_UNPACK', seq: 4, crateIds: ['c1'] }).ok).toBe(true);
    expect(validateClientIntent({ type: 'CARGO_UNPACK', seq: 5, crateIds: [] }).ok).toBe(false);
    expect(
      validateClientIntent({ type: 'CARGO_REPACK', seq: 6, items: [{ goodId: 'scrap', qty: 3 }] })
        .ok
    ).toBe(true);
    expect(
      validateClientIntent({ type: 'CARGO_REPACK', seq: 7, items: [{ goodId: 'scrap', qty: 99 }] })
        .ok
    ).toBe(false);
    expect(validateClientIntent({ type: 'CARGO_REPACK', seq: 8, items: [] }).ok).toBe(false);
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

  it('validates market intents and rate-limits them at 4Hz', () => {
    expect(
      validateClientIntent({
        type: 'MARKET_BUY',
        seq: 1,
        hubId: 'hub_a',
        items: [
          { goodId: 'scrap', qty: 3 },
          { goodId: 'rations', qty: 1 },
        ],
      }).ok
    ).toBe(true);
    expect(
      validateClientIntent({
        type: 'MARKET_BUY',
        seq: 2,
        hubId: 'hub_a',
        items: [{ goodId: 'scrap', qty: 99 }],
      }).ok
    ).toBe(false);
    expect(validateClientIntent({ type: 'MARKET_BUY', seq: 3, hubId: 'hub_a', items: [] }).ok).toBe(
      false
    );
    expect(
      validateClientIntent({ type: 'MARKET_SELL', seq: 4, hubId: 'hub_b', crateIds: ['c1'] }).ok
    ).toBe(true);
    expect(
      validateClientIntent({ type: 'MARKET_SELL', seq: 5, hubId: 'hub_b', crateIds: [] }).ok
    ).toBe(false);
    expect(INTENT_RATE_LIMIT_PER_SECOND.MARKET_BUY).toBe(4);
    expect(INTENT_RATE_LIMIT_PER_SECOND.MARKET_SELL).toBe(4);
  });

  it('builds MARKET_STATE snapshots', () => {
    const state = makeMarketState(
      'hub_a',
      [{ goodId: 'scrap', buyPrice: 10, sellPrice: 9, stock: 48 }],
      46,
      1400
    );
    expect(state.type).toBe('MARKET_STATE');
    expect(state.v).toBe(PROTOCOL_VERSION);
    expect(state.hubId).toBe('hub_a');
    expect(state.listings).toHaveLength(1);
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
        hailS: 0,
        stops: ['hub_b'],
        legIndex: 0,
      },
      44,
      1200
    );
    expect(nav.type).toBe('NAV_STATE');
    expect(nav.v).toBe(PROTOCOL_VERSION);
    expect(nav.thrust01).toBeUndefined();
    const throttled = makeNavState(
      'ship',
      {
        phase: 'in_transit',
        destHubId: 'hub_b',
        remainingS: 87.05,
        legId: 3,
        portHubId: 'hub_a',
        flameout: false,
        hailS: 0,
        stops: ['hub_b'],
        legIndex: 0,
        thrust01: 0.5,
      },
      44,
      1200
    );
    expect(throttled.thrust01).toBe(0.5);
    expect(nav.legTotalS).toBeUndefined();
    const totaled = makeNavState(
      'ship',
      {
        phase: 'in_transit',
        destHubId: 'hub_b',
        remainingS: 87.05,
        legId: 3,
        portHubId: 'hub_a',
        flameout: false,
        hailS: 0,
        stops: ['hub_b'],
        legIndex: 0,
        legTotalS: 33.3,
      },
      44,
      1200
    );
    expect(totaled.legTotalS).toBe(33.3);
    expect(nav.remainingS).toBe(87.1);
    expect(nav.legId).toBe(3);
    expect(nav.stops).toEqual(['hub_b']);
    expect(nav.legIndex).toBe(0);
    expect(nav.hailS).toBe(0);
  });

  it('builds CHART_STATE snapshots', () => {
    const chart = makeChartState(
      'ship',
      [{ id: 'hub_a', kind: 'hub', label: 'NEW ANCHORAGE', short: 'ANCHORAGE', known: true }],
      44,
      1200
    );
    expect(chart.type).toBe('CHART_STATE');
    expect(chart.v).toBe(PROTOCOL_VERSION);
    expect(chart.nodes).toHaveLength(1);
    expect(chart.nodes[0]).toMatchObject({ id: 'hub_a', known: true });
  });
});
