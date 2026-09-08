import type {
  ManifestBroadcast,
  SnapshotBroadcast,
  TelemetryBroadcast,
  VitalsBroadcast,
  WatchBroadcast,
} from '@kybernetes/protocol';
import { describe, expect, it, vi } from 'vitest';
import { createHarborCaches, type HarborCaches, handleMessage } from './useHarborSocket';

function setters() {
  return {
    snapshot: null as SnapshotBroadcast | null,
    telemetry: null as TelemetryBroadcast | null,
    vitals: null as VitalsBroadcast | null,
    watch: null as WatchBroadcast | null,
    manifest: null as ManifestBroadcast | null,
    calls: { snapshot: 0, telemetry: 0, manifest: 0, watch: 0 },
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
