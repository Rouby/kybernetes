import type {
  ManifestBroadcast,
  SnapshotBroadcast,
  SnapshotPawn,
  TelemetryBroadcast,
  VitalsBroadcast,
} from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import {
  aimPoint,
  bareId,
  breachCountsByRoom,
  breachFlowVectors,
  callsignFor,
  frameOrigins,
  mapAtmos,
  mapBreaches,
  mapKineticAmmo,
  mapPawn,
  mapPredictedProjectiles,
  mapRemotePawns,
  mapServerProjectiles,
  mapTelemetry,
  mapVitals,
  mergeSnapshotDelta,
  mergeTelemetry,
  pawnWorld,
  roomO2,
  roomWindVectors,
  shipOffsetOf,
  snapshotAgeS,
  syncDoors,
  ventedBareIds,
} from './renderState';

function pawn(over: Partial<SnapshotPawn> = {}): SnapshotPawn {
  return {
    id: 'pawn:u1',
    x: 300,
    y: 200,
    vx: 0,
    vy: 0,
    facing: 0,
    frameId: 'station',
    roomHint: 'station.lobby',
    color: '#ffd166',
    ...over,
  };
}

function snapshot(over: Partial<SnapshotBroadcast> = {}): SnapshotBroadcast {
  return {
    type: 'SNAPSHOT',
    v: 2,
    tick: 100,
    serverTimeMs: 5000,
    pawns: [pawn()],
    impacts: [],
    portals: [{ id: 'station.lobby_bay', open: false, state: 'closed' }],
    projectiles: [],
    frames: [{ id: 'ship', originX: 1400, originY: 0, angle: 0 }],
    ...over,
  };
}

function telemetry(over: Partial<TelemetryBroadcast> = {}): TelemetryBroadcast {
  return {
    type: 'TELEMETRY',
    v: 2,
    tick: 100,
    serverTimeMs: 5000,
    subsystems: { hull: 100, atmos: 100, watch: 100, crew: 4 },
    atmos: [
      {
        roomId: 'station.lobby',
        pressureKpa: 101.3,
        tempCelsius: 21,
        o2Percent: 20.9,
        co2Ppm: 400,
        repressurizing: false,
      },
    ],
    ...over,
  };
}

function vitals(over: Partial<VitalsBroadcast['vitals']> = {}): VitalsBroadcast {
  return {
    type: 'VITALS',
    v: 2,
    tick: 100,
    serverTimeMs: 5000,
    vitals: {
      hunger: 100,
      thirst: 100,
      fatigue: 0,
      health: 100,
      hypoxia: 0,
      suitSealed: false,
      ammo: 30,
      reserve: 120,
      mags: [30, 30, 30, 30],
      reloading: false,
      ...over,
    },
    credits: 200,
    clearance: 2,
  };
}

function manifest(): ManifestBroadcast {
  return {
    type: 'MANIFEST',
    v: 2,
    tick: 100,
    serverTimeMs: 5000,
    beacon: 'HESP01',
    shipName: 'CSS Hesperia',
    crew: [{ id: 'pawn:u1', callsign: 'Rook', role: 'engineer', frameId: 'station' }],
  };
}

describe('render-state mapping', () => {
  it('strips namespaced ids and passes bare ones through', () => {
    expect(bareId('ship.corridor')).toBe('corridor');
    expect(bareId('lobby')).toBe('lobby');
  });

  it('resolves frame origins with snapshot overrides', () => {
    const origins = frameOrigins(snapshot());
    expect(origins.get('station')).toEqual({ x: 0, y: 0 });
    expect(origins.get('ship')).toEqual({ x: 1400, y: 0 });
    expect(origins.get('void')).toBeUndefined();
  });

  it('places pawns in world space preferring predictions', () => {
    const origins = frameOrigins(snapshot());
    expect(pawnWorld(pawn(), origins, null)).toEqual({ x: 300, y: 200 });
    expect(pawnWorld(pawn(), origins, { x: 310, y: 205, facing: 0 })).toEqual({ x: 310, y: 205 });
    expect(pawnWorld(pawn({ frameId: 'ship', x: 100, y: 100 }), origins, null)).toEqual({
      x: 1500,
      y: 100,
    });
  });

  it('maps pawns with identity, bots, and voice lines', () => {
    const mapped = mapPawn(pawn(), 'Rook', { x: 300, y: 200 }, 1.5, 9000);
    expect(mapped.callsign).toBe('Rook');
    expect(mapped.facingAngle).toBe(1.5);
    expect(mapped.isBot).toBe(false);
    expect(mapped.speechBubble).toBeUndefined();
    expect(mapPawn(pawn({ id: 'npc:ship:cook' }), 'Cookie', { x: 0, y: 0 }, 0, 9000).isBot).toBe(
      true
    );
    const said = mapPawn(pawn({ say: 'Aye' }), 'Rook', { x: 0, y: 0 }, 0, 9000);
    expect(said.speechBubble?.text).toBe('Aye');
    expect(said.speechBubble?.expiresAt).toBe(12000);
  });

  it('resolves callsigns from the manifest with id fallbacks', () => {
    expect(callsignFor(manifest(), 'pawn:u1')).toBe('Rook');
    expect(callsignFor(manifest(), 'pawn:u9')).toBe('u9');
    expect(callsignFor(null, 'captain:ship')).toBe('ship');
  });

  it('syncs door states and treats destroyed doors as open', () => {
    const base = [
      {
        id: 'station.lobby_bay',
        name: 'Lobby Bay Hatch',
        x1: 600,
        y1: 160,
        x2: 600,
        y2: 240,
        isOpen: false,
        isAirlock: false,
        roomA: 'station.lobby',
        roomB: 'station.bay',
      },
    ];
    expect(syncDoors(base, snapshot())).toBe(base);
    const opened = syncDoors(
      base,
      snapshot({ portals: [{ id: 'station.lobby_bay', open: true, state: 'open' }] })
    );
    expect(opened[0]?.isOpen).toBe(true);
    const destroyed = syncDoors(
      base,
      snapshot({ portals: [{ id: 'station.lobby_bay', open: false, state: 'destroyed' }] })
    );
    expect(destroyed[0]?.isOpen).toBe(true);
  });

  it('maps atmos rooms with vent flags and o2 index', () => {
    const rooms = mapAtmos(telemetry());
    expect(rooms.lobby?.pressureKpa).toBe(101.3);
    expect(rooms.lobby?.isVenting).toBe(false);
    expect(mapAtmos(null)).toEqual({});
    expect(ventedBareIds(telemetry())).toEqual([]);
    const vacuum = telemetry({
      atmos: [
        {
          roomId: 'ship.bridge',
          pressureKpa: 5,
          tempCelsius: -40,
          o2Percent: 2,
          co2Ppm: 100,
          repressurizing: false,
        },
      ],
    });
    expect(ventedBareIds(vacuum)).toEqual(['bridge']);
    expect(roomO2(mapAtmos(vacuum))).toEqual({ bridge: 2 });
  });

  it('maps live breach geometry from snapshot portals', () => {
    const hole = {
      id: 'breach.ship.bridge.12.3',
      open: false,
      state: 'destroyed' as const,
      areaM2: 0.05,
      bornTick: 90,
      roomA: 'ship.bridge',
      x1: 100,
      y1: 200,
      x2: 124,
      y2: 200,
    };
    const models = mapBreaches(snapshot({ tick: 100, portals: [hole] }));
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      id: 'breach.ship.bridge.12.3',
      frameId: 'ship',
      roomA: 'ship.bridge',
      areaM2: 0.05,
      bornTick: 90,
      ageTicks: 10,
      sizeClass: 'puncture',
    });
    expect(models[0]?.cx).toBe(112);
    const grown = mapBreaches(
      snapshot({
        portals: [{ ...hole, areaM2: 1.2 }],
      })
    );
    expect(grown[0]?.sizeClass).toBe('breach');
  });

  it('skips portals without wire geometry and null snapshots', () => {
    expect(mapBreaches(null)).toEqual([]);
    expect(mapBreaches(snapshot())).toEqual([]);
    const legacy = snapshot({
      portals: [{ id: 'breach.bridge.1.0', open: false, state: 'destroyed' }],
    });
    expect(mapBreaches(legacy)).toEqual([]);
  });

  it('joins throat flows onto breach axes and averages room winds', () => {
    const hole = {
      id: 'breach.ship.bridge.12.3',
      open: false,
      state: 'destroyed' as const,
      areaM2: 1.2,
      bornTick: 90,
      roomA: 'ship.bridge',
      x1: 100,
      y1: 200,
      x2: 124,
      y2: 200,
    };
    const breaches = mapBreaches(snapshot({ portals: [hole] }));
    const vectors = breachFlowVectors(breaches, [{ portalId: hole.id, velocityMps: 20 }]);
    const vec = vectors.get(hole.id);
    expect(Math.hypot(vec?.x ?? 0, vec?.y ?? 0)).toBeCloseTo(20);
    const still = breachFlowVectors(breaches, []).get(hole.id);
    expect(Math.hypot(still?.x ?? 999, still?.y ?? 999)).toBe(0);
    const winds = roomWindVectors(breaches, [{ portalId: hole.id, velocityMps: 20 }]);
    expect(Math.hypot(winds.bridge?.x ?? 0, winds.bridge?.y ?? 0)).toBeGreaterThan(100);
    expect(roomWindVectors(breaches, [])).toEqual({});
    expect(breachCountsByRoom(breaches)).toEqual({ bridge: 1 });
  });

  it('fills winds and breach counts on atmos rooms', () => {
    const rooms = mapAtmos(telemetry(), { lobby: { x: 120, y: -40 } }, { lobby: 2 });
    expect(rooms.lobby?.windX).toBe(120);
    expect(rooms.lobby?.windY).toBe(-40);
    expect(rooms.lobby?.activeBreaches).toBe(2);
    expect(mapAtmos(telemetry()).lobby?.windX).toBe(0);
  });

  it('maps vitals with derived stamina and incapacitation', () => {
    expect(mapVitals(null)).toBeUndefined();
    const mapped = mapVitals(vitals({ fatigue: 20, health: 0 }));
    expect(mapped?.stamina).toBe(80);
    expect(mapped?.incapacitated.isIncapacitated).toBe(true);
    expect(mapped?.suit.integrityPercent).toBe(100);
    expect(mapped?.hypoxiaPercent).toBe(0);
  });

  it('maps telemetry gauges with hull-driven alerts and breach rooms', () => {
    const nominal = mapTelemetry(snapshot(), telemetry(), manifest(), {});
    expect(nominal.shipName).toBe('CSS Hesperia');
    expect(nominal.alertLevel).toBe('nominal');
    expect(nominal.hull.breaches).toEqual([]);
    const battered = mapTelemetry(
      snapshot({ portals: [{ id: 'ship.door_bridge', open: false, state: 'destroyed' }] }),
      telemetry({ subsystems: { hull: 60, atmos: 40, watch: 100, crew: 4 } }),
      manifest(),
      {}
    );
    expect(battered.alertLevel).toBe('yellow');
    expect(battered.hull.status).toBe('degraded');
    expect(battered.hull.breaches).toEqual(['ship.door_bridge']);
    expect(battered.oxygenLevelPercent).toBe(40);
  });

  it('merges snapshot deltas onto the cached full table', () => {
    const base = snapshot();
    const firstPawn = base.pawns[0];
    if (firstPawn === undefined) throw new Error('expected a pawn');
    const pawnMoved = { ...firstPawn, x: 310 };
    const merged = mergeSnapshotDelta(base, {
      type: 'SNAPSHOT_DELTA',
      v: 2,
      tick: 101,
      serverTimeMs: 5100,
      baseTick: 100,
      full: false,
      portalRev: 2,
      frameRev: 1,
      pawns: [pawnMoved],
      impacts: [],
      portals: [{ id: 'station.lobby_bay', open: true, state: 'open' }],
      removedPortalIds: [],
      projectiles: [],
      frames: [],
    });
    expect(merged.tick).toBe(101);
    expect(merged.pawns[0]?.x).toBe(310);
    expect(merged.portals).toHaveLength(1);
    expect(merged.portals[0]?.open).toBe(true);
    expect(merged.frames).toHaveLength(1);
    expect(merged.portalRev).toBe(2);
  });

  it('merges delta telemetry atmos by room id', () => {
    const full = telemetry();
    const firstRoom = full.atmos[0];
    if (firstRoom === undefined) throw new Error('expected a room');
    const changedRoom = { ...firstRoom, pressureKpa: 12.5 };
    const merged = mergeTelemetry(full, { ...full, tick: 101, full: false, atmos: [changedRoom] });
    expect(merged.atmos).toHaveLength(1);
    expect(merged.atmos[0]?.pressureKpa).toBe(12.5);
    expect(mergeTelemetry(null, full)).toBe(full);
    expect(mergeTelemetry(full, full).atmos).toHaveLength(1);
  });

  it('keeps portal wind across atmos deltas unless replaced', () => {
    const windy = telemetry({ flows: [{ portalId: 'station.lobby_bay', velocityMps: 4.2 }] });
    const delta = { ...windy, tick: 101, full: false as const, atmos: [] };
    expect(mergeTelemetry(windy, delta).flows).toEqual([
      { portalId: 'station.lobby_bay', velocityMps: 4.2 },
    ]);
    const still = { ...windy, tick: 102, full: false as const, atmos: [], flows: [] };
    expect(mergeTelemetry(windy, still).flows).toEqual([]);
  });

  it('maps projectile views with origins, age, and weapon kinds', () => {
    const origins = new Map([
      ['station', { x: 0, y: 0 }],
      ['ship', { x: 1400, y: 0 }],
    ]);
    const server = mapServerProjectiles(
      [
        { id: 's1', frameId: 'ship', x: 100, y: 200, vx: 600, vy: 0, weapon: 'kinetic_carbine' },
        { id: 's2', frameId: 'station', x: 10, y: 20, vx: 0, vy: -600, weapon: 'arc_welder' },
      ],
      origins,
      0.1
    );
    // 600px/s over 0.1s of age flies 60px past the snapshot position.
    expect(server[0]).toMatchObject({
      id: 's1',
      x: 1560,
      y: 200,
      weaponType: 'kinetic_carbine',
    });
    expect(server[1]).toMatchObject({ x: 10, y: -40, weaponType: 'arc_welder' });
    expect(mapServerProjectiles(undefined, origins, 0.1)).toEqual([]);
    const predicted = mapPredictedProjectiles(
      [
        {
          id: 7,
          frameId: 'ship',
          x: 50,
          y: 60,
          vx: 600,
          vy: 0,
          bornMs: 1,
          weapon: 'kinetic_carbine',
        },
      ],
      origins
    );
    expect(predicted[0]).toMatchObject({ id: 'pred:7', x: 1450, y: 60 });
    expect(mapPredictedProjectiles([], origins)).toEqual([]);
  });

  it('maps remotes and the ship offset for the renderer', () => {
    const base = snapshot();
    expect(mapRemotePawns(base, 'pawn:u1', manifest(), frameOrigins(base))).toEqual([]);
    expect(mapRemotePawns(base, null, manifest(), frameOrigins(base))).toHaveLength(1);
    expect(shipOffsetOf(frameOrigins(base))).toEqual({ x: 1400, y: 0 });
    expect(shipOffsetOf(new Map([['ship', { x: 1, y: 2 }]]))).toEqual({ x: 1, y: 2 });
    expect(shipOffsetOf(new Map())).toEqual({ x: 1400, y: 0 });
  });

  it('maps ammo and aim fallbacks without branches in the viewport', () => {
    expect(mapKineticAmmo(null)).toBeUndefined();
    expect(mapKineticAmmo(vitals())).toMatchObject({ current: 30, isReloading: false });
    expect(aimPoint({ x: 1, y: 2 }, { x: 0, y: 0 })).toEqual({ x: 1, y: 2 });
    expect(aimPoint(null, { x: 10, y: 20 })).toEqual({ x: 60, y: 20 });
  });

  it('times projectile extrapolation from snapshot arrival, not wall clock', () => {
    // A fresh arrival extrapolates nothing yet; 80ms later a 600px/s round
    // has flown ~48px, so the dead zone between 10Hz deltas stays covered.
    expect(snapshotAgeS(1000, 1000)).toBe(0);
    expect(snapshotAgeS(1000, 1080)).toBeCloseTo(0.08, 10);
    // Stale snapshots pin at the cap instead of overshooting past the next delta.
    expect(snapshotAgeS(1000, 2000)).toBe(0.15);
    // Clock skew and bad stamps never rewind or explode the offset.
    expect(snapshotAgeS(2000, 1000)).toBe(0);
    expect(snapshotAgeS(Number.NaN, 1000)).toBe(0);
    expect(snapshotAgeS(1000, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
