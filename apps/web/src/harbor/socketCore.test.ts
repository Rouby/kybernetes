import type {
  ManifestBroadcast,
  NavStateBroadcast,
  ShipLostBroadcast,
  ShipStatusBroadcast,
  ShipSystemsBroadcast,
  SnapshotBroadcast,
  TelemetryBroadcast,
  VitalsBroadcast,
  WatchBroadcast,
} from '@kybernetes/protocol';
import { describe, expect, it, vi } from 'vitest';
import { createHarborCaches, type HarborCaches, handleMessage } from './socketCore';

function setters() {
  return {
    snapshot: null as SnapshotBroadcast | null,
    telemetry: null as TelemetryBroadcast | null,
    vitals: null as VitalsBroadcast | null,
    watch: null as WatchBroadcast | null,
    manifest: null as ManifestBroadcast | null,
    shipSystems: null as ShipSystemsBroadcast | null,
    shipStatus: null as ShipStatusBroadcast | null,
    shipLost: null as ShipLostBroadcast | null,
    navState: null as NavStateBroadcast | null,
    calls: { snapshot: 0, telemetry: 0, manifest: 0, watch: 0, systems: 0, status: 0, nav: 0 },
  };
}

function navMessage(tick: number) {
  return {
    type: 'NAV_STATE',
    v: 2,
    tick,
    serverTimeMs: tick * 100,
    vesselId: 'ship',
    phase: 'in_transit',
    destHubId: 'hub_b',
    remainingS: 87.1,
    legId: 3,
    portHubId: 'hub_a',
    flameout: false,
  };
}

function wire(store: ReturnType<typeof setters>) {
  return {
    setSnapshot: vi.fn((s: SnapshotBroadcast) => {
      store.snapshot = s;
      store.calls.snapshot += 1;
    }),
    setTelemetry: vi.fn((t: TelemetryBroadcast) => {
      store.telemetry = t;
      store.calls.telemetry += 1;
    }),
    setVitals: vi.fn((v: VitalsBroadcast) => {
      store.vitals = v;
    }),
    setWatch: vi.fn((w: WatchBroadcast) => {
      store.watch = w;
      store.calls.watch += 1;
    }),
    setManifest: vi.fn((m: ManifestBroadcast) => {
      store.manifest = m;
      store.calls.manifest += 1;
    }),
    setOffer: vi.fn(),
    setPawnId: vi.fn(),
    setNotices: vi.fn(),
    setShipSystems: vi.fn((s: ShipSystemsBroadcast) => {
      store.shipSystems = s;
      store.calls.systems += 1;
    }),
    setShipStatus: vi.fn((s: ShipStatusBroadcast) => {
      store.shipStatus = s;
      store.calls.status += 1;
    }),
    setShipLost: vi.fn((d: ShipLostBroadcast | null) => {
      store.shipLost = d;
    }),
    setNavState: vi.fn((n: NavStateBroadcast) => {
      store.navState = n;
      store.calls.nav += 1;
    }),
  };
}

function fullSnapshot(tick: number): SnapshotBroadcast {
  return {
    type: 'SNAPSHOT',
    v: 2,
    tick,
    serverTimeMs: tick * 100,
    pawns: [],
    impacts: [],
    portals: [{ id: 'station.door', open: false, state: 'closed' }],
    projectiles: [],
    frames: [],
    full: true,
    portalRev: 7,
    frameRev: 3,
  };
}

describe('harbor socket merge guards', () => {
  it('accepts full snapshots and drops stale ticks', () => {
    const caches: HarborCaches = createHarborCaches();
    const store = setters();
    handleMessage(JSON.stringify(fullSnapshot(10)), caches, wire(store));
    expect(store.snapshot?.tick).toBe(10);
    handleMessage(JSON.stringify(fullSnapshot(9)), caches, wire(store));
    expect(store.snapshot?.tick).toBe(10);
    expect(store.calls.snapshot).toBe(1);
  });

  it('ignores deltas without a base and merges newer ones', () => {
    const caches: HarborCaches = createHarborCaches();
    const store = setters();
    const delta = {
      type: 'SNAPSHOT_DELTA',
      v: 2,
      tick: 11,
      serverTimeMs: 1100,
      baseTick: 10,
      full: false,
      portalRev: 8,
      frameRev: 3,
      pawns: [],
      impacts: [],
      portals: [{ id: 'station.door', open: true, state: 'open' }],
      removedPortalIds: [],
      projectiles: [],
      frames: [],
    };
    handleMessage(JSON.stringify(delta), caches, wire(store));
    expect(store.snapshot).toBeNull();
    handleMessage(JSON.stringify(fullSnapshot(10)), caches, wire(store));
    handleMessage(JSON.stringify(delta), caches, wire(store));
    expect(store.snapshot?.tick).toBe(11);
    expect(store.snapshot?.portals[0]?.open).toBe(true);
    expect(store.snapshot?.portalRev).toBe(8);
  });

  it('accepts ship systems and status while dropping stale ticks', () => {
    const caches: HarborCaches = createHarborCaches();
    const store = setters();
    const systems = {
      type: 'SHIP_SYSTEMS',
      v: 2,
      tick: 30,
      serverTimeMs: 3000,
      vesselId: 'ship',
      tempK: 660,
      bandLo: 620,
      bandHi: 700,
      rods: 0.3,
      coolant: 0.5,
      outputMW: 31,
      demandMW: 28,
      scrammed: false,
      warned: false,
      spool: 1,
      tune: 0.8,
      wear: 0,
      brownout: false,
      condition: 100,
    };
    handleMessage(JSON.stringify(systems), caches, wire(store));
    expect(store.shipSystems?.tick).toBe(30);
    handleMessage(JSON.stringify({ ...systems, tick: 29 }), caches, wire(store));
    expect(store.shipSystems?.tick).toBe(30);
    expect(store.calls.systems).toBe(1);
    const status = {
      type: 'SHIP_STATUS',
      v: 2,
      tick: 31,
      serverTimeMs: 3100,
      shipId: 'ship:u1',
      hullId: 'skiff_alpha',
      reactorTier: 0,
      engineTier: 0,
      credits: 20,
      condition: 100,
      locationHubId: 'hub_a',
      alive: true,
      stores: { rations: 2, waterL: 4, o2Cells: 2, fuelCells: 1 },
    };
    handleMessage(JSON.stringify(status), caches, wire(store));
    expect(store.shipStatus?.shipId).toBe('ship:u1');
    expect(store.calls.status).toBe(1);
  });

  it('accepts cargo state while dropping stale ticks', () => {
    const caches: HarborCaches = createHarborCaches();
    const store = setters();
    const sockets = { ...wire(store), setCargoState: vi.fn() };
    const cargo = {
      type: 'CARGO_STATE',
      v: 2,
      tick: 60,
      serverTimeMs: 6000,
      vesselId: 'ship',
      secured: [{ goodId: 'scrap', qty: 5 }],
      carriedByPawn: { 'pawn:u1': 'c1' },
    };
    handleMessage(JSON.stringify(cargo), caches, sockets);
    expect(sockets.setCargoState).toHaveBeenCalledTimes(1);
    handleMessage(JSON.stringify({ ...cargo, tick: 59 }), caches, sockets);
    expect(sockets.setCargoState).toHaveBeenCalledTimes(1);
  });

  it('carries crates through full snapshots and deltas', () => {
    const caches: HarborCaches = createHarborCaches();
    const store = setters();
    const sockets = wire(store);
    handleMessage(
      JSON.stringify({
        ...fullSnapshot(10),
        crates: [
          { id: 'c1', goodId: 'scrap', qty: 2, where: 'bayFloor', frameId: 'station', x: 1, y: 2 },
        ],
      }),
      caches,
      sockets
    );
    expect(store.snapshot?.crates?.length).toBe(1);
  });

  it('accepts per-hub market states while dropping stale ticks', () => {
    const caches: HarborCaches = createHarborCaches();
    const store = setters();
    const sockets = { ...wire(store), setMarketState: vi.fn() };
    const market = {
      type: 'MARKET_STATE',
      v: 2,
      tick: 70,
      serverTimeMs: 7000,
      hubId: 'hub_a',
      listings: [{ goodId: 'scrap', buyPrice: 10, sellPrice: 9, stock: 48 }],
    };
    handleMessage(JSON.stringify(market), caches, sockets);
    expect(sockets.setMarketState).toHaveBeenCalledTimes(1);
    handleMessage(JSON.stringify({ ...market, tick: 69 }), caches, sockets);
    expect(sockets.setMarketState).toHaveBeenCalledTimes(1);
    handleMessage(JSON.stringify({ ...market, hubId: 'hub_b', tick: 69 }), caches, sockets);
    expect(sockets.setMarketState).toHaveBeenCalledTimes(2);
  });

  it('accepts nav state while dropping stale ticks', () => {
    const caches: HarborCaches = createHarborCaches();
    const store = setters();
    handleMessage(JSON.stringify(navMessage(50)), caches, wire(store));
    expect(store.navState?.phase).toBe('in_transit');
    expect(store.navState?.legId).toBe(3);
    handleMessage(JSON.stringify(navMessage(49)), caches, wire(store));
    expect(store.navState?.tick).toBe(50);
    expect(store.calls.nav).toBe(1);
  });

  it('records ship loss and clears it on the next join', () => {
    const caches: HarborCaches = createHarborCaches();
    const store = setters();
    const sockets = wire(store);
    handleMessage(
      JSON.stringify({
        type: 'SHIP_LOST',
        v: 2,
        tick: 40,
        serverTimeMs: 4000,
        shipId: 'ship:u1',
        reason: 'reactor',
      }),
      caches,
      sockets
    );
    expect(store.shipLost?.shipId).toBe('ship:u1');
    handleMessage(
      JSON.stringify({
        type: 'JOINED',
        v: 2,
        tick: 41,
        serverTimeMs: 4100,
        pawnId: 'pawn:u1',
        beacon: 'ship:u1',
      }),
      caches,
      sockets
    );
    expect(store.shipLost).toBeNull();
  });

  it('merges delta telemetry onto cached rooms', () => {
    const caches: HarborCaches = createHarborCaches();
    const store = setters();
    const room = {
      roomId: 'station.lobby',
      pressureKpa: 101.3,
      tempCelsius: 21,
      o2Percent: 20.9,
      co2Ppm: 400,
      repressurizing: false,
    };
    const full: TelemetryBroadcast = {
      type: 'TELEMETRY',
      v: 2,
      tick: 20,
      serverTimeMs: 2000,
      subsystems: {},
      full: true,
      atmos: [room],
    };
    handleMessage(JSON.stringify(full), caches, wire(store));
    const delta: TelemetryBroadcast = {
      ...full,
      tick: 21,
      full: false,
      atmos: [{ ...room, pressureKpa: 12.5 }],
    };
    handleMessage(JSON.stringify(delta), caches, wire(store));
    expect(store.telemetry?.atmos).toHaveLength(1);
    expect(store.telemetry?.atmos[0]?.pressureKpa).toBe(12.5);
    expect(store.calls.telemetry).toBe(2);
  });

  it('skips same-rev manifests but applies watch countdowns', () => {
    const caches: HarborCaches = createHarborCaches();
    const store = setters();
    const manifest: ManifestBroadcast = {
      type: 'MANIFEST',
      v: 2,
      tick: 30,
      serverTimeMs: 3000,
      beacon: 'HESP01',
      shipName: 'CSS Hesperia',
      rev: 99,
      crew: [],
    };
    handleMessage(JSON.stringify(manifest), caches, wire(store));
    handleMessage(JSON.stringify({ ...manifest, tick: 31 }), caches, wire(store));
    expect(store.calls.manifest).toBe(1);
    const watch: WatchBroadcast = {
      type: 'WATCH',
      v: 2,
      tick: 30,
      serverTimeMs: 3000,
      watchNo: 1,
      section: 'alpha',
      phase: 'active_watch',
      remainingS: 20,
      checklist: [],
      grade: 'A',
      rev: 5,
    };
    handleMessage(JSON.stringify(watch), caches, wire(store));
    handleMessage(JSON.stringify({ ...watch, tick: 31 }), caches, wire(store));
    expect(store.calls.watch).toBe(1);
    handleMessage(JSON.stringify({ ...watch, tick: 32, remainingS: 19 }), caches, wire(store));
    expect(store.calls.watch).toBe(2);
    expect(store.watch?.remainingS).toBe(19);
  });

  it('drops malformed JSON without calling setters', () => {
    const caches: HarborCaches = createHarborCaches();
    const store = setters();
    const ui = wire(store);
    handleMessage('not json{{{', caches, ui);
    expect(ui.setSnapshot).not.toHaveBeenCalled();
    expect(ui.setManifest).not.toHaveBeenCalled();
  });
});
